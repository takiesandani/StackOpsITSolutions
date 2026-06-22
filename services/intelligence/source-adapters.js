const { buildIdentityDashboardSource } = require('./identity-dashboard-source');

function parseJsonValue(value) {
    if (value == null || typeof value !== 'string') return value;
    const trimmed = value.trim();
    if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) return value;
    try {
        return JSON.parse(trimmed);
    } catch (_) {
        return value;
    }
}

function normalizeRow(row) {
    if (!row) return null;
    return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, parseJsonValue(value)]));
}

function toDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function findTimestamp(value) {
    if (!value || typeof value !== 'object') return null;
    const direct = value.LastUpdated || value.last_updated || value.UpdatedAt || value.updated_at ||
        value.CreatedAt || value.fetchedAt || value.generatedAt || value.InvoiceDate || null;
    const directDate = toDate(direct);
    if (directDate) return directDate;
    for (const payloadKey of ['Payload', 'UsersPayload', 'AssignmentsPayload']) {
        const nestedDate = toDate(value[payloadKey]?.fetchedAt || value[payloadKey]?.generatedAt);
        if (nestedDate) return nestedDate;
    }
    return null;
}

function getFreshness(records, thresholdMinutes) {
    const dates = records.map(findTimestamp).filter(Boolean);
    const lastUpdated = dates.length
        ? new Date(Math.max(...dates.map(date => date.getTime())))
        : null;
    const ageMinutes = lastUpdated
        ? Math.max(0, Math.floor((Date.now() - lastUpdated.getTime()) / 60000))
        : null;
    return {
        lastUpdated: lastUpdated ? lastUpdated.toISOString() : null,
        ageMinutes,
        stale: thresholdMinutes != null && ageMinutes != null && ageMinutes > thresholdMinutes
    };
}

function statusResult(capability, status, overrides = {}) {
    return {
        sourceKey: capability.sourceKey,
        displayName: capability.displayName,
        status,
        isExpected: capability.isExpected,
        freshness: { lastUpdated: null, ageMinutes: null },
        metrics: {},
        evidence: [],
        warnings: [],
        rawReference: { table: null, recordId: null },
        errorMessage: null,
        ...overrides
    };
}

function notApplicableResult(capability) {
    if (!capability.isExpected) {
        return statusResult(capability, 'not_expected', {
            warnings: [`${capability.displayName} is not expected for this tenant profile.`]
        });
    }
    if (!capability.isEnabled || capability.configuration?.configured === false) {
        return statusResult(capability, 'not_configured', {
            warnings: [`${capability.displayName} is disabled or not configured for this tenant.`]
        });
    }
    return null;
}

async function queryRows(pool, sql, params) {
    const [rows] = await pool.query(sql, params);
    return rows.map(normalizeRow);
}

async function hasActiveMicrosoftTenant(pool, companyId) {
    const rows = await queryRows(
        pool,
        'SELECT ID FROM CompanyMicrosoftMapping WHERE CompanyID = ? AND IsActive = 1 LIMIT 1',
        [companyId]
    );
    return rows.length > 0;
}

function extractPayload(row, field = 'Payload') {
    return row?.[field] ?? null;
}

function primitiveMetrics(row, excluded = []) {
    if (!row || typeof row !== 'object') return {};
    const ignored = new Set(['ID', 'CompanyID', 'LastUpdated', 'CreatedAt', ...excluded]);
    return Object.fromEntries(Object.entries(row).filter(([key, value]) =>
        !ignored.has(key) && ['string', 'number', 'boolean'].includes(typeof value)
    ));
}

function summaryMetrics(payload) {
    if (!payload || typeof payload !== 'object') return {};
    return payload.summary || payload.overview || primitiveMetrics(payload, ['success', 'fetchedAt']);
}

async function collectSource(context, definition) {
    const { pool, companyId, capability, refresh, refreshSource } = context;
    const notApplicable = notApplicableResult(capability);
    if (notApplicable) return notApplicable;

    let loaded;
    let supplementalLoadWarning = null;
    let refreshWarning = null;
    let refreshErrorMessage = null;
    let refreshFailed = false;
    
    try {
        loaded = await definition.load(pool, companyId, capability);
    } catch (error) {
        if (!definition.continueWhenStoredEvidenceFails) {
            return statusResult(capability, 'error', {
                warnings: [`${capability.displayName} could not be read from StackCTRL storage.`],
                errorMessage: error.message
            });
        }
        // Live source metrics remain usable when optional historical evidence cannot be loaded.
        supplementalLoadWarning = `${capability.displayName} stored evidence could not be loaded: ${error.message}`;
        loaded = { records: [], metrics: {}, evidence: [], warnings: [] };
    }

    let records = loaded.records || [];
    let freshness = getFreshness(records, capability.freshnessThresholdMinutes);
    const shouldRefresh = capability.refreshMode !== 'stored_only' && (
        (refresh && (!records.length || freshness.stale)) ||
        (definition.refreshWhenMissing && !records.length)
    );

    if (shouldRefresh && typeof refreshSource === 'function') {
        try {
            const refreshed = await refreshSource(capability.sourceKey, companyId);
            if (refreshed) {
                loaded = definition.fromRefresh
                    ? definition.fromRefresh(refreshed, loaded)
                    : { ...loaded, ...refreshed };
                records = loaded.records || [];
                freshness = getFreshness(records, capability.freshnessThresholdMinutes);
                // Clear any previous refresh error since it succeeded
                refreshFailed = false;
                refreshErrorMessage = null;
            } else {
                // Refresh returned null - reload from storage
                loaded = await definition.load(pool, companyId, capability);
                records = loaded.records || [];
                freshness = getFreshness(records, capability.freshnessThresholdMinutes);
            }
        } catch (error) {
            refreshFailed = true;
            refreshErrorMessage = error.message;
            const notConfigured = error.statusCode === 503 || /missing|not configured|credentials/i.test(error.message);
            const isRefreshError = error.isRefreshError === true;
            
            console.warn(`[Intelligence Source] ${capability.displayName} refresh error:`, {
                sourceKey: capability.sourceKey,
                companyId,
                errorMessage: error.message,
                isRefreshError,
                notConfigured,
                hasStoredData: records.length > 0
            });
            
            if (!records.length) {
                // No stored data - must fail
                return statusResult(capability, notConfigured ? 'not_configured' : 'error', {
                    warnings: [
                        ...(supplementalLoadWarning ? [supplementalLoadWarning] : []),
                        `${capability.displayName} refresh failed: ${error.message}`
                    ],
                    errorMessage: error.message
                });
            }
            
            // Has stored data - mark as stale/refresh failed
            refreshWarning = `${capability.displayName} refresh failed; the stored evidence was retained: ${error.message}`;
        }
    }

    if (!records.length) {
        const missingStatus = loaded.notConfigured ? 'not_configured' : 'missing';
        return statusResult(capability, missingStatus, {
            warnings: loaded.warnings?.length
                ? loaded.warnings
                : [`${capability.displayName} has no stored evidence for this tenant.`],
            rawReference: loaded.rawReference || { table: definition.table || null, recordId: null }
        });
    }

    // If refresh failed and we're falling back to stored data, mark as stale
    const status = refreshFailed ? 'stale' : (freshness.stale ? 'stale' : 'available');
    const warnings = [...(loaded.warnings || [])];
    if (supplementalLoadWarning) warnings.push(supplementalLoadWarning);
    if (freshness.stale) warnings.push(`${capability.displayName} evidence is stale.`);
    if (refreshWarning) warnings.push(refreshWarning);

    return statusResult(capability, status, {
        freshness: {
            lastUpdated: freshness.lastUpdated,
            ageMinutes: freshness.ageMinutes
        },
        credentialSource: capability.sourceKey === 'identity' ? 'environment' : 'database',  // NEW: Track credential path
        credentialPath: capability.sourceKey === 'identity' 
            ? 'MICROSOFT_CLIENT_SECRET (Azure Key Vault, shared with dashboard)' 
            : 'CompanyMicrosoftMapping (per-company database)',
        refreshFailed,
        refreshErrorMessage,
        metrics: loaded.metrics || definition.metrics(records),
        dashboardSourceMetrics: loaded.dashboardSourceMetrics || null,
        sourceLineage: loaded.sourceLineage || null,
        evidence: loaded.evidence || definition.evidence(records),
        warnings,
        rawReference: loaded.rawReference || {
            table: definition.table || null,
            recordId: records[0]?.ID || records[0]?.id || null
        }
    });
}

const definitions = {
    identity: {
        table: 'IdentityMetricsCache, IdentityUserDetailsCache, MicrosoftRoleAssignmentsCache',
        async load(pool, companyId, capability) {
            const [metrics, users, roles, tenant] = await Promise.all([
                queryRows(pool, 'SELECT * FROM IdentityMetricsCache WHERE CompanyID = ? ORDER BY LastUpdated DESC LIMIT 1', [companyId]),
                queryRows(pool, 'SELECT * FROM IdentityUserDetailsCache WHERE CompanyID = ? ORDER BY LastUpdated DESC LIMIT 1', [companyId]),
                queryRows(pool, 'SELECT * FROM MicrosoftRoleAssignmentsCache WHERE CompanyID = ? ORDER BY LastUpdated DESC LIMIT 1', [companyId]),
                queryRows(pool, `SELECT mt.ID AS MicrosoftTenantID, mt.TenantName, mt.TenantID
                                 FROM CompanyMicrosoftMapping cm
                                 INNER JOIN MicrosoftTenants mt ON mt.ID = cm.MicrosoftTenantID
                                 WHERE cm.CompanyID = ? AND cm.IsActive = 1 LIMIT 1`, [companyId])
            ]);
            if (capability?.profileKey === 'sunbird') {
                try {
                    const tenantKey = capability.profileKey;
                    const [dashboardMetricsRows, dashboardUsersRows, dashboardRiskRows, dashboardSignInRows] = await Promise.all([
                        queryRows(pool, 'SELECT * FROM identity_metrics WHERE tenant_id = ? ORDER BY last_updated DESC LIMIT 1', [tenantKey]),
                        queryRows(pool, 'SELECT * FROM identity_users ORDER BY last_updated DESC', []),
                        queryRows(pool, 'SELECT * FROM identity_risk_scores WHERE tenant_id = ? ORDER BY last_updated DESC LIMIT 1', [tenantKey]),
                        queryRows(pool, 'SELECT * FROM identity_signin_activity WHERE tenant_id = ? ORDER BY last_updated DESC LIMIT 1', [tenantKey])
                    ]);
                    if (dashboardMetricsRows[0]) {
                        const roleAssignments = extractPayload(roles[0], 'AssignmentsPayload') || [];
                        const dashboardSource = buildIdentityDashboardSource({
                            metricsRow: dashboardMetricsRows[0],
                            usersRows: dashboardUsersRows,
                            riskRow: dashboardRiskRows[0] || {},
                            signInRow: dashboardSignInRows[0] || {},
                            roleAssignments
                        });
                        return {
                            records: [...dashboardMetricsRows, ...dashboardUsersRows, ...dashboardRiskRows, ...dashboardSignInRows],
                            notConfigured: !tenant.length,
                            metrics: dashboardSource.dashboardMetrics,
                            dashboardSourceMetrics: dashboardSource.dashboardMetrics,
                            sourceLineage: {
                                sourceKey: 'identity',
                                sourceBuilder: 'buildIdentityDashboardSource',
                                sourceLayer: 'identity_dashboard_processed_cache'
                            },
                            evidence: [
                                { evidenceType: 'tenant', data: tenant[0] || null },
                                { evidenceType: 'users', data: dashboardSource.users },
                                { evidenceType: 'role_assignments', data: roleAssignments }
                            ],
                            rawReference: { table: 'identity_metrics, identity_users, identity_risk_scores, identity_signin_activity', recordId: dashboardMetricsRows[0]?.id || null }
                        };
                    }
                } catch (_) {
                    // Older deployments may not have the processed dashboard cache tables yet.
                }
            }
            const records = [...metrics, ...users, ...roles];
            return {
                records,
                notConfigured: !tenant.length,
                metrics: metrics[0] ? primitiveMetrics(metrics[0]) : {},
                evidence: [
                    { evidenceType: 'tenant', data: tenant[0] || null },
                    { evidenceType: 'users', data: extractPayload(users[0], 'UsersPayload') || [] },
                    { evidenceType: 'role_assignments', data: extractPayload(roles[0], 'AssignmentsPayload') || [] }
                ],
                rawReference: { table: this.table, recordId: metrics[0]?.ID || null }
            };
        },
        fromRefresh(refreshed, stored) {
            if (!refreshed || typeof refreshed !== 'object') {
                return stored;
            }
            const users = refreshed.users || [];
            const roleAssignments = refreshed.roleAssignments || [];
            
            // Build fresh dashboard metrics from refreshed data
            const dashboardSource = buildIdentityDashboardSource({
                metricsRow: {
                    total_users: refreshed.metrics?.totalUsers,
                    mfa_enabled_users: users.filter(u => u.mfaEnabled).length,
                    admin_users: users.filter(u => u.roles?.length > 0).length,
                    high_risk_users: users.filter(u => u.riskLevel === 'HIGH').length,
                    active_users_24h: users.filter(u => u.lastSignIn?.daysSince <= 1).length
                },
                usersRows: users,
                riskRow: {},
                signInRow: {},
                roleAssignments: roleAssignments
            });
            
            const record = {
                LastUpdated: refreshed.lastUpdated || new Date().toISOString(),
                ...refreshed.metrics
            };
            
            return {
                ...stored,
                records: [record],
                metrics: dashboardSource.dashboardMetrics,
                dashboardSourceMetrics: dashboardSource.dashboardMetrics,
                evidence: [
                    ...stored.evidence.filter(e => e.evidenceType === 'tenant'),
                    { evidenceType: 'users', data: dashboardSource.users },
                    { evidenceType: 'role_assignments', data: roleAssignments }
                ]
            };
        },
        metrics: records => primitiveMetrics(records[0]),
        evidence: records => records
    },
    devices: {
        table: 'DeviceMetricsCache',
        async load(pool, companyId) {
            const [records, configured] = await Promise.all([
                queryRows(pool, 'SELECT * FROM DeviceMetricsCache WHERE CompanyID = ? ORDER BY LastUpdated DESC LIMIT 1', [companyId]),
                hasActiveMicrosoftTenant(pool, companyId)
            ]);
            return { records, notConfigured: !configured, metrics: records[0] ? primitiveMetrics(records[0]) : {}, evidence: records };
        },
        fromRefresh(refreshed, stored) {
            const record = {
                ...(refreshed.metrics || refreshed),
                LastUpdated: refreshed.lastUpdated || new Date().toISOString()
            };
            return {
                ...stored,
                records: [record],
                metrics: refreshed.metrics || primitiveMetrics(record, ['devices']),
                evidence: refreshed.evidence || refreshed.devices || [record]
            };
        },
        metrics: records => primitiveMetrics(records[0]),
        evidence: records => records
    },
    email_security: {
        table: 'EmailMetricsCache, EmailSecurityPayloadCache',
        async load(pool, companyId) {
            const [metrics, payloadRows, configured] = await Promise.all([
                queryRows(pool, 'SELECT * FROM EmailMetricsCache WHERE CompanyID = ? ORDER BY LastUpdated DESC LIMIT 1', [companyId]),
                queryRows(pool, 'SELECT * FROM EmailSecurityPayloadCache WHERE CompanyID = ? ORDER BY LastUpdated DESC LIMIT 1', [companyId]),
                hasActiveMicrosoftTenant(pool, companyId)
            ]);
            const payload = extractPayload(payloadRows[0]);
            return {
                records: [...metrics, ...payloadRows],
                notConfigured: !configured,
                metrics: metrics[0] ? primitiveMetrics(metrics[0]) : summaryMetrics(payload),
                evidence: payload ? [payload] : []
            };
        },
        metrics: records => primitiveMetrics(records[0]),
        evidence: records => records
    },
    security_alerts: {
        table: 'SecurityEventsPayloadCache',
        async load(pool, companyId) {
            const [records, configured] = await Promise.all([
                queryRows(pool, 'SELECT * FROM SecurityEventsPayloadCache WHERE CompanyID = ? ORDER BY LastUpdated DESC LIMIT 1', [companyId]),
                hasActiveMicrosoftTenant(pool, companyId)
            ]);
            const payload = extractPayload(records[0]);
            return { records, notConfigured: !configured, metrics: summaryMetrics(payload), evidence: payload ? [payload] : [] };
        },
        metrics: records => summaryMetrics(extractPayload(records[0])),
        evidence: records => records
    },
    backup: {
        table: 'BackupRecoveryPayloadCache',
        async load(pool, companyId) {
            const [records, configured] = await Promise.all([
                queryRows(pool, 'SELECT * FROM BackupRecoveryPayloadCache WHERE CompanyID = ? ORDER BY LastUpdated DESC LIMIT 1', [companyId]),
                hasActiveMicrosoftTenant(pool, companyId)
            ]);
            const payload = extractPayload(records[0]);
            return { records, notConfigured: !configured, metrics: summaryMetrics(payload), evidence: payload ? [payload] : [] };
        },
        metrics: records => summaryMetrics(extractPayload(records[0])),
        evidence: records => records
    },
    applications: {
        table: 'ApplicationMetricsCache, ApplicationPayloadCache',
        async load(pool, companyId) {
            const [metrics, payloadRows, configured] = await Promise.all([
                queryRows(pool, 'SELECT * FROM ApplicationMetricsCache WHERE CompanyID = ? ORDER BY LastUpdated DESC LIMIT 1', [companyId]),
                queryRows(pool, 'SELECT * FROM ApplicationPayloadCache WHERE CompanyID = ? ORDER BY LastUpdated DESC LIMIT 1', [companyId]),
                hasActiveMicrosoftTenant(pool, companyId)
            ]);
            const payload = extractPayload(payloadRows[0]);
            return {
                records: [...metrics, ...payloadRows],
                notConfigured: !configured,
                metrics: metrics[0] ? primitiveMetrics(metrics[0]) : summaryMetrics(payload),
                evidence: payload ? [payload] : []
            };
        },
        metrics: records => primitiveMetrics(records[0]),
        evidence: records => records
    },
    governance: payloadDefinition('SunbirdGovernancePayloadCache'),
    compliance: payloadDefinition('SunbirdComplianceControlsCache'),
    operations: payloadDefinition('SunbirdOperationsPayloadCache'),
    cloudflare_network_security: {
        table: 'StackCTRLTenantEvidenceSnapshots',
        refreshWhenMissing: true,
        continueWhenStoredEvidenceFails: true,
        async load(pool, companyId) {
            // We read only the latest Cloudflare metrics. Full snapshot JSON is not loaded or sorted.
            const rows = await queryRows(
                pool,
                `SELECT snapshot.ID, snapshot.CreatedAt,
                        JSON_EXTRACT(snapshot.MetricsJson, '$.cloudflare_network_security') AS CloudflareMetricsJson,
                        JSON_EXTRACT(snapshot.SourceFreshnessJson, '$.cloudflare_network_security') AS CloudflareFreshnessJson
                 FROM StackCTRLTenantEvidenceSnapshots snapshot
                 WHERE snapshot.ID = (
                    SELECT MAX(latest.ID)
                    FROM StackCTRLTenantEvidenceSnapshots latest
                    WHERE latest.CompanyID = ?
                 )
                 LIMIT 1`,
                [companyId]
            );
            const snapshot = rows[0];
            const metrics = snapshot?.CloudflareMetricsJson || {};
            const freshness = snapshot?.CloudflareFreshnessJson || {};
            if (!snapshot || !Object.keys(metrics).length) return { records: [], metrics: {}, evidence: [] };
            return {
                records: [{
                    ID: snapshot.ID,
                    ...metrics,
                    LastUpdated: freshness.lastUpdated || snapshot.CreatedAt
                }],
                metrics,
                evidence: [{
                    evidenceType: 'cached_cloudflare_metrics',
                    data: metrics
                }],
                rawReference: { table: this.table, recordId: snapshot.ID }
            };
        },
        fromRefresh(refreshed) {
            const payload = refreshed.payload || refreshed;
            const deniedAccessEvents = Array.isArray(payload.accessLogs)
                ? payload.accessLogs.filter(event => /block|deny|fail/i.test(String(event.action || event.status || ''))).length
                : 0;
            return {
                records: [{ ...payload, LastUpdated: payload.fetchedAt || new Date().toISOString() }],
                metrics: { ...summaryMetrics(payload), deniedAccessEvents },
                evidence: [payload],
                rawReference: { table: 'StackCTRLTenantEvidenceSnapshots', recordId: null }
            };
        },
        metrics: records => summaryMetrics(records[0]),
        evidence: records => records
    },
    duo_licences: {
        table: 'client_duo_stats',
        async load(pool, companyId) {
            const records = await queryRows(pool, `SELECT DISTINCT cds.id, cds.used_licenses, cds.total_licenses,
                                                           cds.edition, cds.last_updated, cds.status
                                                    FROM client_duo_stats cds
                                                    INNER JOIN user_duo_accounts uda ON uda.duo_id = cds.id
                                                    INNER JOIN Users u ON u.ID = uda.user_id
                                                    WHERE u.CompanyID = ?`, [companyId]);
            const totals = records.reduce((value, row) => {
                value.usedLicences += Number(row.used_licenses || 0);
                value.totalLicences += Number(row.total_licenses || 0);
                return value;
            }, { accounts: records.length, usedLicences: 0, totalLicences: 0 });
            totals.remainingLicences = Math.max(0, totals.totalLicences - totals.usedLicences);
            return { records, notConfigured: !records.length, metrics: totals, evidence: records };
        },
        metrics: () => ({}),
        evidence: records => records
    },
    billing: {
        table: 'Invoices',
        async load(pool, companyId) {
            const records = await queryRows(pool, 'SELECT * FROM Invoices WHERE CompanyID = ? ORDER BY InvoiceDate DESC LIMIT 250', [companyId]);
            const unpaid = records.filter(row => ['unpaid', 'overdue'].includes(String(row.Status || '').toLowerCase()));
            const total = rowsTotal(records);
            const outstanding = rowsTotal(unpaid);
            return {
                records,
                metrics: { invoiceCount: records.length, unpaidInvoiceCount: unpaid.length, invoicedTotal: total, outstandingTotal: outstanding },
                evidence: records
            };
        },
        metrics: () => ({}),
        evidence: records => records
    },
    projects: {
        table: 'Projects',
        async load(pool, companyId) {
            const records = await queryRows(pool, 'SELECT * FROM Projects WHERE CompanyID = ? ORDER BY ProjectID DESC LIMIT 250', [companyId]);
            const statusCounts = records.reduce((counts, row) => {
                const status = String(row.Status || 'unknown').toLowerCase();
                counts[status] = (counts[status] || 0) + 1;
                return counts;
            }, {});
            return { records, metrics: { projectCount: records.length, statusCounts }, evidence: records };
        },
        metrics: () => ({}),
        evidence: records => records
    }
};

function payloadDefinition(table) {
    return {
        table,
        async load(pool, companyId) {
            const records = await queryRows(pool, `SELECT * FROM ${table} WHERE CompanyID = ? ORDER BY LastUpdated DESC LIMIT 1`, [companyId]);
            const payload = extractPayload(records[0]);
            return { records, metrics: summaryMetrics(payload), evidence: payload ? [payload] : [] };
        },
        metrics: records => summaryMetrics(extractPayload(records[0])),
        evidence: records => records
    };
}

function rowsTotal(rows) {
    return Number(rows.reduce((sum, row) => sum + Number(row.TotalAmount || row.total || 0), 0).toFixed(2));
}

async function runSourceAdapter(context) {
    const definition = definitions[context.capability.sourceKey];
    if (!definition) {
        return statusResult(context.capability, 'error', {
            warnings: [`No StackCTRL source adapter is registered for ${context.capability.sourceKey}.`]
        });
    }
    try {
        return await collectSource(context, definition);
    } catch (error) {
        return statusResult(context.capability, 'error', {
            warnings: [`${context.capability.displayName} adapter failed.`],
            errorMessage: error.message
        });
    }
}

async function identityAdapter(context) { return runSourceAdapter({ ...context, capability: { ...context.capability, sourceKey: 'identity' } }); }
async function devicesAdapter(context) { return runSourceAdapter({ ...context, capability: { ...context.capability, sourceKey: 'devices' } }); }
async function emailSecurityAdapter(context) { return runSourceAdapter({ ...context, capability: { ...context.capability, sourceKey: 'email_security' } }); }
async function securityAlertsAdapter(context) { return runSourceAdapter({ ...context, capability: { ...context.capability, sourceKey: 'security_alerts' } }); }
async function backupAdapter(context) { return runSourceAdapter({ ...context, capability: { ...context.capability, sourceKey: 'backup' } }); }
async function applicationsAdapter(context) { return runSourceAdapter({ ...context, capability: { ...context.capability, sourceKey: 'applications' } }); }
async function governanceAdapter(context) { return runSourceAdapter({ ...context, capability: { ...context.capability, sourceKey: 'governance' } }); }
async function complianceAdapter(context) { return runSourceAdapter({ ...context, capability: { ...context.capability, sourceKey: 'compliance' } }); }
async function operationsAdapter(context) { return runSourceAdapter({ ...context, capability: { ...context.capability, sourceKey: 'operations' } }); }
async function cloudflareNetworkSecurityAdapter(context) { return runSourceAdapter({ ...context, capability: { ...context.capability, sourceKey: 'cloudflare_network_security' } }); }
async function duoLicencesAdapter(context) { return runSourceAdapter({ ...context, capability: { ...context.capability, sourceKey: 'duo_licences' } }); }
async function billingAdapter(context) { return runSourceAdapter({ ...context, capability: { ...context.capability, sourceKey: 'billing' } }); }
async function projectsAdapter(context) { return runSourceAdapter({ ...context, capability: { ...context.capability, sourceKey: 'projects' } }); }

const SOURCE_ADAPTERS = {
    identity: identityAdapter,
    devices: devicesAdapter,
    email_security: emailSecurityAdapter,
    security_alerts: securityAlertsAdapter,
    backup: backupAdapter,
    applications: applicationsAdapter,
    governance: governanceAdapter,
    compliance: complianceAdapter,
    operations: operationsAdapter,
    cloudflare_network_security: cloudflareNetworkSecurityAdapter,
    duo_licences: duoLicencesAdapter,
    billing: billingAdapter,
    projects: projectsAdapter
};

module.exports = {
    SOURCE_ADAPTERS,
    runSourceAdapter,
    identityAdapter,
    devicesAdapter,
    emailSecurityAdapter,
    securityAlertsAdapter,
    backupAdapter,
    applicationsAdapter,
    governanceAdapter,
    complianceAdapter,
    operationsAdapter,
    cloudflareNetworkSecurityAdapter,
    duoLicencesAdapter,
    billingAdapter,
    projectsAdapter
};

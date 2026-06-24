const { DateTime } = require('luxon');
const { buildDashboardIntelligenceContext } = require('./intelligence/dashboard-context');

const ENTERPRISE_DOMAINS = Object.freeze([
    { key: 'identity', name: 'Identity Protection', sourceKey: 'identity', mode: 'enterprise_domain_identity', riskKey: 'identity', healthKey: 'identityHealth', focus: ['MFA coverage', 'users without MFA', 'privileged accounts', 'admin roles', 'legacy authentication', 'risky sign-ins', 'external users', 'Conditional Access gaps'] },
    { key: 'devices', name: 'Device Protection', sourceKey: 'devices', mode: 'enterprise_domain_devices', riskKey: 'devices', healthKey: 'deviceHealth', focus: ['compliance rate', 'stale devices', 'non-compliant devices', 'unmanaged indicators', 'endpoint security risk', 'remediation actions'] },
    { key: 'email_security', name: 'Email Security', sourceKey: 'email_security', mode: 'enterprise_domain_email_security', riskKey: 'email', healthKey: 'emailHealth', focus: ['active threats', 'unresolved threats', 'phishing and malware indicators', 'response posture', 'resolution rate', 'user exposure'] },
    { key: 'cloudflare_network_security', name: 'Network Security / Cloudflare', sourceKey: 'cloudflare_network_security', mode: 'enterprise_domain_cloudflare_network_security', riskKey: 'network', healthKey: null, focus: ['network posture', 'WAF and firewall controls', 'DNS posture', 'SSL/TLS posture', 'bot protection', 'rate limiting', 'security events', 'unknown controls'] },
    { key: 'security_alerts', name: 'Security Alerts', sourceKey: 'security_alerts', mode: 'enterprise_domain_security_alerts', riskKey: 'security', healthKey: 'securityHealth', focus: ['alert severity', 'high-severity alerts', 'anonymous IP sign-ins', 'active incidents', 'incident response posture', 'containment actions'] },
    { key: 'applications', name: 'Applications', sourceKey: 'applications', mode: 'enterprise_domain_applications', riskKey: 'applications', healthKey: 'applicationsHealth', focus: ['external publishers', 'broad permissions', 'high-risk applications', 'shadow IT', 'consent risk', 'application governance'] },
    { key: 'backup', name: 'Backup and Recovery', sourceKey: 'backup', mode: 'enterprise_domain_backup', riskKey: 'backup', healthKey: 'backupHealth', focus: ['backup coverage', 'third-party backup', 'immutable storage', 'restore testing', 'ransomware recovery readiness', 'business continuity'] },
    { key: 'governance', name: 'Governance', sourceKey: 'governance', mode: 'enterprise_domain_governance', riskKey: 'governance', healthKey: 'governanceHealth', focus: ['access reviews', 'admin reviews', 'policy reviews', 'governance maturity', 'manual review needs', 'evidence gaps'] },
    { key: 'operations', name: 'Operations', sourceKey: 'operations', mode: 'enterprise_domain_operations', riskKey: 'operations', healthKey: 'operationsHealth', focus: ['data freshness', 'stale operational evidence', 'failed tasks', 'service health', 'operational risk', 'process gaps'] },
    { key: 'compliance', name: 'Compliance Validation', sourceKey: 'compliance', mode: 'enterprise_domain_compliance', riskKey: 'compliance', healthKey: 'complianceHealth', focus: ['control status', 'failed controls', 'partial controls', 'manual-review controls', 'compliance readiness', 'evidence gaps'] }
]);

const DOMAIN_BY_KEY = Object.freeze(Object.fromEntries(ENTERPRISE_DOMAINS.map(domain => [domain.key, domain])));
const LOWER_PERIOD = Object.freeze({ weekly: 'daily', monthly: 'weekly', yearly: 'monthly' });
const DEFAULT_DOMAIN_DELAY_MS = 60000;
const LARGE_DOMAIN_INPUT_TOKEN_THRESHOLD = 50000;
const SECURITY_ALERTS_DOMAIN_DELAY_MS = 90000;
const ENTITY_EVIDENCE_LIMITS = Object.freeze({ maxDepth: 8, maxArray: 50, maxString: 1200, maxObjectKeys: 100 });
const DEFAULT_MAX_INPUT_BYTES = 150000;
const DEFAULT_MAX_ITEMS_PER_BATCH = 100;
const DEFAULT_HEAVY_DOMAIN_MAX_ITEMS_PER_BATCH = 50;
const DEFAULT_THRESHOLD_BATCH_MAX_ITEMS = 50;
const DEFAULT_MAX_TOTAL_TOKENS = 200000;
const DEFAULT_DOMAIN_OUTPUT_TOKENS = 8000;
const DEFAULT_SYNTHESIS_OUTPUT_TOKENS = 8000;
const ENTERPRISE_RATE_LIMIT_RETRY_DELAYS_MS = Object.freeze([300000, 300000, 600000]);
const ENTERPRISE_CONNECTION_RETRY_DELAYS_MS = Object.freeze([0, 15000, 45000]);
const ENTERPRISE_RATE_LIMIT_RETRY_MAX_MS = 15 * 60 * 1000;
const HEAVY_DOMAINS = Object.freeze(new Set(['governance', 'operations', 'compliance']));
const SUCCESSFUL_DOMAIN_STATUSES = Object.freeze(new Set(['completed', 'partial', 'completed_with_warnings']));
const SKIPPED_DOMAIN_STATUSES = Object.freeze(new Set(['skipped_rate_limited', 'skipped_token_threshold', 'skipped_pipeline_stop']));
const DOMAIN_SYSTEM_MESSAGE = 'You are StackCTRL Enterprise Intelligence. Return valid JSON only. No markdown. No code fences. No explanations outside JSON.';
const IDENTITY_LINEAGE_FIELDS = Object.freeze([
    'totalUsers', 'mfaEnabled', 'mfaMissing', 'mfaCoverage', 'privilegedUsers',
    'adminsWithoutMfa', 'highRiskUsers', 'signInIssues', 'externalUsers',
    'unknownDevices', 'multiplePrivilegedRoles', 'securityScore', 'healthScore',
    'riskScore', 'sourceHealth.evidenceCount', 'snapshotId', 'sourceLastUpdated'
]);
const DEVICE_LINEAGE_FIELDS = Object.freeze([
    'totalDevices', 'compliantDevices', 'nonCompliantDevices', 'complianceRate',
    'encryptedDevices', 'encryptionRate', 'activeDevices24h', 'staleDevices', 'dead30Days',
    'highRiskDevices', 'unmanagedDevices', 'securityAlerts', 'deviceSecurityScore',
    'healthScore', 'riskScore', 'sourceHealth.evidenceCount', 'snapshotId', 'sourceLastUpdated'
]);
const EMAIL_LINEAGE_FIELDS = Object.freeze([
    'activeThreats', 'highSeverityAlerts', 'affectedUsersCount', 'activeIncidents',
    'securityScore', 'threatResolutionRate', 'phishingCount', 'malwareCount', 'spamCount', 'becCount',
    'activeMailboxes', 'totalMailActivity', 'sendCount', 'receiveCount', 'readCount', 'recommendationsCount',
    'healthScore', 'riskScore', 'sourceHealth.evidenceCount', 'snapshotId', 'sourceLastUpdated'
]);
const NETWORK_LINEAGE_FIELDS = Object.freeze([
    'protectedApps', 'enrolledDevices', 'gatewayPolicies', 'activeGatewayPolicies', 'deniedAccessEvents',
    'recentAccessEvents', 'networkSecurityScore', 'dlpProfiles', 'identityProviders', 'sectionErrors',
    'healthScore', 'riskScore', 'sourceHealth.evidenceCount', 'snapshotId', 'sourceLastUpdated'
]);
const DASHBOARD_BACKED_ENTERPRISE_DOMAINS = Object.freeze(['identity', 'devices', 'email_security', 'cloudflare_network_security', 'backup', 'applications', 'security_alerts', 'governance', 'compliance', 'operations']);
const DOMAIN_EVIDENCE_TYPES = Object.freeze({
    identity: ['users', 'dashboard_evidence_lists'],
    devices: ['devices', 'dashboard_evidence_lists'],
    email_security: ['alerts', 'incidents', 'mailActivityUsers', 'dashboard_evidence_lists'],
    cloudflare_network_security: ['accessApps', 'devices', 'gatewayRules', 'accessLogs', 'dlpProfiles', 'warpProfiles', 'dashboard_evidence_lists'],
    backup: ['users', 'sites', 'dashboard_evidence_lists'],
    applications: ['applications', 'dashboard_evidence_lists'],
    security_alerts: ['alerts', 'incidents', 'signIns', 'threatIndicators', 'dashboard_evidence_lists'],
    governance: ['governanceRows', 'dashboard_evidence_lists'],
    compliance: ['controls', 'dashboard_evidence_lists'],
    operations: ['tasks', 'dashboard_evidence_lists']
});
const DOMAIN_EVIDENCE_CATEGORY_METRICS = Object.freeze({
    identity: {
        allUsers: 'totalUsers',
        usersWithoutMfa: 'mfaMissing',
        usersWithMfa: 'mfaEnabled',
        privilegedUsers: 'privilegedUsers',
        adminsWithoutMfa: 'adminsWithoutMfa',
        highRiskUsers: 'highRiskUsers',
        inactiveUsers: 'inactiveUsers',
        failedSignInUsers: 'signInIssues',
        externalUsers: 'externalUsers',
        unknownDeviceUsers: 'unknownDevices'
    },
    devices: {
        allDevices: 'totalDevices',
        nonCompliantDevices: 'nonCompliantDevices',
        notEncryptedDevices: 'notEncryptedDevices',
        staleDevices: 'staleDevices',
        deadDevices: 'dead30Days',
        unmanagedDevices: 'unmanagedDevices',
        unknownDevices: 'unknownDevices'
    },
    email_security: {
        allAlerts: 'activeThreats',
        highSeverityAlerts: 'highSeverityAlerts',
        activeIncidents: 'activeIncidents',
        phishingAlerts: 'phishingCount',
        malwareAlerts: 'malwareCount',
        affectedUsers: 'affectedUsersCount',
        mailActivityUsers: 'activeMailboxes'
    },
    cloudflare_network_security: {
        applications: 'protectedApps',
        devices: 'enrolledDevices',
        gatewayRules: 'gatewayPolicies',
        accessPolicies: 'protectedApps',
        accessLogs: 'recentAccessEvents',
        dlpProfiles: 'dlpProfiles',
        warpProfiles: 'enrolledDevices',
        sectionStatus: 'sectionErrors'
    },
    compliance: {
        controls: 'totalControls',
        failedControls: 'failingControls',
        validationEvidence: 'partialControls'
    },
    governance: {
        governanceEvidence: 'totalRows',
        controls: 'connectedRows',
        risks: 'attentionRequiredRows'
    },
    applications: {
        allApplications: 'totalApplications',
        externalApps: 'externalApplications',
        highRiskApps: 'highRiskApps',
        excessivePermissionApps: 'excessivePermissionApps',
        highAccessApps: 'highAccessApps'
    },
    backup: {
        users: 'activeUsersCount',
        inactiveUsers: 'inactiveUsersCount',
        sites: 'servicesCovered'
    },
    security_alerts: {
        alerts: 'totalAlerts',
        highSeverityAlerts: 'highSeverityAlerts',
        activeIncidents: 'activeIncidents',
        suspiciousSignIns: 'suspiciousSignIns',
        threatIndicators: 'threatIndicators'
    },
    operations: {
        tasks: 'totalTasks',
        highPriorityTasks: 'highPriorityTasks'
    }
});
const BACKUP_LINEAGE_FIELDS = Object.freeze([
    'totalStorageGB', 'oneDriveStorageGB', 'sharePointStorageGB', 'exchangeStorageGB',
    'activeUsersCount', 'inactiveUsersCount', 'servicesCovered', 'inactiveUserStorageGB',
    'backupCoverageScore', 'dataExposureRiskScore', 'recommendationsCount',
    'healthScore', 'riskScore', 'sourceHealth.evidenceCount', 'snapshotId', 'sourceLastUpdated'
]);
const APPLICATIONS_LINEAGE_FIELDS = Object.freeze([
    'totalApplications', 'externalApplications', 'highRiskApps', 'highAccessApps',
    'excessivePermissionApps', 'groupAssignedApps', 'applicationGovernanceScore',
    'userCount', 'groupCount', 'recommendationsCount',
    'healthScore', 'riskScore', 'sourceHealth.evidenceCount', 'snapshotId', 'sourceLastUpdated'
]);
const SECURITY_LINEAGE_FIELDS = Object.freeze([
    'totalAlerts', 'highSeverityAlerts', 'activeIncidents', 'threatIndicators',
    'usersUnderAttack', 'securityScore', 'suspiciousSignIns', 'recommendationsCount',
    'healthScore', 'riskScore', 'sourceHealth.evidenceCount', 'snapshotId', 'sourceLastUpdated'
]);

const GOVERNANCE_LINEAGE_FIELDS = Object.freeze([
    'totalRows', 'apiConnectedRows', 'manualRowsExcluded', 'attentionRequiredRows', 'connectedRows',
    'governanceScore', 'recommendationsCount', 'healthScore', 'riskScore',
    'sourceHealth.evidenceCount', 'snapshotId', 'sourceLastUpdated'
]);

const COMPLIANCE_LINEAGE_FIELDS = Object.freeze([
    'totalControls', 'apiControls', 'manualControlsExcluded', 'failingControls', 'partialControls',
    'passingControls', 'complianceScore', 'recommendationsCount', 'healthScore', 'riskScore',
    'sourceHealth.evidenceCount', 'snapshotId', 'sourceLastUpdated'
]);

const OPERATIONS_LINEAGE_FIELDS = Object.freeze([
    'totalTasks', 'apiTasks', 'manualTasksExcluded', 'highPriorityTasks', 'mediumPriorityTasks',
    'lowPriorityTasks', 'operationsHealthScore', 'recommendationsCount', 'healthScore', 'riskScore',
    'sourceHealth.evidenceCount', 'snapshotId', 'sourceLastUpdated'
]);

function parseJson(value, fallback = null) {
    if (value == null) return fallback;
    if (Buffer.isBuffer(value)) value = value.toString('utf8');
    if (typeof value === 'object') return value;
    try { return JSON.parse(value); } catch (_) { return fallback; }
}

function bytes(value) {
    return Buffer.byteLength(JSON.stringify(value ?? null), 'utf8');
}

function numberOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function textOrNull(value, maximum = 100000) {
    if (value === null || value === undefined || value === '') return null;
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    return text.slice(0, maximum);
}

function normalizeMysqlDate(value) {
    if (!value) return null;

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString().slice(0, 10);
    }

    if (typeof value !== 'string') return null;

    const trimmed = value.trim();
    if (!trimmed) return null;

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        return trimmed;
    }

    const invalidDateWords = new Set([
        'ongoing',
        'immediate',
        'asap',
        'tbd',
        'n/a',
        'na',
        'not applicable',
        'not specified',
        'continuous',
        'continual',
        'within 30 days',
        'within 60 days',
        'within 90 days',
        'next review cycle',
        'to be determined'
    ]);

    if (invalidDateWords.has(trimmed.toLowerCase())) {
        return null;
    }

    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return null;

    return parsed.toISOString().slice(0, 10);
}

function array(value) {
    return Array.isArray(value) ? value : [];
}

function safeValue(value, depth = 0, limits = {}) {
    const maxDepth = limits.maxDepth ?? 6;
    const maxArray = limits.maxArray ?? 20;
    const maxString = limits.maxString ?? 2000;
    if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
    if (typeof value === 'string') return value.slice(0, maxString);
    if (depth >= maxDepth) return Array.isArray(value) ? `[${value.length} items omitted]` : '[nested detail omitted]';
    if (Array.isArray(value)) return value.slice(0, maxArray).map(item => safeValue(item, depth + 1, limits));
    if (typeof value === 'object') {
        const maxObjectKeys = limits.maxObjectKeys ?? 80;
        return Object.fromEntries(Object.entries(value).slice(0, maxObjectKeys).map(([key, nested]) => [key, safeValue(nested, depth + 1, limits)]));
    }
    return String(value).slice(0, maxString);
}

function safeEvidenceEntity(value, limits = ENTITY_EVIDENCE_LIMITS) {
    return safeValue(value, 0, limits);
}

function entityRecordKey(value) {
    if (!value || typeof value !== 'object') return null;
    return value.id || value.userPrincipalName || value.mail || value.email || value.deviceName ||
        value.applicationId || value.controlId || value.alertId || value.serialNumber || value.name || null;
}

function isEntityRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    return Boolean(
        entityRecordKey(value) ||
        value.displayName || value.userEmail || value.complianceState || value.severity ||
        value.title || value.subject || value.policyName
    );
}

const EVIDENCE_CONTAINER_METADATA_KEYS = new Set([
    'evidencetype', 'type', 'source', 'sourcekey', 'name', 'label', 'category',
    'title', 'count', 'total', 'status'
]);

function containsArray(value, seen = new Set()) {
    if (Array.isArray(value)) return true;
    if (!value || typeof value !== 'object' || seen.has(value)) return false;
    seen.add(value);
    return Object.values(value).some(nested => containsArray(nested, seen));
}

function flattenDomainEvidence(evidence, { rootPath = 'evidence', domainKey = null } = {}) {
    const flattened = [];

    function pathLabel(path) {
        const segments = String(path).replace(/\[\d+\]/g, '').split('.').filter(Boolean);
        return segments.at(-1) || 'evidence';
    }

    function containerContext(value, inherited) {
        const context = { ...inherited };
        if (!value || typeof value !== 'object' || Array.isArray(value)) return context;
        for (const [key, nested] of Object.entries(value)) {
            if (nested == null || !['string', 'number', 'boolean'].includes(typeof nested)) continue;
            if (EVIDENCE_CONTAINER_METADATA_KEYS.has(key.toLowerCase())) context[key] = nested;
        }
        if (value.evidenceType) context.evidenceType = value.evidenceType;
        return context;
    }

    function append(value, path, context, { preserveEntity = false } = {}) {
        const itemContext = containerContext(value, context);
        const sourceLabel = String(
            itemContext.listName || itemContext.evidenceType || itemContext.type ||
            itemContext.sourceKey || itemContext.source || pathLabel(path)
        );
        flattened.push({
            sourcePath: path,
            sourceLabel,
            evidenceType: String(itemContext.evidenceType || itemContext.type || sourceLabel || 'stored_evidence'),
            evidenceCategory: itemContext.listName || null,
            sourceMetric: itemContext.sourceMetric || null,
            entityKey: entityRecordKey(value?.data ?? value),
            data: preserveEntity
                ? safeEvidenceEntity(value?.data ?? value)
                : safeValue(value?.data ?? value, 0, { maxDepth: 7, maxArray: 50, maxString: 1600, maxObjectKeys: 100 })
        });
    }

    function walk(value, path, inherited = {}, isArrayItem = false) {
        if (Array.isArray(value)) {
            value.forEach((item, index) => walk(item, `${path}[${index}]`, inherited, true));
            return;
        }

        if (!value || typeof value !== 'object') {
            append(value, path, inherited);
            return;
        }

        if (value.evidenceType === 'dashboard_evidence_lists') {
            return;
        }

        if (isArrayItem && isEntityRecord(value)) {
            append(value, path, inherited, { preserveEntity: true });
            return;
        }

        if (Object.prototype.hasOwnProperty.call(value, 'data') && Array.isArray(value.data)) {
            const context = containerContext(value, inherited);
            value.data.forEach((item, index) => walk(item, `${path}.data[${index}]`, context, true));
            return;
        }

        const entries = Object.entries(value);
        const arrayBearingEntries = entries.filter(([, nested]) => containsArray(nested));
        if (!arrayBearingEntries.length) {
            append(value, path, inherited, { preserveEntity: isEntityRecord(value) });
            return;
        }

        const context = containerContext(value, inherited);
        if (isArrayItem && isEntityRecord(value)) {
            append(value, path, context, { preserveEntity: true });
            return;
        }

        for (const [key, nested] of arrayBearingEntries) {
            walk(nested, `${path}.${key}`, context, false);
        }
    }

    const normalizedEvidence = Array.isArray(evidence)
        ? evidence.filter(item => item?.evidenceType !== 'dashboard_evidence_lists')
        : evidence;
    walk(normalizedEvidence, rootPath);
    return flattened;
}

function filterDomainEvidence(sourceEvidence, domainKey) {
    if (!Array.isArray(sourceEvidence)) return sourceEvidence;
    const allowedTypes = DOMAIN_EVIDENCE_TYPES[domainKey];
    if (!allowedTypes?.length) return sourceEvidence;
    const filtered = sourceEvidence.filter(item => allowedTypes.includes(item?.evidenceType));
    return filtered.length ? filtered : sourceEvidence.filter(item => item?.evidenceType !== 'dashboard_evidence_lists');
}

function enrichDomainEvidence(source, domain, evidence) {
    if (!Array.isArray(evidence)) return evidence;
    if (evidence.some(item => item?.evidenceType === 'dashboard_evidence_lists')) {
        return evidence;
    }
    try {
        const enriched = buildDashboardIntelligenceContext({
            sourceKey: domain.sourceKey,
            displayName: domain.name,
            status: source.status || 'available',
            isExpected: source.isExpected !== false,
            metrics: source.metrics || {},
            dashboardMetrics: source.dashboardMetrics || {},
            dashboardSourceMetrics: source.dashboardSourceMetrics || source.dashboardMetrics || {},
            evidence,
            warnings: source.warnings || [],
            freshness: source.freshness || {},
            sourceLineage: source.sourceLineage || null,
            rawReference: source.rawReference || null
        });
        const listPackage = array(enriched.evidence).find(item => item?.evidenceType === 'dashboard_evidence_lists');
        return listPackage ? [...array(evidence), listPackage] : evidence;
    } catch (_) {
        return evidence;
    }
}

function buildEvidenceCatalog(evidence, domain, snapshotId) {
    const evidenceItems = Array.isArray(evidence) ? evidence : [];
    const listContainer = evidenceItems.find(item => item?.evidenceType === 'dashboard_evidence_lists');
    const listData = listContainer?.data && typeof listContainer.data === 'object' ? listContainer.data : {};
    const metricMap = DOMAIN_EVIDENCE_CATEGORY_METRICS[domain.key] || {};
    let categories = Object.entries(listData).map(([key, rows]) => {
        const entities = array(rows).map(row => safeEvidenceEntity(row));
        return {
            key,
            label: key.replace(/([A-Z])/g, ' $1').replace(/^./, char => char.toUpperCase()).trim(),
            sourceMetric: metricMap[key] || null,
            count: entities.length,
            entities
        };
    }).filter(category => category.count > 0);

    if (!categories.length) {
        categories = evidenceItems
            .filter(item => item?.evidenceType !== 'dashboard_evidence_lists' && array(item?.data).length)
            .map(item => {
                const key = String(item.evidenceType || 'evidenceRows');
                const entities = array(item.data).map(row => safeEvidenceEntity(row));
                return {
                    key,
                    label: key.replace(/[_-]+/g, ' ').replace(/\b\w/g, char => char.toUpperCase()),
                    sourceMetric: metricMap[key] || key,
                    count: entities.length,
                    entities
                };
            });
    }

    const primaryTypes = (DOMAIN_EVIDENCE_TYPES[domain.key] || []).filter(type => type !== 'dashboard_evidence_lists');
    const primaryTable = primaryTypes.map(type => {
        const container = evidenceItems.find(item => item?.evidenceType === type);
        const rows = array(container?.data);
        return rows.length ? { evidenceType: type, count: rows.length, description: `StackCTRL ${domain.name} dashboard table (${type})` } : null;
    }).filter(Boolean)[0] || null;

    const catalogEntityCount = categories.reduce((total, category) => total + category.count, 0);
    return {
        snapshotId: Number(snapshotId),
        domainKey: domain.key,
        domainName: domain.name,
        primaryTable,
        categories,
        catalogEntityCount,
        categoryCount: categories.length
    };
}

function buildEvidenceBatchPlan(allEvidence, batches) {
    return {
        totalEntityRows: allEvidence.length,
        batchCount: batches.length,
        itemsPerBatch: batches.map(batch => batch.items.length),
        batches: batches.map(batch => ({
            batchNumber: batch.number,
            itemCount: batch.items.length,
            evidenceTypes: [...new Set(batch.items.map(item => item.evidenceType))],
            semanticGrouping: batch.semanticGrouping || null
        }))
    };
}

function computeInterBatchDelayMs(inputTokens, settings, domainKey = null) {
    const configured = Number(settings?.domainDelayMs);
    const baseDelay = Number.isFinite(configured) ? Math.max(0, configured) : DEFAULT_DOMAIN_DELAY_MS;
    // Take the largest applicable cooldown floor so a heavy domain with a large
    // payload never gets a shorter cooldown than the same domain with less data.
    let floor = 0;
    // Security Alerts gets 90 seconds between batches (heavy domain with significant data)
    if (domainKey === 'security_alerts') floor = Math.max(floor, SECURITY_ALERTS_DOMAIN_DELAY_MS);
    if (HEAVY_DOMAINS.has(domainKey)) floor = Math.max(floor, 120000);
    if (inputTokens >= LARGE_DOMAIN_INPUT_TOKEN_THRESHOLD) floor = Math.max(floor, 180000);
    else if (inputTokens >= 30000) floor = Math.max(floor, 60000);
    if (floor > 0) return Math.max(baseDelay, floor);
    if (baseDelay === 0) return 0;
    return Math.max(baseDelay, DEFAULT_DOMAIN_DELAY_MS);
}

function computeInterDomainDelayMs(inputTokens, settings, domainKey = null) {
    return computeInterBatchDelayMs(inputTokens, settings, domainKey);
}

function compactReference(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string' || typeof value === 'number') return textOrNull(String(value), 255);
    if (typeof value !== 'object' || Array.isArray(value)) return null;
    return textOrNull(
        value.recordId || value.entityKey || value.sourceAlertId || value.alertId || value.SourceID ||
        value.id || value.userId || value.deviceId || value.applicationId || value.controlId ||
        value.userPrincipalName || value.mail || value.email || value.deviceName || value.name,
        255
    );
}

function compactReferences(values, maximum = Number.POSITIVE_INFINITY) {
    const references = [...new Set(array(values).map(compactReference).filter(Boolean))];
    return Number.isFinite(maximum) ? references.slice(0, maximum) : references;
}

function normalizeEvidenceBackedItem(item, domain, snapshotId) {
    const value = item && typeof item === 'object' && !Array.isArray(item) ? item : { title: String(item || '') };
    const affectedEntities = array(value.affectedEntities).map(entity => typeof entity === 'string'
        ? textOrNull(entity, 500)
        : safeEvidenceEntity(entity, { ...ENTITY_EVIDENCE_LIMITS, maxArray: 20, maxObjectKeys: 40 }));
    const evidenceRows = [
        ...array(value.evidenceRows),
    ].map(row => typeof row === 'string'
        ? textOrNull(row, 500)
        : safeEvidenceEntity(row, { ...ENTITY_EVIDENCE_LIMITS, maxArray: 20, maxObjectKeys: 40 }));
    return {
        ...value,
        title: textOrNull(value.title || value.name || value.metricName, 255),
        description: textOrNull(value.description || value.detail || value.explanation, 1200),
        severity: textOrNull(value.severity, 50),
        status: textOrNull(value.status, 50),
        likelihood: textOrNull(value.likelihood, 80),
        impact: textOrNull(value.impact, 120),
        priority: textOrNull(value.priority, 50),
        category: textOrNull(value.category, 120),
        businessImpact: textOrNull(value.businessImpact || value.businessReason, 1200),
        businessReason: textOrNull(value.businessReason || value.businessImpact, 1200),
        evidenceSummary: textOrNull(value.evidenceSummary, 1200),
        recommendation: textOrNull(value.recommendation || value.detail, 1200),
        detail: textOrNull(value.detail || value.recommendation, 1200),
        suggestedOwner: textOrNull(value.suggestedOwner || value.owner, 180),
        owner: textOrNull(value.owner || value.suggestedOwner, 180),
        suggestedDueDate: normalizeMysqlDate(value.suggestedDueDate || value.dueDate),
        sourceDomain: textOrNull(value.sourceDomain || domain.key, 80),
        sourceMetric: textOrNull(value.sourceMetric, 120),
        snapshotId: numberOrNull(value.snapshotId ?? snapshotId),
        affectedEntities,
        affectedEntityIds: compactReferences([...array(value.affectedEntityIds), ...affectedEntities]),
        evidenceRows,
        recordIds: compactReferences([...array(value.recordIds), ...evidenceRows]),
        sourceAlertIds: compactReferences(value.sourceAlertIds),
        sourceMetrics: [...new Set(array(value.sourceMetrics).map(metric => textOrNull(metric, 120)).filter(Boolean))],
        evidenceSource: textOrNull(value.evidenceSource || value.sourceLabel || 'stackctrl_dashboard_evidence', 255),
        whatHappened: textOrNull(value.whatHappened || value.description, 1200),
        whyItMatters: textOrNull(value.whyItMatters || value.businessImpact, 1200),
        recommendedAction: textOrNull(value.recommendedAction || value.recommendation || value.detail, 1200),
        recommendedActions: array(value.recommendedActions).map(action => textOrNull(action, 1200)).filter(Boolean),
        metricName: textOrNull(value.metricName, 120),
        direction: textOrNull(value.direction, 50),
        currentValue: numberOrNull(value.currentValue),
        previousValue: numberOrNull(value.previousValue),
        changePercent: numberOrNull(value.changePercent),
        comparisonPeriod: textOrNull(value.comparisonPeriod, 80)
    };
}

function ensureItemEvidence(item, domain, snapshotId, availableEvidence = []) {
    const normalized = normalizeEvidenceBackedItem(item, domain, snapshotId);
    if (!availableEvidence.length) return normalized;
    const requestedMetric = String(normalized.sourceMetric || '').toLowerCase();
    const matching = requestedMetric
        ? availableEvidence.filter(row => [row.sourceMetric, row.sourceLabel, row.evidenceCategory, row.evidenceType]
            .some(value => String(value || '').toLowerCase() === requestedMetric))
        : [];
    const selected = matching.length ? matching : availableEvidence;
    const rows = selected.map(row => safeEvidenceEntity({
        sourcePath: row?.sourcePath || null,
        sourceMetric: row?.sourceMetric || null,
        evidenceType: row?.evidenceType || null,
        entityKey: row?.entityKey || null,
        data: row?.data ?? row
    }, { ...ENTITY_EVIDENCE_LIMITS, maxArray: 20, maxObjectKeys: 50 }));
    const recordIds = compactReferences(selected.map(row => ({ ...(row?.data || {}), entityKey: row?.entityKey, recordId: row?.sourcePath })));
    const first = selected[0] || {};
    if (!normalized.sourceMetric) normalized.sourceMetric = textOrNull(first.sourceMetric || first.sourceLabel || first.evidenceType, 120);
    if (!normalized.evidenceSource || normalized.evidenceSource === 'stackctrl_dashboard_evidence') {
        normalized.evidenceSource = textOrNull(first.sourcePath || first.sourceLabel || 'stackctrl_dashboard_evidence', 255);
    }
    if (!normalized.evidenceRows.length) normalized.evidenceRows = rows;
    if (!normalized.affectedEntities.length) normalized.affectedEntities = rows.map(row => row.data ?? row);
    normalized.recordIds = compactReferences([...normalized.recordIds, ...normalized.evidenceRows, ...recordIds]);
    normalized.affectedEntityIds = compactReferences([...normalized.affectedEntityIds, ...normalized.affectedEntities, ...recordIds]);
    const sourceAlertIds = selected.map(row => {
        const data = row?.data ?? row;
        return data?.sourceAlertId || data?.alertId || data?.SourceID || data?.id || row?.entityKey || null;
    }).filter(Boolean).map(String);
    normalized.sourceAlertIds = compactReferences([...array(item?.sourceAlertIds), ...sourceAlertIds]);
    normalized.sourceMetrics = [...new Set([...array(item?.sourceMetrics).map(String), normalized.sourceMetric].filter(Boolean))];
    normalized.recommendedActions = array(item?.recommendedActions).length
        ? array(item.recommendedActions)
        : [normalized.recommendedAction].filter(Boolean);
    if (!normalized.evidenceSummary) normalized.evidenceSummary = `${selected.length} readable StackCTRL entity evidence row(s) support this item; complete source data remains available in the raw evidence endpoint.`;
    return normalized;
}

function normalizeControlAssessment(value, domain, snapshotId, availableEvidence) {
    if (Array.isArray(value)) return value.map(item => ensureItemEvidence(item, domain, snapshotId, availableEvidence));
    if (!value || typeof value !== 'object') return value || {};
    if (value.title || value.name || value.control || value.description || value.detail) {
        return ensureItemEvidence(value, domain, snapshotId, availableEvidence);
    }
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [
        key,
        Array.isArray(nested)
            ? nested.map(item => ensureItemEvidence(item, domain, snapshotId, availableEvidence))
            : (nested && typeof nested === 'object'
                ? normalizeControlAssessment(nested, domain, snapshotId, availableEvidence)
                : nested)
    ]));
}

function deepItemCount(value, depth = 0) {
    if (value == null || depth > 5) return 0;
    if (Array.isArray(value)) return value.length + value.reduce((total, item) => total + deepItemCount(item, depth + 1), 0);
    if (typeof value === 'object') return Object.values(value).reduce((total, item) => total + deepItemCount(item, depth + 1), 0);
    return 1;
}

function primitiveMetricCount(value, depth = 0) {
    if (value == null || depth > 6) return 0;
    if (Array.isArray(value)) return 0;
    if (typeof value === 'object') return Object.values(value).reduce((total, nested) => total + primitiveMetricCount(nested, depth + 1), 0);
    return 1;
}

function lineageValue(value, metric, depth = 0) {
    if (!value || typeof value !== 'object' || depth > 8) return null;
    if (Object.prototype.hasOwnProperty.call(value, metric)) return value[metric];
    const leaf = metric.split('.').at(-1).toLowerCase();
    const directKey = Object.keys(value).find(key => key.toLowerCase() === leaf);
    if (directKey) return value[directKey];
    for (const nested of Object.values(value)) {
        if (!nested || typeof nested !== 'object') continue;
        const found = lineageValue(nested, metric, depth + 1);
        if (found !== null && found !== undefined) return found;
    }
    return null;
}

function comparableLineageValue(value) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    const numeric = Number(value);
    return Number.isFinite(numeric) && String(value).trim() !== '' ? numeric : String(value);
}

function buildDataLineageComparison({ fields, sourceValues, inputValues, azureOutput = null, storedIntelligence = null }) {
    const rows = fields.map(metric => {
        const stackCTRLSource = comparableLineageValue(lineageValue(sourceValues, metric));
        const enterpriseAzureInput = comparableLineageValue(lineageValue(inputValues, metric));
        const azureValue = comparableLineageValue(lineageValue(azureOutput, metric));
        const storedValue = comparableLineageValue(lineageValue(storedIntelligence, metric));
        const sourceMissing = stackCTRLSource === null;
        const inputMissing = enterpriseAzureInput === null;
        return {
            metric,
            stackCTRLSource,
            enterpriseAzureInput,
            azureOutput: azureValue,
            storedIntelligence: storedValue,
            status: sourceMissing || inputMissing
                ? 'MISSING'
                : Object.is(stackCTRLSource, enterpriseAzureInput) ? 'MATCH' : 'MISMATCH',
            azureOutputStatus: azureValue === null ? 'NOT_APPLICABLE' : 'AVAILABLE'
        };
    });
    return {
        rows,
        mismatches: rows.filter(row => row.stackCTRLSource !== null && (row.enterpriseAzureInput === null || row.status === 'MISMATCH'))
    };
}

function sourceAlignmentFailure(comparison, domainName) {
    if (!comparison?.mismatches?.length) return null;
    const mismatchedFields = comparison.mismatches.map(row => row.metric);
    return {
        status: 'failed_source_mismatch',
        mismatchedFields,
        errorMessage: `StackCTRL source mismatch for ${domainName}: ${mismatchedFields.join(', ')}`
    };
}

function sourceStaleFailure(sourceHealth, domainName) {
    if (sourceHealth?.status !== 'stale') return null;
    const age = sourceHealth.freshness?.ageMinutes;
    const lastUpdated = sourceHealth.freshness?.lastUpdated;
    const ageDisplay = age != null ? `(${age} minutes old)` : '';
    return {
        status: 'source_stale',
        isStale: true,
        ageMinutes: age,
        lastUpdated,
        errorMessage: `${domainName} source_stale ${ageDisplay}; using latest stored evidence from ${lastUpdated || 'unknown refresh time'} and continuing analysis.`,
        reason: 'stored_evidence_fallback'
    };
}

function sourceMissingFailure(sourceHealth, domainName) {
    const status = String(sourceHealth?.status || 'missing');
    if (!['missing', 'error', 'not_configured'].includes(status)) return null;
    const warning = array(sourceHealth?.warnings).find(Boolean);
    return {
        status: 'blocked_missing_source',
        errorMessage: warning || `${domainName} has no complete saved evidence snapshot. Enterprise Deep Reporting continued with limited-data warnings and no Azure call for this domain.`,
        reason: status
    };
}

function periodWindow(periodType, referenceDate = new Date()) {
    const type = String(periodType || 'daily').toLowerCase();
    if (!['daily', 'weekly', 'monthly', 'yearly'].includes(type)) throw new Error('Period type must be daily, weekly, monthly, or yearly');
    const local = DateTime.fromJSDate(referenceDate instanceof Date ? referenceDate : new Date(referenceDate), { zone: 'utc' }).setZone('Africa/Johannesburg');
    const start = type === 'daily' ? local.startOf('day') : type === 'weekly' ? local.startOf('week') : type === 'monthly' ? local.startOf('month') : local.startOf('year');
    const end = type === 'daily' ? local.endOf('day') : type === 'weekly' ? local.endOf('week') : type === 'monthly' ? local.endOf('month') : local.endOf('year');
    return { periodType: type, periodStart: start.toUTC().toJSDate(), periodEnd: end.toUTC().toJSDate() };
}

function jsonArray(value) {
    return JSON.stringify(array(value));
}

function responseUsage(response = {}) {
    const usage = response.usage || {};
    return {
        inputTokens: Number(usage.input_tokens ?? usage.inputTokens ?? 0) || 0,
        outputTokens: Number(usage.output_tokens ?? usage.outputTokens ?? 0) || 0,
        totalTokens: Number(usage.total_tokens ?? usage.totalTokens ?? 0) || 0,
        requestBytes: Number(response.requestSizeBytes || 0),
        responseBytes: Number(response.responseSizeBytes || 0),
        retries: Number(response.retryCount || 0)
    };
}

function responseFinishReason(response = {}) {
    return response.finish_reason || response.finishReason || response.data?.finish_reason || response.choices?.[0]?.finish_reason || null;
}

function safeResponsePreview(text, maximum = 1000000) {
    if (text === null || text === undefined) return null;
    const value = typeof text === 'string' ? text : JSON.stringify(text);
    return value.slice(0, maximum);
}

function domainFailureStatus(results = []) {
    const statuses = results.map(result => result.status).filter(Boolean);
    const reasons = results.map(result => result.failureReason || result.errorMessage || '').join(' ').toLowerCase();
    if (statuses.includes('blocked_missing_source')) return 'blocked_missing_source';
    if (statuses.includes('blocked_stale_source')) return 'blocked_stale_source';
    if (statuses.length && statuses.every(status => status === 'failed_invalid_json')) return 'failed_invalid_json';
    if (statuses.includes('failed_source_mismatch') || reasons.includes('source_mismatch')) return 'failed_source_mismatch';
    if (statuses.includes('failed_rate_limited') || reasons.includes('rate_limited') || reasons.includes('429') || reasons.includes('throttl')) return 'failed_rate_limited';
    if (statuses.includes('failed_terminal') || reasons.includes('evidence_prepare_failed')) return 'failed_terminal';
    if (reasons.includes('econnreset') || reasons.includes('connection_reset') || statuses.includes('failed_connection')) return 'failed_terminal';
    if ((statuses.length && statuses.every(status => status === 'failed_storage')) || reasons.includes('storage')) return 'failed_storage';
    return 'failed';
}

function isConnectionFailureResult(result) {
    const text = `${result?.failureReason || ''} ${result?.errorMessage || ''}`.toLowerCase();
    return text.includes('econnreset')
        || text.includes('connection_reset')
        || text.includes('connection error')
        || text.includes('failed_connection')
        || result?.failureReason === 'connection_reset';
}

function buildDomainRunAudit({
    domain,
    companyId,
    snapshot,
    packageResult,
    usage = {},
    status,
    batchResults = null,
    failureReason = null,
    warningReasons = [],
    azureAttemptDiagnostics = [],
    currentBatch = null
} = {}) {
    const preparedRecordCount = array(packageResult?.allEvidence).length || Number(packageResult?.audit?.preparedForAzureCount || 0);
    return {
        domainKey: domain?.key || null,
        companyId: Number(companyId),
        snapshotId: Number(snapshot?.ID || 0),
        collectionStatus: packageResult?.package?.sourceHealth?.collectionStatus
            || packageResult?.current?.source?.sourceLineage?.collectionStatus
            || null,
        sourceFreshness: packageResult?.current?.source?.freshness || packageResult?.package?.sourceHealth || null,
        stackctrlRecordCount: Number(packageResult?.audit?.stackCTRLDataCount || 0),
        preparedRecordCount,
        analysedRecordCount: Number(packageResult?.audit?.sentToAzureCount || 0),
        omittedRecordCount: Number(packageResult?.audit?.evidenceOmittedCount || 0) + Number(packageResult?.audit?.omittedCount || 0),
        omittedReasons: array(packageResult?.package?.limitations?.missingDataWarnings),
        batchCount: Number(batchResults?.batchCount || packageResult?.audit?.batchPlan?.batchCount || 0),
        currentBatch: currentBatch ?? batchResults?.currentBatch ?? null,
        azureAttemptCount: Number(usage?.retries || 0) + 1,
        azureStatus: status,
        storageStatus: status,
        finalDomainStatus: status,
        warningReasons: array(warningReasons),
        failureReason: failureReason || null,
        azureAttemptDiagnostics: array(azureAttemptDiagnostics)
    };
}

function classifyFailureStatus(error) {
    const message = String(error?.message || '').toLowerCase();
    if (message.includes('source mismatch') || message.includes('source_mismatch')) return 'failed_source_mismatch';
    if (message.includes('json')) return 'failed_invalid_json';
    if (error?.azureMetadata?.connectionReset || message.includes('econnreset') || error?.azureMetadata?.connectionError) return 'failed_connection';
    if (error?.azureMetadata?.rateLimited || error?.azureMetadata?.statusCode === 429 || message.includes('429') || message.includes('throttl') || message.includes('rate')) return 'failed_rate_limited';
    if (error?.code || message.includes('sql') || message.includes('mysql') || message.includes('database') || message.includes('storage')) return 'failed_storage';
    return 'failed';
}

function rollupRunStatus(results = []) {
    if (!results.length) return 'failed';
    if (results.every(result => result.status === 'completed')) return 'completed';
    if (results.every(result => /^(failed|blocked|skipped)/.test(String(result.status || '')))) return domainFailureStatus(results);
    return 'completed_with_warnings';
}

function isSuccessfulDomainStatus(status) {
    return SUCCESSFUL_DOMAIN_STATUSES.has(String(status || ''));
}

function buildDomainRunSummary(domainRows = [], queuedDomainKeys = []) {
    const byKey = new Map(domainRows.map(row => [row.domainKey, row]));
    const queue = queuedDomainKeys.length ? queuedDomainKeys : [...byKey.keys()];
    const summary = {
        totalDomains: queue.length,
        includedDomains: [],
        skippedDomains: [],
        blockedDomains: [],
        failedDomains: [],
        successfulDomains: [],
        pendingDomains: []
    };
    for (const domainKey of queue) {
        const row = byKey.get(domainKey);
        if (!row) {
            summary.pendingDomains.push(domainKey);
            continue;
        }
        const status = String(row.status || '');
        if (isSuccessfulDomainStatus(status)) summary.successfulDomains.push(domainKey);
        else if (SKIPPED_DOMAIN_STATUSES.has(status)) summary.skippedDomains.push({ domainKey, status, errorMessage: row.errorMessage || null });
        else if (status.startsWith('blocked')) summary.blockedDomains.push({ domainKey, status, errorMessage: row.errorMessage || null });
        else if (status.startsWith('failed')) summary.failedDomains.push({ domainKey, status, errorMessage: row.errorMessage || null });
        else summary.includedDomains.push({ domainKey, status });
    }
    return summary;
}

// Batch evidence into safe chunks for sequential Azure processing.
function splitIntoBatches(evidence, { maxItems = DEFAULT_MAX_ITEMS_PER_BATCH, maxBytes = DEFAULT_MAX_INPUT_BYTES, estimateBytes = null } = {}) {
    const batches = [];
    const items = array(evidence);
    let current = [];
    const safeMaxItems = Math.max(1, Number(maxItems) || DEFAULT_MAX_ITEMS_PER_BATCH);
    const safeMaxBytes = Math.max(50000, Number(maxBytes) || DEFAULT_MAX_INPUT_BYTES);

    function wouldExceed(candidate) {
        if (candidate.length > safeMaxItems) return true;
        if (typeof estimateBytes !== 'function') return false;
        return candidate.length > 1 && estimateBytes(candidate) > safeMaxBytes;
    }

    for (const item of items) {
        const candidate = [...current, item];
        if (current.length && wouldExceed(candidate)) {
            batches.push({ number: batches.length + 1, items: current });
            current = [item];
        } else {
            current = candidate;
        }
    }
    if (current.length || !batches.length) batches.push({ number: batches.length + 1, items: current });
    return batches;
}

function securityAlertSemantics(item) {
    const data = item?.data && typeof item.data === 'object' ? item.data : (item || {});
    const text = value => String(value || '').trim().toLowerCase();
    const severity = text(data.severity || data.alertSeverity || item?.severity || 'unknown');
    const category = text(data.category || data.alertCategory || data.classification || data.type || item?.evidenceType || 'uncategorized');
    const incidentType = text(data.incidentType || data.detectionSource || data.eventType || data.kind || item?.evidenceType || 'unknown');
    const source = text(data.source || data.sourceSystem || data.provider || data.serviceSource || item?.sourceLabel || 'stackctrl');
    const affectedEntity = text(
        data.affectedEntity || data.userPrincipalName || data.user || data.userName || data.deviceName ||
        data.device || data.hostName || data.ipAddress || item?.entityKey || 'unassigned'
    );
    const patternSource = text(data.title || data.displayName || data.alertName || data.description || category);
    const repeatedPattern = patternSource
        .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '<id>')
        .replace(/\b\d+\b/g, '<n>')
        .replace(/\s+/g, ' ')
        .slice(0, 160);
    return { severity, category, incidentType, source, affectedEntity, repeatedPattern };
}

function splitSecurityAlertsIntoBatches(evidence, options = {}) {
    const severityRank = { critical: 0, high: 1, medium: 2, low: 3, informational: 4, unknown: 5 };
    const ordered = array(evidence).map((item, originalIndex) => ({ item, originalIndex, semantics: securityAlertSemantics(item) }))
        .sort((left, right) => {
            const severityDifference = (severityRank[left.semantics.severity] ?? 5) - (severityRank[right.semantics.severity] ?? 5);
            if (severityDifference) return severityDifference;
            const leftKey = [left.semantics.category, left.semantics.incidentType, left.semantics.source, left.semantics.repeatedPattern, left.semantics.affectedEntity].join('|');
            const rightKey = [right.semantics.category, right.semantics.incidentType, right.semantics.source, right.semantics.repeatedPattern, right.semantics.affectedEntity].join('|');
            return leftKey.localeCompare(rightKey) || left.originalIndex - right.originalIndex;
        });
    const batches = splitIntoBatches(ordered.map(entry => entry.item), options);
    return batches.map(batch => {
        const semantics = batch.items.map(securityAlertSemantics);
        const values = key => [...new Set(semantics.map(item => item[key]).filter(Boolean))];
        return {
            ...batch,
            semanticGrouping: {
                severities: values('severity'), categories: values('category'), incidentTypes: values('incidentType'),
                sources: values('source'), affectedEntities: values('affectedEntity'), repeatedAlertPatterns: values('repeatedPattern')
            }
        };
    });
}

// Safely parse JSON with error diagnostics
function parseJsonWithDiagnostics(text, schema = null) {
    if (text && typeof text === 'object') {
        return { success: true, value: text, error: null };
    }
    try {
        const value = JSON.parse(text);
        return { success: true, value, error: null };
    } catch (error) {
        const preview = text ? text.slice(0, 200) + (text.length > 200 ? '...' : '') : '[empty response]';
        const suffix = text ? text.slice(-100) : '[empty response]';
        return {
            success: false,
            value: null,
            error: String(error.message),
            preview,
            suffix,
            fullLength: text?.length || 0
        };
    }
}

function repairTruncatedJson(text) {
    if (typeof text !== 'string' || !text.trim()) return { success: false, value: null, error: 'Response is empty' };
    const original = text.trim();
    const parsed = parseJsonWithDiagnostics(original);
    if (parsed.success) return { ...parsed, repairedText: original, repaired: false };

    const stack = [];
    let inString = false;
    let escaped = false;
    for (const character of original) {
        if (inString) {
            if (escaped) {
                escaped = false;
            } else if (character === '\\') {
                escaped = true;
            } else if (character === '"') {
                inString = false;
            }
            continue;
        }
        if (character === '"') {
            inString = true;
        } else if (character === '{' || character === '[') {
            stack.push(character);
        } else if (character === '}' || character === ']') {
            const expected = character === '}' ? '{' : '[';
            if (stack.at(-1) !== expected) return { success: false, value: null, error: parsed.error };
            stack.pop();
        }
    }

    if (!inString && !stack.length) return { success: false, value: null, error: parsed.error };
    let candidate = original;
    if (inString) {
        if (escaped) candidate += '\\';
        candidate += '"';
    } else {
        candidate = candidate.replace(/,\s*$/, '');
    }
    for (let index = stack.length - 1; index >= 0; index -= 1) {
        candidate += stack[index] === '{' ? '}' : ']';
    }
    const repaired = parseJsonWithDiagnostics(candidate);
    return repaired.success
        ? { ...repaired, repairedText: candidate, repaired: true }
        : { success: false, value: null, error: repaired.error || parsed.error };
}

// Request repair of truncated JSON from Azure
function createJsonRepairPrompt(invalidJson) {
    return `Repair the supplied response into valid JSON only.
Preserve readable alert names, user emails, device names, source metrics, findings, risks, recommendations, business impact, and evidence references already present.
Keep internal IDs alongside readable entity names, never as replacements for them.
If the response was truncated, discard only the incomplete trailing value and close the JSON structure. No markdown, code fences, or text outside JSON.

INVALID RESPONSE:
${safeResponsePreview(invalidJson, 24000)}`;
}

function createEnterpriseIntelligenceService({
    pool,
    azureOpenAI,
    schedulerService,
    intelligenceService = null,
    logger = console,
    wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
    config = {}
} = {}) {
    if (!pool || !azureOpenAI || !schedulerService) throw new Error('Enterprise Intelligence requires database, Azure, and historical scheduler services');

    const configuredDomainDelayMs = Number(config.domainDelayMs ?? process.env.ENTERPRISE_AI_DOMAIN_DELAY_MS);
    const configuredMaxRetries = Number(config.maxRetries ?? process.env.ENTERPRISE_AI_MAX_RETRIES);

    const settings = Object.freeze({
        domainDelayMs: Math.max(0, Number.isFinite(configuredDomainDelayMs) ? configuredDomainDelayMs : DEFAULT_DOMAIN_DELAY_MS),
        maxRetries: Math.max(0, Number.isFinite(configuredMaxRetries) ? configuredMaxRetries : 3),
        concurrency: 1,
        maxInputBytes: Math.min(DEFAULT_MAX_INPUT_BYTES, Math.max(50000, Number(config.maxInputBytes ?? process.env.ENTERPRISE_AI_MAX_INPUT_BYTES_PER_DOMAIN) || DEFAULT_MAX_INPUT_BYTES)),
        maxItemsPerBatch: Math.min(DEFAULT_MAX_ITEMS_PER_BATCH, Math.max(1, Number(config.maxItemsPerBatch ?? process.env.ENTERPRISE_AI_MAX_ITEMS_PER_BATCH) || DEFAULT_MAX_ITEMS_PER_BATCH)),
        heavyDomainMaxItemsPerBatch: Math.min(DEFAULT_HEAVY_DOMAIN_MAX_ITEMS_PER_BATCH, Math.max(1, Number(config.heavyDomainMaxItemsPerBatch ?? process.env.ENTERPRISE_AI_HEAVY_MAX_ITEMS_PER_BATCH) || DEFAULT_HEAVY_DOMAIN_MAX_ITEMS_PER_BATCH)),
        thresholdBatchMaxItems: Math.min(DEFAULT_THRESHOLD_BATCH_MAX_ITEMS, Math.max(1, Number(config.thresholdBatchMaxItems ?? process.env.ENTERPRISE_AI_THRESHOLD_MAX_ITEMS_PER_BATCH) || DEFAULT_THRESHOLD_BATCH_MAX_ITEMS)),
        maxDomainOutputTokens: Math.max(1000, Number(config.maxDomainOutputTokens ?? process.env.ENTERPRISE_AI_MAX_OUTPUT_TOKENS_PER_DOMAIN) || DEFAULT_DOMAIN_OUTPUT_TOKENS),
        maxSynthesisOutputTokens: Math.max(2000, Number(config.maxSynthesisOutputTokens ?? process.env.ENTERPRISE_AI_MAX_OUTPUT_TOKENS_SYNTHESIS) || DEFAULT_SYNTHESIS_OUTPUT_TOKENS),
        maxTotalTokens: Math.max(10000, Number(config.maxTotalTokens ?? process.env.ENTERPRISE_AI_MAX_TOTAL_TOKENS) || DEFAULT_MAX_TOTAL_TOKENS),
        requestTimeoutMs: Math.max(60000, Number(config.requestTimeoutMs ?? process.env.ENTERPRISE_AI_REQUEST_TIMEOUT_MS) || 180000),
        terminalStaleMs: Math.max(5 * 60 * 1000, Number(config.terminalStaleMs ?? process.env.ENTERPRISE_AI_TERMINAL_STALE_MS) || (30 * 60 * 1000))
    });
    let rateLimitCircuitOpenUntil = 0;

    function openRateLimitCircuit(retryAfterMs) {
        const delayMs = Math.max(1000, Number(retryAfterMs) || ENTERPRISE_RATE_LIMIT_RETRY_MAX_MS);
        rateLimitCircuitOpenUntil = Math.max(rateLimitCircuitOpenUntil, Date.now() + delayMs);
        return delayMs;
    }

    function assertRateLimitCircuitClosed() {
        const retryAfterMs = rateLimitCircuitOpenUntil - Date.now();
        if (retryAfterMs <= 0) return;
        const error = new Error(`Enterprise Azure rate-limit circuit is open. Retry after ${Math.ceil(retryAfterMs / 60000)} minute(s).`);
        error.enterpriseStatus = 'failed_rate_limited';
        error.azureMetadata = { rateLimited: true, retryAfterMs };
        throw error;
    }

    function captureRateLimit(error) {
        const metadata = error?.azureMetadata || {};
        const message = String(error?.message || '').toLowerCase();
        if (!metadata.rateLimited && metadata.statusCode !== 429 && !message.includes('429') && !message.includes('throttl')) return false;
        openRateLimitCircuit(metadata.retryAfterMs ?? metadata.lastRetryDelayMs);
        error.enterpriseStatus = 'failed_rate_limited';
        return true;
    }

    async function loadSnapshot(companyId, snapshotId = null) {
        const where = snapshotId ? 'ID = ? AND CompanyID = ?' : 'CompanyID = ? ORDER BY ID DESC LIMIT 1';
        const params = snapshotId ? [Number(snapshotId), Number(companyId)] : [Number(companyId)];
        const [rows] = await pool.query(
            `SELECT ID, CompanyID, TenantKey, SnapshotType, PeriodStart, PeriodEnd,
                    SourceFreshnessJson, MetricsJson, ContextJson, DataCompletenessScore, CreatedAt
             FROM StackCTRLTenantEvidenceSnapshots WHERE ${where}`,
            params
        );
        if (!rows.length) throw new Error('Create a frozen StackCTRL snapshot before running Enterprise Deep Reporting');
        return rows[0];
    }

    async function loadKnowledge(domainKey) {
        try {
            const [rows] = await pool.query(
                `SELECT Title, SourceType, SourceUrl, ContentSummary, BestPracticeJson
                 FROM StackCTRLKnowledgeBase
                 WHERE DomainKey = ? AND IsActive = 1
                 ORDER BY UpdatedAt DESC, ID DESC LIMIT 20`,
                [domainKey]
            );
            return rows.map(row => ({
                title: row.Title,
                sourceType: row.SourceType,
                sourceUrl: row.SourceUrl,
                contentSummary: row.ContentSummary,
                bestPractices: safeValue(parseJson(row.BestPracticeJson, {}), 0, { maxArray: 20 })
            }));
        } catch (error) {
            if (error?.code !== 'ER_NO_SUCH_TABLE') throw error;
            return [];
        }
    }

    async function loadPreviousDomain(companyId, domainKey, currentRunId) {
        const [rows] = await pool.query(
            `SELECT ID, PeriodType, PeriodStart, PeriodEnd, HealthScore, RiskScore, RiskLevel,
                    DomainExecutiveSummary, BusinessImpact, CurrentPosture, FindingsJson,
                    RisksJson, RecommendationsJson, TrendAnalysisJson, ConfidenceScore, CreatedAt
             FROM StackCTRLTenantDomainIntelligence
             WHERE CompanyID = ? AND DomainKey = ? AND Status = 'completed' AND RunID <> ?
             ORDER BY ID DESC LIMIT 1`,
            [companyId, domainKey, currentRunId]
        );
        if (!rows[0]) return null;
        const row = rows[0];
        return {
            id: row.ID,
            periodType: row.PeriodType,
            periodStart: row.PeriodStart,
            periodEnd: row.PeriodEnd,
            healthScore: row.HealthScore,
            riskScore: row.RiskScore,
            riskLevel: row.RiskLevel,
            executiveSummary: row.DomainExecutiveSummary,
            businessImpact: row.BusinessImpact,
            currentPosture: row.CurrentPosture,
            topFindings: array(parseJson(row.FindingsJson, [])).slice(0, 10),
            topRisks: array(parseJson(row.RisksJson, [])).slice(0, 10),
            topRecommendations: array(parseJson(row.RecommendationsJson, [])).slice(0, 10),
            trends: array(parseJson(row.TrendAnalysisJson, [])).slice(0, 10),
            confidenceScore: row.ConfidenceScore,
            createdAt: row.CreatedAt
        };
    }

    function domainFromSnapshot(snapshot, domain) {
        const context = parseJson(snapshot.ContextJson, {}) || {};
        const metrics = parseJson(snapshot.MetricsJson, {}) || {};
        const source = array(context.sources).find(item => item.sourceKey === domain.sourceKey) || {};
        const risk = context.riskEngine || metrics.stackctrl_risk || {};
        const health = risk.domainHealthScores?.[domain.riskKey] ?? risk.executiveKPIs?.[domain.healthKey] ?? metrics.executive_kpis?.[domain.healthKey] ?? null;
        const riskScore = risk.domainRiskScores?.[domain.riskKey] ?? metrics.stackctrl_risk?.domainRiskScores?.[domain.riskKey] ?? null;
        const sourceEvidence = source.evidence && typeof source.evidence === 'object' ? source.evidence : [];
        const evidence = filterDomainEvidence(sourceEvidence, domain.key);
        const sourceMetrics = source.metrics || metrics[domain.sourceKey] || {};
        const dashboardMetrics = source.dashboardMetrics || {};
        const dashboardBackedDomains = DASHBOARD_BACKED_ENTERPRISE_DOMAINS;
        const currentMetrics = dashboardBackedDomains.includes(domain.key) && Object.keys(dashboardMetrics).length
            ? { ...sourceMetrics, ...dashboardMetrics }
            : sourceMetrics;
        return {
            context,
            source,
            metrics: currentMetrics,
            sourceMetrics,
            dashboardMetrics,
            calculatedIndicators: source.calculatedIndicators || {},
            evidence,
            healthScore: numberOrNull(health),
            riskScore: numberOrNull(riskScore),
            riskLevel: riskScore == null ? 'not_scored' : riskScore >= 75 ? 'critical' : riskScore >= 50 ? 'high' : riskScore >= 25 ? 'moderate' : 'low'
        };
    }

    function historicalDomainContext(historicalContext, domain) {
        const result = {};
        for (const [key, comparison] of Object.entries(historicalContext?.comparisons || {})) {
            const snapshot = comparison?.snapshot;
            if (!snapshot) {
                result[key] = { availability: 'unavailable', warning: `No ${key} baseline is available.` };
                continue;
            }
            const baselineContext = snapshot.context || {};
            const baselineSource = array(baselineContext.sources).find(source => source.sourceKey === domain.sourceKey) || {};
            const baselineRisk = baselineContext.riskEngine || {};
            result[key] = {
                availability: comparison.availability,
                snapshotId: snapshot.snapshotId,
                createdAt: snapshot.createdAt,
                differenceMinutes: comparison.differenceMinutes,
                sourceStatus: baselineSource.status || null,
                metrics: safeValue(baselineSource.metrics || snapshot.metrics?.[domain.sourceKey] || {}, 0, { maxArray: 0, maxString: 800 }),
                healthScore: numberOrNull(baselineRisk.domainHealthScores?.[domain.riskKey] ?? baselineRisk.executiveKPIs?.[domain.healthKey]),
                riskScore: numberOrNull(baselineRisk.domainRiskScores?.[domain.riskKey]),
                metricChanges: safeValue(Object.fromEntries(Object.entries(comparison.metricChanges || {}).filter(([name]) =>
                    name.startsWith(`${domain.sourceKey}.`) || name.endsWith(`domainRiskScores.${domain.riskKey}`) || (domain.healthKey && name.endsWith(domain.healthKey))
                )), 0, { maxArray: 0 })
            };
        }
        return result;
    }

    async function buildDomainPackage({ companyId, snapshot, runId, domain, historicalContext }) {
        const current = domainFromSnapshot(snapshot, domain);
        current.evidence = enrichDomainEvidence(current.source, domain, current.evidence);
        const knowledge = await loadKnowledge(domain.key);
        const previousAnalysis = await loadPreviousDomain(companyId, domain.key, runId);
        const flattenedEvidence = flattenDomainEvidence(current.evidence, { rootPath: `${domain.sourceKey}.evidence`, domainKey: domain.key });
        const evidenceCatalog = buildEvidenceCatalog(current.evidence, domain, snapshot.ID);
        const stackCTRLDataCount = flattenedEvidence.length;
        const sourceEvidenceLineage = current.source.sourceLineage || {};
        const manualFilteredDomain = ['governance', 'compliance', 'operations'].includes(domain.key);
        const manualExcludedCount = manualFilteredDomain ? Number(sourceEvidenceLineage.manualRowsExcluded || sourceEvidenceLineage.omittedRecordCount || 0) : 0;
        const expectedRecordCount = Number(sourceEvidenceLineage.evidenceRecordCount || evidenceCatalog.primaryTable?.count || stackCTRLDataCount);
        const evidenceOmittedCount = expectedRecordCount > stackCTRLDataCount
            ? expectedRecordCount - stackCTRLDataCount
            : 0;
        
        const base = {
            contextType: 'stackctrl_enterprise_domain_intelligence',
            schemaVersion: 1,
            mode: domain.mode,
            companyId,
            snapshotId: Number(snapshot.ID),
            snapshotCreatedAt: snapshot.CreatedAt,
            domain: { key: domain.key, name: domain.name, focusAreas: domain.focus },
            sourceHealth: {
                sourceKey: domain.sourceKey,
                status: current.source.status || 'missing',
                isExpected: Boolean(current.source.isExpected),
                freshness: safeValue(current.source.freshness || {}, 0, { maxArray: 0 }),
                warnings: array(current.source.warnings).slice(0, 20),
                errorMessage: current.source.errorMessage || null,
                evidenceCount: stackCTRLDataCount
            },
            currentMetrics: safeValue(current.metrics, 0, { maxDepth: 7, maxArray: 10, maxString: 1200 }),
            dashboardMetrics: safeValue(current.dashboardMetrics, 0, { maxDepth: 6, maxArray: 10 }),
            calculatedIndicators: safeValue(current.calculatedIndicators, 0, { maxDepth: 6, maxArray: 10 }),
            authoritativeScores: { healthScore: current.healthScore, riskScore: current.riskScore, riskLevel: current.riskLevel },
            historicalComparisons: historicalDomainContext(historicalContext, domain),
            previousDomainAnalysis: previousAnalysis,
            knowledgeGrounding: knowledge,
            knowledgeWarning: knowledge.length ? null : `No curated ${domain.name} knowledge references are currently available.`,
            evidenceCatalog,
            evidence: [],
            limitations: {
                rawVendorPayloadIncluded: false,
                rawSnapshotContextIncluded: false,
                evidenceCompleteness: {
                    expectedEntityRows: expectedRecordCount,
                    includedEntityRows: stackCTRLDataCount,
                    omittedEntityRows: evidenceOmittedCount,
                    catalogCategories: evidenceCatalog.categoryCount,
                    catalogEntityRows: evidenceCatalog.catalogEntityCount,
                    manualRowsExcluded: manualExcludedCount,
                    complete: evidenceOmittedCount === 0 && stackCTRLDataCount > 0
                },
                missingDataWarnings: [
                    ...array(current.source.warnings),
                    ...(manualExcludedCount > 0 ? [`${manualExcludedCount} manual evidence row(s) were intentionally excluded from Azure input; only API-connected evidence was prepared.`] : []),
                    ...(evidenceOmittedCount > 0 ? [`${evidenceOmittedCount} expected dashboard entity row(s) were not included in the Azure evidence payload.`] : []),
                    ...(!knowledge.length ? [`Curated ${domain.name} best-practice references were unavailable.`] : [])
                ]
            }
        };

        const sourceLineageValues = {
            ...(DASHBOARD_BACKED_ENTERPRISE_DOMAINS.includes(domain.key)
                ? { ...current.sourceMetrics, ...current.dashboardMetrics }
                : current.metrics),
            healthScore: current.healthScore,
            riskScore: current.riskScore,
            'sourceHealth.evidenceCount': stackCTRLDataCount,
            snapshotId: Number(snapshot.ID),
            sourceLastUpdated: current.source.freshness?.lastUpdated || snapshot.CreatedAt || null
        };
        const inputLineageValues = {
            ...base.currentMetrics,
            healthScore: base.authoritativeScores.healthScore,
            riskScore: base.authoritativeScores.riskScore,
            'sourceHealth.evidenceCount': base.sourceHealth.evidenceCount,
            snapshotId: base.snapshotId,
            sourceLastUpdated: base.sourceHealth.freshness?.lastUpdated || base.snapshotCreatedAt || null
        };
        const lineageFields = domain.key === 'identity'
            ? IDENTITY_LINEAGE_FIELDS
            : domain.key === 'devices'
            ? DEVICE_LINEAGE_FIELDS
            : domain.key === 'email_security'
            ? EMAIL_LINEAGE_FIELDS
            : domain.key === 'cloudflare_network_security'
            ? NETWORK_LINEAGE_FIELDS
            : domain.key === 'backup'
            ? BACKUP_LINEAGE_FIELDS
            : domain.key === 'applications'
            ? APPLICATIONS_LINEAGE_FIELDS
            : domain.key === 'security_alerts'
            ? SECURITY_LINEAGE_FIELDS
            : domain.key === 'governance'
            ? GOVERNANCE_LINEAGE_FIELDS
            : domain.key === 'compliance'
            ? COMPLIANCE_LINEAGE_FIELDS
            : domain.key === 'operations'
            ? OPERATIONS_LINEAGE_FIELDS
            : [...new Set([...Object.keys(sourceLineageValues), ...Object.keys(inputLineageValues)])];
        const sourceAlignment = buildDataLineageComparison({
            fields: lineageFields,
            sourceValues: sourceLineageValues,
            inputValues: inputLineageValues
        });
        base.dataLineage = {
            sourceKey: domain.sourceKey,
            sourceBuilder: current.source.sourceLineage?.sourceBuilder || (
                domain.key === 'identity' ? 'identityDashboardContext'
                    : domain.key === 'devices' ? 'deviceDashboardContext'
                    : domain.key === 'email_security' ? 'emailSecurityDashboardContext'
                    : domain.key === 'cloudflare_network_security' ? 'cloudflareDashboardContext'
                    : domain.key === 'backup' ? 'backupDashboardContext'
                    : domain.key === 'applications' ? 'applicationsDashboardContext'
                    : domain.key === 'security_alerts' ? 'securityAlertsDashboardContext'
                    : domain.key === 'governance' ? 'governanceDashboardContext'
                    : domain.key === 'compliance' ? 'complianceDashboardContext'
                    : domain.key === 'operations' ? 'operationsDashboardContext'
                    : 'dashboardContext'
            ),
            sourceLayer: current.source.sourceLineage?.sourceLayer || 'tenant_evidence_snapshot.dashboardMetrics',
            evidenceSnapshotId: current.source.sourceLineage?.evidenceSnapshotId || null,
            evidenceCollectedAt: current.source.sourceLineage?.collectedAt || null,
            sourceFetchedAt: current.source.sourceLineage?.sourceFetchedAt || null,
            sourceEndpoint: current.source.sourceLineage?.sourceEndpoint || null,
            collectionTrigger: current.source.sourceLineage?.collectionTrigger || null,
            collectionStatus: current.source.sourceLineage?.collectionStatus || null,
            evidenceIsComplete: current.source.sourceLineage?.isComplete ?? null,
            totalRows: current.source.sourceLineage?.totalRows ?? stackCTRLDataCount,
            apiConnectedRows: current.source.sourceLineage?.apiConnectedRows ?? stackCTRLDataCount,
            manualRowsExcluded: current.source.sourceLineage?.manualRowsExcluded ?? 0,
            evidenceRecordCount: current.source.sourceLineage?.evidenceRecordCount ?? stackCTRLDataCount,
            evidenceOmittedRecordCount: current.source.sourceLineage?.omittedRecordCount ?? 0,
            incompleteReason: current.source.sourceLineage?.incompleteReason || null,
            errorMessage: current.source.sourceLineage?.errorMessage || null,
            sourceName: domain.name,
            sourceLastUpdated: sourceLineageValues.sourceLastUpdated,
            sourceAge: current.source.freshness?.ageMinutes,
            sourceAgeLabel: current.source.freshness?.ageMinutes != null ? `${Math.floor(current.source.freshness.ageMinutes / 60)} hour(s) ${current.source.freshness.ageMinutes % 60} minute(s)` : null,
            sourceStatus: current.source.status || 'unknown',
            sourceIsStale: current.source.status === 'stale',
            snapshotId: Number(snapshot.ID),
            runId: Number(runId),
            rows: sourceAlignment.rows
        };

        // For batching: don't permanently reduce evidence, just use what we have
        const inputSizeBytes = bytes(base);
        const batchPlan = buildEvidenceBatchPlan(flattenedEvidence, splitIntoBatches(flattenedEvidence, {
            maxItems: settings.maxItemsPerBatch,
            maxBytes: settings.maxInputBytes
        }));
        return {
            package: base,
            current,
            allEvidence: flattenedEvidence,
            evidenceCatalog,
            sourceAlignment,
            audit: {
                stackCTRLDataCount,
                preparedForAzureCount: flattenedEvidence.length,
                sentToAzureCount: 0, // Successfully analysed by Azure; updated after completed batches
                omittedCount: manualExcludedCount,
                metricsIncludedCount: primitiveMetricCount(base.currentMetrics) + primitiveMetricCount(base.dashboardMetrics) + primitiveMetricCount(base.calculatedIndicators),
                evidenceIncludedCount: stackCTRLDataCount,
                evidenceOmittedCount,
                catalogEntityCount: evidenceCatalog.catalogEntityCount,
                catalogCategoryCount: evidenceCatalog.categoryCount,
                historicalComparisonsIncluded: Object.values(base.historicalComparisons).filter(item => item.availability === 'available').length,
                inputSizeBytes,
                batchPlan,
                evidenceSample: flattenedEvidence.slice(0, 5).map(item => ({
                    sourcePath: item.sourcePath,
                    sourceLabel: item.sourceLabel,
                    evidenceType: item.evidenceType,
                    entityKey: item.entityKey || null
                }))
            }
        };
    }

    function securityAlertsBatchPrompt(packageValue) {
        return `Analyse this Security Alerts evidence batch. Return valid JSON only; no markdown.
Process every supplied evidence row and keep exact batch accounting. Group repeated alert patterns without losing the human-readable alert, user, or device details that explain the evidence.
Each finding, risk, recommendation, and management action must use these fields:
title, severity, category, status, sourceDomain, sourceMetric, sourceMetrics, snapshotId, evidenceSource,
sourceAlertIds, affectedEntities, affectedEntityIds, evidenceRows, recordIds, whatHappened, whyItMatters, businessImpact,
recommendedAction, recommendedActions, suggestedOwner, suggestedDueDate.
affectedEntities and evidenceRows must include readable names where present: alert display name/title, userPrincipalName/email, device display name, application/control name, severity/status, plus the internal evidence ID. IDs may supplement readable evidence but must never replace it.
Return exactly:
{
  "domainExecutiveSummary": "one compact sentence",
  "keyFindings": [],
  "risks": [],
  "recommendations": [],
  "controlAssessment": [],
  "managementActions": [],
  "trendAnalysis": [],
  "evidenceUsed": [],
  "evidenceGaps": [],
  "missingDataWarnings": [],
  "assumptions": [],
  "confidenceScore": null,
  "evidenceLimitations": {}
}
Prioritize accurate evidence, clear findings, risks, recommendations, business impact, and exact source references. Do not invent entities.

STACKCTRL SECURITY ALERTS BATCH:
${JSON.stringify(packageValue)}`;
    }

    function domainPrompt(domain, packageValue) {
        if (domain.key === 'security_alerts' && packageValue?.batchMetadata) {
            return securityAlertsBatchPrompt(packageValue);
        }
        return `You are StackCTRL Enterprise Intelligence. Analyse only the supplied frozen StackCTRL ${domain.name} package.
Azure builds structured enterprise intelligence; Power BI builds the final report. Do not create layouts, visuals, HTML, dashboard instructions, or Power BI files.
Do not claim direct access to Microsoft Graph, Cloudflare, or another vendor. Do not invent missing controls or evidence.
Every posture claim must identify supporting evidence, assessed areas, confirmed controls, unknown controls, gaps, movement, business impact, and recommended action.
StackCTRL authoritative scores must be justified but never recalculated or replaced.

Use BOTH summary metrics and entity-level evidence:
- currentMetrics, dashboardMetrics, and calculatedIndicators provide executive counts and scores.
- evidenceCatalog.categories contains categorized dashboard entity rows tied to sourceMetric keys.
- evidence[] contains individual entity rows from the StackCTRL dashboard table for this batch.
Every finding, risk, and recommendation MUST be evidence-backed. Do not state a gap without naming affected users, devices, apps, controls, policies, alerts, or other entities from the supplied evidence.
Visible output must be human-readable. Include userPrincipalName/email, device display name, alert title/display name, application/control/policy name, or another useful entity label whenever supplied. Keep internal IDs as evidence references alongside those names; never return an ID as the only description of an affected entity.

Return valid JSON only. No markdown. No code fences. No explanations outside JSON.
Return exactly these fields:
{
  "domainExecutiveSummary": "",
  "technicalSummary": "",
  "businessImpact": "",
  "currentPosture": "",
  "evidenceUsed": [],
  "evidenceGaps": [],
  "scoreJustification": "",
  "controlAssessment": {},
  "keyFindings": [],
  "risks": [],
  "recommendations": [],
  "trendAnalysis": [],
  "yesterdayVsToday": {},
  "whatImproved": [],
  "whatDeteriorated": [],
  "whatStayedTheSame": [],
  "missingDataWarnings": [],
  "assumptions": [],
  "confidenceScore": null,
  "managementActions": [],
  "powerBiSummary": {},
  "evidenceLimitations": {}
}

Finding fields: title, description, severity, status, whatHappened, whyItMatters, businessImpact, evidenceSummary, affectedEntities, affectedEntityIds, evidenceRows, recordIds, sourceDomain, sourceMetric, snapshotId, evidenceSource, suggestedOwner, suggestedDueDate.
Risk fields: title, description, severity, likelihood, impact, whatHappened, whyItMatters, businessImpact, evidenceSummary, affectedEntities, affectedEntityIds, evidenceRows, recordIds, sourceDomain, sourceMetric, snapshotId, evidenceSource, recommendation, suggestedOwner, suggestedDueDate.
Recommendation/action fields: title, detail, priority, whatHappened, whyItMatters, businessImpact, recommendedAction, affectedEntities, affectedEntityIds, evidenceRows, recordIds, sourceDomain, sourceMetric, snapshotId, evidenceSource, suggestedOwner, suggestedDueDate.
Control assessment items and trend fields must retain readable entity labels and the matching IDs whenever evidence exists.
Trend fields additionally include: metricName, currentValue, previousValue, changePercent, direction, comparisonPeriod, explanation.
evidenceUsed items: label, sourceMetric, entityCount, snapshotId, evidenceSource.
evidenceGaps items: gap, reason, omittedCount, sourceMetric.
evidenceLimitations: recordsSent, recordsOmitted, batchNumber, totalBatches, complete, omittedReasons.
Use empty arrays, objects, or null when evidence is unavailable. Clearly state limitations instead of filling gaps with assumptions.
Keep explanations clear and concise enough to return valid JSON for this smaller batch. Do not use markdown.

STACKCTRL DOMAIN PACKAGE:
${JSON.stringify(packageValue)}`;
    }

    function synthesisPrompt(packageValue) {
        return `You are StackCTRL Enterprise Intelligence. Create a premium enterprise cybersecurity synthesis from stored domain intelligence only.
Azure builds the intelligence; Power BI builds the report. Do not create layouts, visuals, HTML, styling instructions, report pages, or Power BI files.
Do not invent facts or recalculate StackCTRL scores. Reconcile conflicts, identify evidence gaps, explain business impact, and retain domain traceability.

Return valid JSON only. No markdown. No code fences. No explanations outside JSON.
Return exactly these fields:
{
  "enterpriseExecutiveSummary": {},
  "boardReport": {},
  "managementReport": {},
  "riskRegister": [],
  "recommendations": [],
  "trendAnalysis": [],
  "complianceReview": {},
  "governanceReview": {},
  "domainScorecard": [],
  "maturityAssessment": {},
  "businessImpactSummary": "",
  "topDecisionsRequired": [],
  "next30DaysPlan": [],
  "next90DaysPlan": [],
  "evidenceJustificationSummary": {},
  "limitationsAndAssumptions": [],
  "powerBiSummary": {}
}

Risk, recommendation, trend, and management action fields must follow the domain output field names. Preserve domain keys in every row-based item.

STORED STACKCTRL ENTERPRISE INTELLIGENCE:
${JSON.stringify(packageValue)}`;
    }

    // Build a domain analysis package for a specific batch of evidence
    function buildDomainBatchPackage(basePackage, batchEvidence, batchNumber, totalBatches, semanticGrouping = null, evidenceStartIndex = 0) {
        const categoryMap = new Map();
        for (const item of batchEvidence) {
            const key = String(item?.evidenceCategory || item?.sourceLabel || item?.evidenceType || 'evidenceRows');
            if (!categoryMap.has(key)) categoryMap.set(key, []);
            const data = item?.data ?? item;
            categoryMap.get(key).push({
                entityKey: item?.entityKey || entityRecordKey(data),
                sourcePath: item?.sourcePath || null,
                sourceAlertId: data?.sourceAlertId || data?.alertId || data?.SourceID || data?.id || null
            });
        }
        const batchCategories = [...categoryMap.entries()].map(([key, entities]) => ({
            key,
            label: key.replace(/[_-]+/g, ' ').replace(/\b\w/g, char => char.toUpperCase()),
            sourceMetric: batchEvidence.find(item => String(item?.evidenceCategory || item?.sourceLabel || item?.evidenceType || 'evidenceRows') === key)?.sourceMetric || key,
            count: entities.length,
            entities
        }));
        return {
            ...basePackage,
            evidenceCatalog: {
                ...basePackage.evidenceCatalog,
                categories: batchCategories,
                categoryCount: batchCategories.length,
                catalogEntityCount: batchEvidence.length,
                batchScoped: true
            },
            evidence: batchEvidence.map((item, index) => ({
                evidenceNumber: Number(evidenceStartIndex || 0) + index + 1,
                evidenceType: item?.evidenceType || item?.type || 'stored_evidence',
                sourceLabel: item?.sourceLabel || null,
                sourcePath: item?.sourcePath || null,
                evidenceCategory: item?.evidenceCategory || null,
                sourceMetric: item?.sourceMetric || null,
                entityKey: item?.entityKey || entityRecordKey(item?.data ?? item),
                data: safeEvidenceEntity(item?.data ?? item)
            })),
            current: {
                healthScore: basePackage.authoritativeScores?.healthScore ?? null,
                riskScore: basePackage.authoritativeScores?.riskScore ?? null,
                riskLevel: basePackage.authoritativeScores?.riskLevel || 'not_scored',
                metrics: basePackage.currentMetrics || {},
                dashboardMetrics: basePackage.dashboardMetrics || {},
                calculatedIndicators: basePackage.calculatedIndicators || {}
            },
            batchMetadata: {
                batchNumber,
                totalBatches,
                batchEvidentItemCount: batchEvidence.length,
                recordsSent: batchEvidence.length,
                evidenceRowsIncluded: batchEvidence.length,
                semanticGrouping
            },
            limitations: {
                ...basePackage.limitations,
                batchProcessing: true,
                batchNumber,
                totalBatches,
                recordsSent: batchEvidence.length,
                recordsOmitted: 0,
                evidenceRowsIncluded: batchEvidence.length
            }
        };
    }

    function domainMessages(domain, packageValue) {
        return [
            { role: 'system', content: DOMAIN_SYSTEM_MESSAGE },
            { role: 'user', content: domainPrompt(domain, packageValue) }
        ];
    }

    function estimateDomainRequestBytes(domain, packageValue) {
        return bytes({
            model: 'enterprise-deployment',
            input: domainMessages(domain, packageValue),
            temperature: 0.15,
            max_output_tokens: settings.maxDomainOutputTokens,
            store: false,
            text: { format: { type: 'json_object' } }
        });
    }

    // Store batch result in database
    async function storeBatch({
        companyId, snapshotId, runId, domain, batchNumber, totalBatches, batchEvidence, analysis, usage, status,
        errorMessage = null, failureReason = null, rawResponsePreview = null, azureFinishReason = null,
        jsonRepaired = false, jsonRepairMethod = null, recommendedRetryAfterMs = null, stackCTRLDataCount = 0,
        recordsRemaining: suppliedRecordsRemaining = null, semanticGrouping = null, attemptDiagnostics = null
    }) {
        const batchItemCount = batchEvidence.length;
        const recordsRemaining = suppliedRecordsRemaining == null
            ? Math.max(0, Number(stackCTRLDataCount || 0) - (batchNumber * batchItemCount))
            : Math.max(0, Number(suppliedRecordsRemaining));
        const estimatedInputTokens = Math.ceil(Number(usage.requestBytes || 0) / 4);
        const batchSummary = {
            summary: analysis?.domainExecutiveSummary || '',
            findingsCount: array(analysis?.keyFindings).length,
            risksCount: array(analysis?.risks).length,
            recommendationsCount: array(analysis?.recommendations).length,
            trendsCount: array(analysis?.trendAnalysis).length,
            jsonRepaired: Boolean(jsonRepaired),
            jsonRepairMethod,
            recommendedRetryAfterMs: recommendedRetryAfterMs == null ? null : Number(recommendedRetryAfterMs),
            batchNumber,
            totalBatches,
            recordsSent: batchItemCount,
            recordsRemaining,
            recordsOmitted: analysis ? 0 : batchItemCount,
            omissionReason: analysis ? null : (failureReason || errorMessage || 'batch_not_completed'),
            evidenceRowsIncluded: analysis ? batchItemCount : 0,
            estimatedInputTokens,
            actualInputTokens: usage.inputTokens,
            actualOutputTokens: usage.outputTokens,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            totalTokens: usage.totalTokens,
            thresholdUsed: settings.maxTotalTokens,
            retryCount: usage.retries || 0,
            retryOrCooldownOccurred: Boolean((usage.retries || 0) > 0 || recommendedRetryAfterMs),
            attemptDiagnostics: array(attemptDiagnostics),
            semanticGrouping,
            evidenceTypes: [...new Set(batchEvidence.map(item => item?.evidenceType).filter(Boolean))],
            firstEvidenceNumber: batchEvidence.length ? 1 : 0,
            lastEvidencePath: batchEvidence.at(-1)?.sourcePath || null
        };
        
        await pool.query(
            `INSERT INTO StackCTRLTenantDomainIntelligenceBatches
             (CompanyID, SnapshotID, RunID, DomainKey, DomainName, BatchNumber, BatchCount, Status,
              StackCTRLDataCount, BatchItemCount, SentToAzureCount, RemainingAfterBatch, OmittedFromThisBatch,
              InputSizeBytes, ResponseSizeBytes, InputTokens, OutputTokens, TotalTokens, RetryCount,
              BatchSummaryJson, FindingsJson, RisksJson, RecommendationsJson, TrendsJson,
              MissingDataWarningsJson, StartedAt, CompletedAt, ErrorMessage, FailureReason, RawResponsePreview, AzureFinishReason, CreatedAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), ?, ?, ?, ?, NOW())
             ON DUPLICATE KEY UPDATE
              Status = ?, StackCTRLDataCount = ?, BatchCount = ?, BatchItemCount = ?, SentToAzureCount = ?, RemainingAfterBatch = ?, OmittedFromThisBatch = ?, InputSizeBytes = ?, ResponseSizeBytes = ?,
              InputTokens = ?, OutputTokens = ?, TotalTokens = ?, RetryCount = ?,
              BatchSummaryJson = ?, FindingsJson = ?, RisksJson = ?, RecommendationsJson = ?, TrendsJson = ?,
              MissingDataWarningsJson = ?, CompletedAt = NOW(), ErrorMessage = ?, FailureReason = ?,
              RawResponsePreview = ?, AzureFinishReason = ?, UpdatedAt = NOW()`,
            [
                companyId, snapshotId, runId, domain.key, domain.name, batchNumber, totalBatches, status,
                stackCTRLDataCount, batchItemCount, analysis ? batchItemCount : 0, recordsRemaining, analysis ? 0 : batchItemCount,
                usage.requestBytes || 0, usage.responseBytes, usage.inputTokens, usage.outputTokens, usage.totalTokens, usage.retries || 0,
                JSON.stringify(batchSummary || {}),
                analysis ? jsonArray(analysis.keyFindings) : null,
                analysis ? jsonArray(analysis.risks) : null,
                analysis ? jsonArray(analysis.recommendations) : null,
                analysis ? jsonArray(analysis.trendAnalysis) : null,
                analysis ? jsonArray(analysis.missingDataWarnings) : null,
                errorMessage, failureReason, rawResponsePreview, azureFinishReason,
                // ON DUPLICATE KEY UPDATE values
                status, stackCTRLDataCount, totalBatches, batchItemCount, analysis ? batchItemCount : 0, recordsRemaining, analysis ? 0 : batchItemCount, usage.requestBytes || 0, usage.responseBytes,
                usage.inputTokens, usage.outputTokens, usage.totalTokens, usage.retries || 0,
                JSON.stringify(batchSummary || {}),
                analysis ? jsonArray(analysis.keyFindings) : null,
                analysis ? jsonArray(analysis.risks) : null,
                analysis ? jsonArray(analysis.recommendations) : null,
                analysis ? jsonArray(analysis.trendAnalysis) : null,
                analysis ? jsonArray(analysis.missingDataWarnings) : null,
                errorMessage, failureReason, rawResponsePreview, azureFinishReason
            ]
        );
    }

    // Analyze a single domain batch with JSON error handling and repair
    async function analyzeDomainBatch({ companyId, snapshot, run, domain, packageResult, batchEvidence, batchNumber, totalBatches, historicalContext, recordsRemaining = null, semanticGrouping = null, evidenceStartIndex = 0 }) {
        const batchPackage = buildDomainBatchPackage(packageResult.package, batchEvidence, batchNumber, totalBatches, semanticGrouping, evidenceStartIndex);
        let usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, requestBytes: estimateDomainRequestBytes(domain, batchPackage), responseBytes: 0, retries: 0 };
        
        try {
            // First attempt: get JSON response from Azure
            const response = await azureOpenAI.createJsonCompletion({
                messages: domainMessages(domain, batchPackage),
                temperature: 0.15,
                maxTokens: settings.maxDomainOutputTokens,
                maxRetriesOverride: settings.maxRetries,
                retryDelaysMsOverride: ENTERPRISE_RATE_LIMIT_RETRY_DELAYS_MS,
                retryMaxMsOverride: ENTERPRISE_RATE_LIMIT_RETRY_MAX_MS,
                connectionRetryDelaysMsOverride: ENTERPRISE_CONNECTION_RETRY_DELAYS_MS,
                timeoutMs: settings.requestTimeoutMs,
                allowInvalidJsonResponse: true
            });
            
            usage = responseUsage(response);
            const rawResponsePreview = safeResponsePreview(response.data);
            
            const finishReason = responseFinishReason(response);
            let analysis = null;
            let jsonRepaired = false;
            let jsonRepairMethod = null;
            if (typeof response.data === 'string') {
                const jsonResult = parseJsonWithDiagnostics(response.data);
                if (!jsonResult.success) {
                    const localRepair = repairTruncatedJson(response.data);
                    logger.warn(`[StackCTRL Enterprise] Batch ${batchNumber} JSON parsing failed, attempting one Azure repair. Error: ${jsonResult.error}`);
                    let repairResponse = null;
                    try {
                        repairResponse = await azureOpenAI.createJsonCompletion({
                            messages: [
                                { role: 'system', content: 'Return valid JSON only. Preserve readable evidence names and their matching IDs; discard only incomplete trailing prose.' },
                                { role: 'user', content: createJsonRepairPrompt(response.data) }
                            ],
                            temperature: 0,
                            maxTokens: Math.min(settings.maxDomainOutputTokens, 2000),
                            maxRetriesOverride: 1,
                            retryDelaysMsOverride: ENTERPRISE_RATE_LIMIT_RETRY_DELAYS_MS,
                retryMaxMsOverride: ENTERPRISE_RATE_LIMIT_RETRY_MAX_MS,
                connectionRetryDelaysMsOverride: ENTERPRISE_CONNECTION_RETRY_DELAYS_MS,
                timeoutMs: settings.requestTimeoutMs,
                            allowInvalidJsonResponse: true
                        });
                    } catch (repairError) {
                        if (!localRepair.success) {
                            const errorMessage = `JSON parse failed: ${jsonResult.error}. Repair attempt failed: ${repairError.message}`;
                            const fallbackAnalysis = buildInvalidJsonFallbackAnalysis({
                                domain, snapshot, packageResult, batchEvidence, errorMessage,
                                rawResponseStored: rawResponsePreview != null
                            });
                            await storeBatch({
                                companyId, snapshotId: snapshot.ID, runId: run.id, domain,
                                batchNumber, totalBatches, batchEvidence, analysis: fallbackAnalysis, usage,
                                stackCTRLDataCount: packageResult.audit.stackCTRLDataCount,
                                status: 'completed_with_warnings', errorMessage,
                                failureReason: 'invalid_json_local_fallback', rawResponsePreview,
                                azureFinishReason: finishReason, jsonRepaired: true,
                                jsonRepairMethod: 'local_fallback_after_repair_error', recordsRemaining, semanticGrouping
                            });
                            return {
                                status: 'completed_with_warnings', batchNumber, batchItemCount: batchEvidence.length,
                                domain, analysis: fallbackAnalysis, usage, errorMessage,
                                failureReason: 'invalid_json_local_fallback', jsonRepaired: true,
                                jsonRepairMethod: 'local_fallback_after_repair_error'
                            };
                        }
                        logger.warn?.(`[StackCTRL Enterprise] Azure repair failed for batch ${batchNumber}; using locally recovered JSON with warnings.`);
                        jsonRepaired = true;
                        jsonRepairMethod = 'local_closure_after_azure_repair_error';
                        analysis = normalizedDomainResult(localRepair.value, domain, packageResult.current, snapshot.ID, batchEvidence);
                    }
                    if (repairResponse) {
                    const repairUsage = responseUsage(repairResponse);
                    usage.inputTokens += repairUsage.inputTokens;
                    usage.outputTokens += repairUsage.outputTokens;
                    usage.totalTokens += repairUsage.totalTokens;
                    usage.requestBytes += repairUsage.requestBytes;
                    usage.responseBytes += repairUsage.responseBytes;
                    usage.retries += repairUsage.retries;
                    const repairResult = parseJsonWithDiagnostics(repairResponse.data);
                    const repairedRepairResponse = repairResult.success ? null : repairTruncatedJson(repairResponse.data);
                    const recoveredValue = repairResult.success
                        ? repairResult.value
                        : repairedRepairResponse?.success ? repairedRepairResponse.value
                            : localRepair.success ? localRepair.value : null;
                    if (!recoveredValue) {
                        const failureReason = finishReason === 'length' ? 'output_truncated_unrepairable' : 'invalid_json_unrepairable';
                        const errorMessage = `JSON parse failed: ${jsonResult.error}. Repair attempt also failed: ${repairResult.error}`;
                        const fallbackAnalysis = buildInvalidJsonFallbackAnalysis({
                            domain, snapshot, packageResult, batchEvidence, errorMessage,
                            rawResponseStored: rawResponsePreview != null
                        });
                        await storeBatch({
                            companyId, snapshotId: snapshot.ID, runId: run.id, domain,
                            batchNumber, totalBatches, batchEvidence, analysis: fallbackAnalysis, usage,
                            stackCTRLDataCount: packageResult.audit.stackCTRLDataCount,
                            status: 'completed_with_warnings', errorMessage,
                            failureReason: 'invalid_json_local_fallback', rawResponsePreview,
                            azureFinishReason: finishReason, jsonRepaired: true,
                            jsonRepairMethod: 'local_fallback_after_invalid_json', recordsRemaining, semanticGrouping
                        });
                        return {
                            status: 'completed_with_warnings', batchNumber, batchItemCount: batchEvidence.length,
                            domain, analysis: fallbackAnalysis, usage, errorMessage,
                            failureReason: 'invalid_json_local_fallback', jsonRepaired: true,
                            jsonRepairMethod: 'local_fallback_after_invalid_json', originalFailureReason: failureReason
                        };
                    }
                    jsonRepaired = true;
                    jsonRepairMethod = repairResult.success
                        ? 'azure_repair'
                        : repairedRepairResponse?.success ? 'azure_repair_then_local_closure' : 'local_closure_after_azure_repair_failure';
                    analysis = normalizedDomainResult(recoveredValue, domain, packageResult.current, snapshot.ID, batchEvidence);
                    }
                } else {
                    analysis = normalizedDomainResult(jsonResult.value, domain, packageResult.current, snapshot.ID, batchEvidence);
                }
            } else {
                analysis = normalizedDomainResult(response.data, domain, packageResult.current, snapshot.ID, batchEvidence);
            }

            if (jsonRepaired || finishReason === 'length') {
                analysis.missingDataWarnings = [
                    ...array(analysis.missingDataWarnings),
                    'Azure output ended before all closing JSON delimiters were returned. StackCTRL safely recovered the structured response; trailing narrative fields may be incomplete.'
                ];
            }
            
            const batchStatus = jsonRepaired || finishReason === 'length' ? 'completed_with_warnings' : 'completed';
            // Store successful batch. Recovered or length-limited JSON remains explicitly warning-bearing.
            await storeBatch({
                companyId, snapshotId: snapshot.ID, runId: run.id, domain,
                batchNumber, totalBatches, batchEvidence, analysis, usage, status: batchStatus,
                stackCTRLDataCount: packageResult.audit.stackCTRLDataCount,
                rawResponsePreview, azureFinishReason: finishReason, jsonRepaired, jsonRepairMethod, recordsRemaining, semanticGrouping
            });
            
            return { status: batchStatus, batchNumber, batchItemCount: batchEvidence.length, domain, analysis, usage, jsonRepaired, jsonRepairMethod };
        } catch (error) {
            const metadata = error.azureMetadata || {};
            const alreadyStored = /finish_reason: length/.test(error.message);
            usage = {
                inputTokens: Number(metadata.inputTokens || 0), outputTokens: Number(metadata.outputTokens || 0), totalTokens: Number(metadata.totalTokens || 0),
                requestBytes: Number(metadata.requestSizeBytes || estimateDomainRequestBytes(domain, batchPackage)), responseBytes: Number(metadata.responseSizeBytes || 0),
                retries: Number(metadata.retryCount || 0)
            };
            
            let failureReason = 'unknown_error';
            if (error.message.includes('finish_reason: length')) failureReason = 'output_truncated';
            else if (error.message.includes('JSON')) failureReason = 'invalid_json';
            else if (metadata.connectionReset || String(error.message).toLowerCase().includes('econnreset')) failureReason = 'connection_reset';
            else if (metadata.connectionError) failureReason = 'connection_reset';
            else if (metadata.rateLimited || metadata.statusCode === 429 || error.message.includes('429') || error.message.includes('throttl')) failureReason = 'rate_limited';
            const status = failureReason === 'output_truncated' || failureReason === 'invalid_json'
                ? 'failed_invalid_json'
                : failureReason === 'rate_limited' ? 'failed_rate_limited'
                    : failureReason === 'connection_reset' ? 'failed_connection'
                        : classifyFailureStatus(error);
            const recommendedRetryAfterMs = metadata.retryAfterMs ?? metadata.lastRetryDelayMs ?? null;
            if (failureReason === 'rate_limited') captureRateLimit(error);

            if (status === 'failed_invalid_json') {
                const rawResponsePreview = safeResponsePreview(metadata.rawResponse || metadata.responseText || '');
                const errorMessage = `Azure JSON response could not be parsed: ${error.message}`;
                const fallbackAnalysis = buildInvalidJsonFallbackAnalysis({
                    domain, snapshot, packageResult, batchEvidence, errorMessage,
                    rawResponseStored: rawResponsePreview != null
                });
                await storeBatch({
                    companyId, snapshotId: snapshot.ID, runId: run.id, domain,
                    batchNumber, totalBatches, batchEvidence, analysis: fallbackAnalysis, usage,
                    stackCTRLDataCount: packageResult.audit.stackCTRLDataCount,
                    status: 'completed_with_warnings', errorMessage,
                    failureReason: 'invalid_json_local_fallback', rawResponsePreview,
                    azureFinishReason: metadata.finishReason || null,
                    jsonRepaired: true, jsonRepairMethod: 'local_fallback_after_json_exception',
                    recordsRemaining, semanticGrouping
                });
                logger.warn?.(`[StackCTRL Enterprise] ${domain.name} batch ${batchNumber} used a local invalid-JSON fallback and the pipeline will continue.`);
                return {
                    status: 'completed_with_warnings', batchNumber, batchItemCount: batchEvidence.length,
                    domain, analysis: fallbackAnalysis, usage, errorMessage,
                    failureReason: 'invalid_json_local_fallback', jsonRepaired: true,
                    jsonRepairMethod: 'local_fallback_after_json_exception'
                };
            }
            
            if (!alreadyStored) {
                await storeBatch({
                    companyId, snapshotId: snapshot.ID, runId: run.id, domain,
                    batchNumber, totalBatches, batchEvidence, analysis: null, usage,
                    stackCTRLDataCount: packageResult.audit.stackCTRLDataCount,
                    status, errorMessage: error.message, failureReason,
                    rawResponsePreview: safeResponsePreview(metadata.rawResponse || metadata.responseText || ''),
                    azureFinishReason: metadata.finishReason || null,
                    recommendedRetryAfterMs,
                    attemptDiagnostics: metadata.attemptDiagnostics || [],
                    recordsRemaining,
                    semanticGrouping
                });
            }
            
            logger.error(`[StackCTRL Enterprise] ${domain.name} batch ${batchNumber} failed:`, error.message);
            return {
                status, batchNumber, batchItemCount: batchEvidence.length, domain, usage, failureReason,
                errorMessage: error.message, recommendedRetryAfterMs,
                attemptDiagnostics: metadata.attemptDiagnostics || [],
                connectionReset: Boolean(metadata.connectionReset || failureReason === 'connection_reset')
            };
        }
    }

    function mergeCompletedBatchAnalyses({ results, domain, packageResult, snapshotId, totalBatches }) {
        const completed = results.filter(result => isSuccessfulDomainStatus(result.status) && result.analysis);
        const flatten = field => completed.flatMap(result => array(result.analysis?.[field]));
        const controlAssessment = completed.flatMap(result => {
            const value = result.analysis?.controlAssessment;
            return Array.isArray(value) ? value : value && typeof value === 'object' ? [value] : [];
        });
        const processedItems = completed.reduce((total, result) => total + Number(result.batchItemCount || 0), 0);
        return normalizedDomainResult({
            status: 'running',
            domainExecutiveSummary: completed.map(result => result.analysis.domainExecutiveSummary).filter(Boolean).join(' '),
            technicalSummary: completed.map(result => result.analysis.technicalSummary).filter(Boolean).join(' '),
            businessImpact: completed.map(result => result.analysis.businessImpact).filter(Boolean).join(' '),
            currentPosture: completed.map(result => result.analysis.currentPosture).filter(Boolean).join(' '),
            scoreJustification: completed.map(result => result.analysis.scoreJustification).filter(Boolean).join(' '),
            evidenceUsed: flatten('evidenceUsed'),
            evidenceGaps: flatten('evidenceGaps'),
            controlAssessment,
            keyFindings: flatten('keyFindings'),
            risks: flatten('risks'),
            recommendations: flatten('recommendations'),
            trendAnalysis: flatten('trendAnalysis'),
            whatImproved: flatten('whatImproved'),
            whatDeteriorated: flatten('whatDeteriorated'),
            whatStayedTheSame: flatten('whatStayedTheSame'),
            missingDataWarnings: [
                ...array(packageResult.package.limitations?.missingDataWarnings),
                ...flatten('missingDataWarnings')
            ],
            assumptions: flatten('assumptions'),
            managementActions: flatten('managementActions'),
            confidenceScore: completed.length
                ? completed.reduce((total, result) => total + Number(result.analysis.confidenceScore || 0), 0) / completed.length
                : null,
            powerBiSummary: completed.reduce((merged, result) => ({ ...merged, ...(result.analysis.powerBiSummary || {}) }), {}),
            evidenceLimitations: {
                recordsPrepared: packageResult.allEvidence.length,
                recordsSent: processedItems,
                recordsOmitted: 0,
                complete: completed.length === totalBatches,
                omittedReasons: array(packageResult.package.limitations?.missingDataWarnings)
            },
            batchInfo: {
                completedBatches: completed.length,
                totalBatches,
                processedItems,
                remainingItems: Math.max(0, packageResult.allEvidence.length - processedItems),
                complete: completed.length === totalBatches
            }
        }, domain, packageResult.current, snapshotId, packageResult.allEvidence);
    }

    // Process all batches for a domain and aggregate results
    async function processBatchEvidenceWithRecovery({
        companyId, snapshot, run, domain, packageResult, batchEvidence, batchNumber, totalBatches,
        historicalContext, recordsRemaining, semanticGrouping, evidenceStartIndex = 0
    }) {
        const result = await analyzeDomainBatch({
            companyId, snapshot, run, domain, packageResult,
            batchEvidence, batchNumber, totalBatches, historicalContext,
            recordsRemaining, semanticGrouping, evidenceStartIndex
        });
        if (isSuccessfulDomainStatus(result.status)) return [result];
        if (isConnectionFailureResult(result) && batchEvidence.length > 1) {
            const splitAt = Math.max(1, Math.floor(batchEvidence.length / 2));
            logger.warn?.(`[StackCTRL Enterprise] Reducing ${domain.name} batch ${batchNumber} from ${batchEvidence.length} to ${splitAt}+${batchEvidence.length - splitAt} record(s) after connection reset.`);
            const firstHalf = batchEvidence.slice(0, splitAt);
            const secondHalf = batchEvidence.slice(splitAt);
            const firstResults = await processBatchEvidenceWithRecovery({
                companyId, snapshot, run, domain, packageResult,
                batchEvidence: firstHalf, batchNumber, totalBatches, historicalContext,
                recordsRemaining, semanticGrouping, evidenceStartIndex
            });
            const secondResults = await processBatchEvidenceWithRecovery({
                companyId, snapshot, run, domain, packageResult,
                batchEvidence: secondHalf, batchNumber, totalBatches, historicalContext,
                recordsRemaining: Math.max(0, Number(recordsRemaining || 0) - firstHalf.length),
                semanticGrouping, evidenceStartIndex: evidenceStartIndex + firstHalf.length
            });
            return [...firstResults, ...secondResults];
        }
        if (isConnectionFailureResult(result) && batchEvidence.length === 1) {
            const errorMessage = result.errorMessage || 'Azure connection reset after retries.';
            const fallbackAnalysis = buildInvalidJsonFallbackAnalysis({
                domain, snapshot, packageResult, batchEvidence: batchEvidence, errorMessage,
                rawResponseStored: false
            });
            fallbackAnalysis.missingDataWarnings = [
                ...array(fallbackAnalysis.missingDataWarnings),
                `Azure connection reset while analysing 1 evidence row: ${errorMessage}`
            ];
            await storeBatch({
                companyId, snapshotId: snapshot.ID, runId: run.id, domain,
                batchNumber, totalBatches, batchEvidence, analysis: fallbackAnalysis, usage: result.usage || {},
                stackCTRLDataCount: packageResult.audit.stackCTRLDataCount,
                status: 'completed_with_warnings', errorMessage,
                failureReason: 'connection_reset_local_fallback',
                attemptDiagnostics: result.attemptDiagnostics || [],
                recordsRemaining, semanticGrouping
            });
            return [{
                status: 'completed_with_warnings',
                batchNumber,
                batchItemCount: batchEvidence.length,
                domain,
                analysis: fallbackAnalysis,
                usage: result.usage || {},
                failureReason: 'connection_reset_local_fallback',
                errorMessage,
                attemptDiagnostics: result.attemptDiagnostics || []
            }];
        }
        return [result];
    }

    async function processDomainBatches({ companyId, snapshot, run, domain, packageResult, allEvidence, historicalContext, thresholdReached = false }) {
        if (domain.key === 'security_alerts') {
            logger.info?.('[security_alerts:azure_batch_plan:start] Building semantic Azure batch plan');
            await updateRunStageProgress(run.id, { stage: 'azure_batch_plan:start', lastSuccessfulStage: 'evidence_prepare:complete' });
        }
        const maxItems = thresholdReached
            ? Math.min(settings.maxItemsPerBatch, settings.thresholdBatchMaxItems)
            : HEAVY_DOMAINS.has(domain.key)
                ? Math.min(settings.maxItemsPerBatch, settings.heavyDomainMaxItemsPerBatch)
                : settings.maxItemsPerBatch;
        const batchOptions = {
            maxItems,
            maxBytes: settings.maxInputBytes,
            estimateBytes: items => estimateDomainRequestBytes(
                domain,
                buildDomainBatchPackage(packageResult.package, items, 1, Math.max(1, Math.ceil(allEvidence.length / maxItems)))
            )
        };
        
        let batches;
        if (domain.key === 'security_alerts') {
            const singleBatchEstimate = estimateDomainRequestBytes(
                domain,
                buildDomainBatchPackage(packageResult.package, allEvidence, 1, 1)
            );
            const singleBatchTokens = Math.ceil(singleBatchEstimate / 4);
            batches = splitSecurityAlertsIntoBatches(allEvidence, batchOptions);
            logger.info?.(`[StackCTRL Enterprise] Security Alerts evidence (${allEvidence.length} items, ~${singleBatchTokens} tokens) planned as ${batches.length} safe batch(es) with at most ${maxItems} records each.`);
        } else {
            batches = splitIntoBatches(allEvidence, batchOptions);
        }
        
        packageResult.audit.batchPlan = buildEvidenceBatchPlan(allEvidence, batches);
        if (domain.key === 'security_alerts') {
            logger.info?.(`[security_alerts:azure_batch_plan:complete] ${batches.length} batch(es) planned for ${allEvidence.length} evidence record(s)`);
            await updateRunStageProgress(run.id, { stage: 'azure_analysis:start', lastSuccessfulStage: 'azure_batch_plan:complete' });
        }
        if (domain.key === 'security_alerts' && batches.length > 10 && allEvidence.length < 1000) {
            logger.warn?.(`[StackCTRL Enterprise] Security Alerts required ${batches.length} safe batches because the complete evidence payload exceeded the configured byte budget.`);
        }
        const results = [];
        const totals = { inputTokens: 0, outputTokens: 0, totalTokens: 0, requestBytes: 0, responseBytes: 0, retries: 0 };
        
        logger.info(`[StackCTRL Enterprise] Processing ${domain.name} in ${batches.length} batch(es)`);
        
        for (const batch of batches) {
            const evidenceStartIndex = batches
                .slice(0, batch.number - 1)
                .reduce((count, plannedBatch) => count + plannedBatch.items.length, 0);
            const recordsRemaining = Math.max(0, allEvidence.length - (evidenceStartIndex + batch.items.length));
            await updateRunBatchProgress(run.id, {
                domainKey: domain.key,
                batchNumber: batch.number,
                batchCount: batches.length,
                recordsPrepared: allEvidence.length,
                recordsRemaining: recordsRemaining + batch.items.length
            });
            if (domain.key === 'security_alerts') logger.info?.(`[security_alerts:azure_analysis:start] Batch ${batch.number}/${batches.length}`);
            const batchResults = await processBatchEvidenceWithRecovery({
                companyId, snapshot, run, domain, packageResult,
                batchEvidence: batch.items, batchNumber: batch.number, totalBatches: batches.length,
                historicalContext,
                recordsRemaining,
                evidenceStartIndex,
                semanticGrouping: batch.semanticGrouping || null
            });
            let stopDomainBatches = false;
            for (const result of batchResults) {
                results.push(result);
                if (domain.key === 'security_alerts') {
                    const warning = result.status === 'completed_with_warnings'
                        ? (result.jsonRepairMethod || result.failureReason || 'azure_analysis_warning')
                        : null;
                    logger.info?.(`[security_alerts:azure_analysis:complete] Batch ${batch.number}/${batches.length} ${result.status}`);
                    await updateRunStageProgress(run.id, {
                        stage: result.status,
                        lastSuccessfulStage: isSuccessfulDomainStatus(result.status)
                            ? `azure_analysis:complete:batch_${batch.number}`
                            : `azure_analysis:batch_${batch.number - 1}`,
                        warning,
                        failureReason: isSuccessfulDomainStatus(result.status)
                            ? null
                            : (result.failureReason || result.errorMessage || result.status)
                    });
                }
                for (const key of Object.keys(totals)) {
                    totals[key] += result.usage?.[key] || 0;
                }

                if (isSuccessfulDomainStatus(result.status)) {
                    const progressiveAnalysis = mergeCompletedBatchAnalyses({
                        results,
                        domain,
                        packageResult,
                        snapshotId: snapshot.ID,
                        totalBatches: batches.length
                    });
                    packageResult.audit.sentToAzureCount = progressiveAnalysis.evidenceLimitations.recordsSent;
                    await storeDomain({
                        run,
                        companyId,
                        snapshot,
                        domain,
                        packageResult,
                        analysis: progressiveAnalysis,
                        usage: totals,
                        status: 'running',
                        persistItems: false
                    });
                }

                if (result.status === 'failed_rate_limited') {
                    logger.warn?.(`[StackCTRL Enterprise] Stopping ${domain.name} after an exhausted Azure 429 retry budget.`);
                    stopDomainBatches = true;
                    break;
                }
                if (!isSuccessfulDomainStatus(result.status) && !isConnectionFailureResult(result)) {
                    logger.error?.(`[StackCTRL Enterprise] Stopping ${domain.name} after batch ${batch.number} failed with ${result.status}; remaining evidence is retained and recorded as omitted for this attempt.`);
                    stopDomainBatches = true;
                    break;
                }
            }
            if (stopDomainBatches) break;

            const lastBatchResult = batchResults.at(-1);
            if (batch.number < batches.length) {
                const delayMs = computeInterBatchDelayMs(lastBatchResult?.usage?.inputTokens || 0, settings, domain.key);
                if (delayMs > 0) await wait(delayMs);
            }
        }
        
        const completedCount = results.filter(result => isSuccessfulDomainStatus(result.status)).length;
        const processedItems = results.filter(result => isSuccessfulDomainStatus(result.status))
            .reduce((total, result) => total + Number(result.batchItemCount || 0), 0);
        const omittedItems = Math.max(0, allEvidence.length - processedItems);
        const rateLimitedBatch = results.find(result => result.status === 'failed_rate_limited');
        return {
            results,
            batchCount: batches.length,
            totals,
            processedItems,
            omittedItems,
            complete: completedCount === batches.length && omittedItems === 0,
            rateLimited: Boolean(rateLimitedBatch),
            recommendedRetryAfterMs: rateLimitedBatch?.recommendedRetryAfterMs || null
        };
    }

    async function createRun({ companyId, snapshotId, periodType, referenceDate, mode, deduplicationKey = null }) {
        const window = periodWindow(periodType, referenceDate);
        let result;
        try {
            [result] = await pool.query(
                `INSERT INTO StackCTRLEnterpriseReportRuns
                 (CompanyID, SnapshotID, PeriodType, PeriodStart, PeriodEnd, Status, Mode, DeduplicationKey, StartedAt)
                 VALUES (?, ?, ?, ?, ?, 'queued', ?, ?, NOW())`,
                [companyId, snapshotId || null, window.periodType, window.periodStart, window.periodEnd, mode, deduplicationKey]
            );
        } catch (error) {
            if (error?.code !== 'ER_DUP_ENTRY' || !deduplicationKey) throw error;
            const [rows] = await pool.query(`SELECT ID, Status FROM StackCTRLEnterpriseReportRuns WHERE DeduplicationKey = ? LIMIT 1`, [deduplicationKey]);
            return { id: Number(rows[0]?.ID), ...window, mode, duplicate: true, status: rows[0]?.Status || 'duplicate' };
        }
        await pool.query(`UPDATE StackCTRLEnterpriseReportRuns SET Status = 'running' WHERE ID = ?`, [result.insertId]);
        return { id: Number(result.insertId), ...window, mode };
    }

    function buildRunProgress({
        run,
        domainKeys = [],
        results = [],
        currentDomainKey = null,
        phase = 'domains',
        synthesisStatus = null,
        rateLimit = null,
        snapshot = null
    } = {}) {
        const completed = results.filter(result => result.status === 'completed').length;
        const partial = results.filter(result => result.status === 'partial').length;
        const failed = results.filter(result => String(result.status || '').startsWith('failed')).length;
        const blocked = results.filter(result => String(result.status || '').startsWith('blocked')).length;
        const skipped = results.filter(result => SKIPPED_DOMAIN_STATUSES.has(String(result.status || ''))).length;
        const successful = results.filter(result => isSuccessfulDomainStatus(result.status)).length;
        const queue = domainKeys.map(key => ({
            domainKey: key,
            domainName: DOMAIN_BY_KEY[key]?.name || key,
            status: results.find(result => result.domain?.key === key)?.status || (currentDomainKey === key ? 'running' : 'queued'),
            errorMessage: results.find(result => result.domain?.key === key)?.errorMessage || null
        }));
        return {
            phase,
            runId: run?.id || null,
            mode: run?.mode || null,
            snapshotId: snapshot?.ID || null,
            snapshotCreatedAt: snapshot?.CreatedAt || null,
            currentDomainKey,
            currentDomainName: currentDomainKey ? (DOMAIN_BY_KEY[currentDomainKey]?.name || currentDomainKey) : null,
            domainQueue: queue,
            counts: {
                total: domainKeys.length,
                completed,
                partial,
                successful,
                failed,
                blocked,
                skipped,
                processed: results.length
            },
            synthesisStatus,
            rateLimit: rateLimit ? {
                domainKey: rateLimit.domainKey || null,
                retryAfterMs: rateLimit.retryAfterMs || null,
                active: true
            } : null,
            updatedAt: new Date().toISOString()
        };
    }

    async function updateRunProgress(runId, progress, totals = null) {
        const params = [JSON.stringify(progress || {}), Number(runId)];
        let sql = `UPDATE StackCTRLEnterpriseReportRuns SET ProgressJson = ? WHERE ID = ?`;
        if (totals) {
            sql = `UPDATE StackCTRLEnterpriseReportRuns
                   SET ProgressJson = ?, TotalInputTokens = ?, TotalOutputTokens = ?, TotalTokens = ?,
                       TotalRequestBytes = ?, TotalResponseBytes = ?, RetryCount = ?
                   WHERE ID = ?`;
            params.splice(1, 0, totals.inputTokens, totals.outputTokens, totals.totalTokens, totals.requestBytes, totals.responseBytes, totals.retries);
        }
        try {
            await pool.query(sql, params);
        } catch (error) {
            if (error?.code !== 'ER_BAD_FIELD_ERROR') throw error;
            if (!totals) return;
            await pool.query(
                `UPDATE StackCTRLEnterpriseReportRuns
                 SET TotalInputTokens = ?, TotalOutputTokens = ?, TotalTokens = ?,
                     TotalRequestBytes = ?, TotalResponseBytes = ?, RetryCount = ?
                 WHERE ID = ?`,
                [totals.inputTokens, totals.outputTokens, totals.totalTokens, totals.requestBytes, totals.responseBytes, totals.retries, Number(runId)]
            );
        }
    }

    async function updateRunBatchProgress(runId, { domainKey, batchNumber, batchCount, recordsPrepared, recordsRemaining }) {
        await pool.query(
            `UPDATE StackCTRLEnterpriseReportRuns
             SET ProgressJson = JSON_SET(
                 COALESCE(ProgressJson, JSON_OBJECT()),
                 '$.currentDomainKey', ?, '$.currentBatch', ?, '$.batchCount', ?,
                 '$.recordsPrepared', ?, '$.recordsRemaining', ?, '$.updatedAt', ?
             ) WHERE ID = ?`,
            [domainKey, Number(batchNumber), Number(batchCount), Number(recordsPrepared), Number(recordsRemaining), new Date().toISOString(), Number(runId)]
        );
    }

    async function updateRunStageProgress(runId, { stage, lastSuccessfulStage = null, warning = null, failureReason = null }) {
        await pool.query(
            `UPDATE StackCTRLEnterpriseReportRuns
             SET ProgressJson = JSON_SET(
                 COALESCE(ProgressJson, JSON_OBJECT()),
                 '$.currentStage', ?, '$.lastSuccessfulStage', ?, '$.stageWarning', ?,
                 '$.stageFailureReason', ?, '$.updatedAt', ?
             ) WHERE ID = ?`,
            [stage, lastSuccessfulStage, warning, failureReason, new Date().toISOString(), Number(runId)]
        );
    }

    async function storeSkippedDomain({ run, companyId, snapshot, domain, status, errorMessage }) {
        const usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, requestBytes: 0, responseBytes: 0, retries: 0 };
        const packageResult = await buildDomainPackage({ companyId, snapshot, runId: run.id, domain, historicalContext: { comparisons: {} } });
        packageResult.audit.sentToAzureCount = 0;
        await storeDomain({
            run, companyId, snapshot, domain, packageResult, analysis: null, usage,
            status, errorMessage
        });
        await storeAudit({
            run, companyId, snapshot, domain, packageResult, analysis: null, usage,
            status
        });
        return {
            status,
            domain,
            usage,
            audit: packageResult.audit,
            errorMessage
        };
    }

    function buildLimitedDataAnalysis({ domain, packageResult, reason }) {
        const warning = reason || `${domain.name} source data is limited or unavailable. Enterprise Deep Reporting continued with warning-only evidence.`;
        const warnings = [...new Set([
            ...array(packageResult.package.limitations?.missingDataWarnings),
            warning
        ].filter(Boolean))];
        return {
            domainExecutiveSummary: `${domain.name} could not be fully analysed because StackCTRL has limited source evidence for this snapshot.`,
            technicalSummary: 'No entity-level evidence was available for Azure analysis in this domain package.',
            businessImpact: 'This domain should be treated as unverified until the source connector produces a complete evidence snapshot.',
            currentPosture: 'limited evidence',
            evidenceUsed: [],
            evidenceGaps: [warning],
            scoreJustification: 'Authoritative StackCTRL scores were retained where available; no replacement score was calculated from missing evidence.',
            controlAssessment: [],
            keyFindings: [],
            risks: [{
                title: `${domain.name} evidence gap`,
                severity: 'medium',
                status: 'open',
                sourceDomain: domain.key,
                sourceMetric: 'sourceHealth',
                evidenceSummary: warning,
                businessImpact: 'Management reporting may understate this domain until evidence collection is restored.',
                recommendation: 'Refresh the source connector and rerun Enterprise Deep Reporting.'
            }],
            recommendations: [{
                title: `Refresh ${domain.name} evidence`,
                priority: 'medium',
                sourceDomain: domain.key,
                sourceMetric: 'sourceHealth',
                detail: 'Restore source collection, confirm a complete saved evidence snapshot, and rerun the enterprise report.',
                recommendedAction: 'Restore source collection, confirm a complete saved evidence snapshot, and rerun the enterprise report.'
            }],
            trendAnalysis: [],
            yesterdayVsToday: {},
            whatImproved: [],
            whatDeteriorated: [],
            whatStayedTheSame: [],
            missingDataWarnings: warnings,
            assumptions: ['No control gap was inferred beyond the missing source evidence.'],
            confidenceScore: 0,
            managementActions: [{
                title: `Confirm ${domain.name} data collection`,
                priority: 'medium',
                sourceDomain: domain.key,
                sourceMetric: 'sourceHealth',
                detail: 'Check connector credentials, permissions, and latest evidence snapshot status.'
            }],
            powerBiSummary: { status: 'limited_data', warning },
            evidenceCatalog: packageResult.evidenceCatalog,
            evidenceLimitations: {
                recordsPrepared: 0,
                recordsSent: 0,
                recordsOmitted: Number(packageResult.audit.evidenceOmittedCount || 0),
                totalEntityRows: Number(packageResult.audit.stackCTRLDataCount || 0),
                catalogEntityCount: Number(packageResult.audit.catalogEntityCount || 0),
                catalogCategoryCount: Number(packageResult.audit.catalogCategoryCount || 0),
                completedBatches: 0,
                totalBatches: 0,
                accountingComplete: true,
                complete: false,
                omittedReasons: warnings
            },
            authoritativeScores: {
                healthScore: packageResult.current.healthScore,
                riskScore: packageResult.current.riskScore,
                riskLevel: packageResult.current.riskLevel
            },
            domain: { key: domain.key, name: domain.name }
        };
    }

    function buildInvalidJsonFallbackAnalysis({ domain, snapshot, packageResult, batchEvidence, errorMessage, rawResponseStored }) {
        const recordsPrepared = array(batchEvidence).length;
        const omittedReasons = [...new Set([
            ...array(packageResult.package.limitations?.missingDataWarnings),
            errorMessage
        ].filter(Boolean))];
        const evidenceAvailable = recordsPrepared > 0;
        return normalizedDomainResult({
            domainKey: domain.key,
            status: 'completed_with_warnings',
            warningType: 'azure_invalid_json',
            snapshotId: snapshot.ID,
            recordsPrepared,
            recordsSent: recordsPrepared,
            recordsOmitted: 0,
            omittedReasons,
            evidenceAvailable,
            message: errorMessage,
            rawAzureResponseStored: Boolean(rawResponseStored),
            domainExecutiveSummary: `${domain.name} evidence was sent to Azure, but the returned JSON was invalid. StackCTRL preserved the raw response and continued the pipeline.`,
            technicalSummary: 'Azure returned malformed structured output after one compact repair attempt. A deterministic local warning object replaced that batch output.',
            businessImpact: 'Domain conclusions are unavailable from this batch, but complete StackCTRL raw evidence remains available to Power BI and later domains continue processing.',
            currentPosture: 'analysis completed with Azure JSON warning',
            evidenceUsed: [],
            evidenceGaps: [{ gap: 'Azure structured analysis unavailable', reason: errorMessage, omittedCount: 0, sourceMetric: 'azure_response' }],
            scoreJustification: 'Authoritative StackCTRL scores were retained; no Azure-derived score was accepted from malformed JSON.',
            controlAssessment: [],
            keyFindings: [],
            risks: [],
            recommendations: [],
            trendAnalysis: [],
            yesterdayVsToday: {},
            whatImproved: [],
            whatDeteriorated: [],
            whatStayedTheSame: [],
            missingDataWarnings: omittedReasons,
            assumptions: ['No malformed Azure content was promoted into domain findings, risks, or recommendations.'],
            confidenceScore: 0,
            managementActions: [],
            powerBiSummary: {
                domainKey: domain.key,
                status: 'completed_with_warnings',
                warningType: 'azure_invalid_json',
                snapshotId: snapshot.ID,
                recordsPrepared,
                recordsSent: recordsPrepared,
                recordsOmitted: 0,
                omittedReasons,
                evidenceAvailable,
                message: errorMessage,
                rawAzureResponseStored: Boolean(rawResponseStored)
            },
            evidenceLimitations: {
                recordsPrepared,
                recordsSent: recordsPrepared,
                recordsOmitted: 0,
                complete: false,
                accountingComplete: true,
                omittedReasons
            }
        }, domain, packageResult.current, snapshot.ID, batchEvidence);
    }

    async function refreshEnterpriseSnapshot(companyId, user = {}) {
        if (!intelligenceService?.createSnapshot) return null;
        return intelligenceService.createSnapshot({
            companyId: Number(companyId),
            options: { snapshotType: 'enterprise_pipeline', refresh: true },
            user
        });
    }

    function normalizedDomainResult(data, domain, current, snapshotId = null, availableEvidence = []) {
        const value = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
        const resolvedSnapshotId = snapshotId ?? current?.snapshotId ?? null;
        const normalizeItems = items => array(items)
            .map(item => ensureItemEvidence(item, domain, resolvedSnapshotId, availableEvidence));
        return {
            ...value,
            domainKey: value.domainKey || domain.key,
            status: textOrNull(value.status, 80),
            warningType: textOrNull(value.warningType, 120),
            snapshotId: numberOrNull(value.snapshotId ?? resolvedSnapshotId),
            recordsPrepared: numberOrNull(value.recordsPrepared),
            recordsSent: numberOrNull(value.recordsSent),
            recordsOmitted: numberOrNull(value.recordsOmitted),
            omittedReasons: array(value.omittedReasons).map(reason => textOrNull(reason, 1200)).filter(Boolean),
            evidenceAvailable: value.evidenceAvailable == null ? null : Boolean(value.evidenceAvailable),
            message: textOrNull(value.message, 1200),
            rawAzureResponseStored: Boolean(value.rawAzureResponseStored),
            domainExecutiveSummary: textOrNull(value.domainExecutiveSummary, 4000),
            technicalSummary: textOrNull(value.technicalSummary, 4000),
            businessImpact: textOrNull(value.businessImpact, 4000),
            currentPosture: textOrNull(value.currentPosture, 4000),
            scoreJustification: textOrNull(value.scoreJustification, 4000),
            evidenceUsed: array(value.evidenceUsed),
            evidenceGaps: array(value.evidenceGaps),
            controlAssessment: normalizeControlAssessment(value.controlAssessment || {}, domain, resolvedSnapshotId, availableEvidence),
            keyFindings: normalizeItems(value.keyFindings),
            risks: normalizeItems(value.risks),
            recommendations: normalizeItems(value.recommendations),
            trendAnalysis: normalizeItems(value.trendAnalysis),
            yesterdayVsToday: value.yesterdayVsToday || {},
            whatImproved: array(value.whatImproved),
            whatDeteriorated: array(value.whatDeteriorated),
            whatStayedTheSame: array(value.whatStayedTheSame),
            missingDataWarnings: array(value.missingDataWarnings).map(warning => textOrNull(warning, 1200)).filter(Boolean),
            assumptions: array(value.assumptions).map(assumption => textOrNull(assumption, 1200)).filter(Boolean),
            confidenceScore: numberOrNull(value.confidenceScore),
            managementActions: normalizeItems(value.managementActions),
            powerBiSummary: value.powerBiSummary || {},
            evidenceLimitations: value.evidenceLimitations || {},
            evidenceCatalog: value.evidenceCatalog || null,
            batchInfo: value.batchInfo || null,
            authoritativeScores: { healthScore: current.healthScore, riskScore: current.riskScore, riskLevel: current.riskLevel },
            domain: { key: domain.key, name: domain.name }
        };
    }

    async function insertItem({ companyId, snapshotId, runId, domainKey, domainName, period, itemType, item, source }) {
        const title = item?.title || item?.metricName || item?.name || item?.action || `${domainName} ${itemType}`;
        const suggestedDueDate = normalizeMysqlDate(item?.suggestedDueDate || item?.dueDate || item?.targetDate || item?.actionDueDate || item?.reviewDate || item?.completionDate);
        const affectedEntities = array(item?.affectedEntities);
        const evidenceRows = array(item?.evidenceRows);
        const entityEvidence = affectedEntities.length ? affectedEntities : evidenceRows;
        const evidenceSummary = textOrNull(
            item?.evidenceSummary ||
            (entityEvidence.length ? `${entityEvidence.length} affected entity row(s) from ${item?.sourceMetric || item?.evidenceSource || domainKey}` : null),
            4000
        );
        await pool.query(
            `INSERT INTO StackCTRLEnterpriseIntelligenceItems
             (CompanyID, SnapshotID, RunID, DomainKey, DomainName, PeriodType, PeriodStart, PeriodEnd,
              ItemType, Title, Description, Severity, Priority, Status, Likelihood, Impact,
              BusinessImpact, EvidenceSummary, Recommendation, SuggestedOwner, SuggestedDueDate,
              Direction, CurrentValue, PreviousValue, ChangePercent, ComparisonPeriod, SourceStage, CreatedAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
                companyId, snapshotId || null, runId, domainKey, domainName,
                period.periodType, period.periodStart, period.periodEnd, itemType,
                textOrNull(title, 255), textOrNull(item?.description || item?.detail || item?.explanation),
                textOrNull(item?.severity, 50), textOrNull(item?.priority, 50), textOrNull(item?.status, 50),
                textOrNull(item?.likelihood, 80), textOrNull(item?.impact, 120),
                textOrNull(item?.businessImpact || item?.businessReason), evidenceSummary,
                textOrNull(item?.recommendation), textOrNull(item?.suggestedOwner || item?.owner, 180),
                suggestedDueDate, textOrNull(item?.direction, 50),
                numberOrNull(item?.currentValue), numberOrNull(item?.previousValue), numberOrNull(item?.changePercent),
                textOrNull(item?.comparisonPeriod, 50), source
            ]
        );
    }

    async function deleteItemsForDomainRun({ runId, domainKey }) {
        // Delete old items for this RunID + DomainKey before reinserting (prevents duplicates on reruns)
        await pool.query(
            `DELETE FROM StackCTRLEnterpriseIntelligenceItems WHERE RunID = ? AND DomainKey = ?`,
            [runId, domainKey]
        );
    }

    async function storeItems({ companyId, snapshotId, runId, domain, period, analysis, source = 'domain' }) {
        // Clean up old items for this domain run before inserting new ones (makes reruns idempotent)
        await deleteItemsForDomainRun({ runId, domainKey: domain.key });
        
        const groups = [
            ['finding', analysis.keyFindings],
            ['risk', analysis.risks || analysis.riskRegister],
            ['recommendation', analysis.recommendations],
            ['trend', analysis.trendAnalysis],
            ['management_action', analysis.managementActions],
            ['decision', analysis.topDecisionsRequired],
            ['management_action', analysis.next30DaysPlan],
            ['management_action', analysis.next90DaysPlan]
        ];
        for (const [itemType, items] of groups) {
            for (const itemValue of array(items)) {
                const item = typeof itemValue === 'string' ? { title: itemValue } : itemValue;
                await insertItem({ companyId, snapshotId, runId, domainKey: item?.domainKey || domain.key, domainName: item?.domainName || domain.name, period, itemType, item, source });
            }
        }
    }

    async function storeDomain({ run, companyId, snapshot, domain, packageResult, analysis, usage, status = 'completed', errorMessage = null, persistItems = true }) {
        const evidenceSummary = analysis ? textOrNull(analysis.evidenceUsed) : null;
        const [result] = await pool.query(
            `INSERT INTO StackCTRLTenantDomainIntelligence
             (CompanyID, SnapshotID, RunID, DomainKey, DomainName, PeriodType, PeriodStart, PeriodEnd,
              HealthScore, RiskScore, RiskLevel, InputSizeBytes, ResponseSizeBytes, InputTokens,
              OutputTokens, TotalTokens, RetryCount, Status, AnalysisJson, DomainExecutiveSummary,
              TechnicalSummary, BusinessImpact, CurrentPosture, EvidenceSummary, ScoreJustification,
              ControlAssessment, FindingsJson, RisksJson, RecommendationsJson, TrendAnalysisJson,
              YesterdayVsTodayJson, MissingDataWarningsJson, AssumptionsJson, ConfidenceScore, ErrorMessage)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
              HealthScore = VALUES(HealthScore), RiskScore = VALUES(RiskScore), RiskLevel = VALUES(RiskLevel),
              InputSizeBytes = VALUES(InputSizeBytes), ResponseSizeBytes = VALUES(ResponseSizeBytes),
              InputTokens = VALUES(InputTokens), OutputTokens = VALUES(OutputTokens), TotalTokens = VALUES(TotalTokens),
              RetryCount = VALUES(RetryCount), Status = VALUES(Status), AnalysisJson = VALUES(AnalysisJson),
              DomainExecutiveSummary = VALUES(DomainExecutiveSummary), TechnicalSummary = VALUES(TechnicalSummary),
              BusinessImpact = VALUES(BusinessImpact), CurrentPosture = VALUES(CurrentPosture),
              EvidenceSummary = VALUES(EvidenceSummary), ScoreJustification = VALUES(ScoreJustification),
              ControlAssessment = VALUES(ControlAssessment), FindingsJson = VALUES(FindingsJson),
              RisksJson = VALUES(RisksJson), RecommendationsJson = VALUES(RecommendationsJson),
              TrendAnalysisJson = VALUES(TrendAnalysisJson), YesterdayVsTodayJson = VALUES(YesterdayVsTodayJson),
              MissingDataWarningsJson = VALUES(MissingDataWarningsJson), AssumptionsJson = VALUES(AssumptionsJson),
              ConfidenceScore = VALUES(ConfidenceScore), ErrorMessage = VALUES(ErrorMessage)`,
            [
                companyId, snapshot.ID, run.id, domain.key, domain.name, run.periodType, run.periodStart, run.periodEnd,
                packageResult.current.healthScore, packageResult.current.riskScore, packageResult.current.riskLevel,
                usage.requestBytes || packageResult.audit.inputSizeBytes, usage.responseBytes, usage.inputTokens, usage.outputTokens, usage.totalTokens,
                usage.retries, status, analysis ? JSON.stringify(analysis) : null,
                analysis?.domainExecutiveSummary || null, analysis?.technicalSummary || null, analysis?.businessImpact || null,
                analysis?.currentPosture || null, evidenceSummary, analysis?.scoreJustification || null,
                analysis ? JSON.stringify(analysis.controlAssessment || {}) : null,
                analysis ? jsonArray(analysis.keyFindings) : null, analysis ? jsonArray(analysis.risks) : null,
                analysis ? jsonArray(analysis.recommendations) : null, analysis ? jsonArray(analysis.trendAnalysis) : null,
                analysis ? JSON.stringify(analysis.yesterdayVsToday || {}) : null,
                analysis ? jsonArray(analysis.missingDataWarnings) : null, analysis ? jsonArray(analysis.assumptions) : null,
                analysis?.confidenceScore ?? null, errorMessage ? String(errorMessage).slice(0, 5000) : null
            ]
        );
        if (analysis && persistItems) await storeItems({ companyId, snapshotId: snapshot.ID, runId: run.id, domain, period: run, analysis });
        return result.insertId || result.affectedRows;
    }

    async function storeAudit({ run, companyId, snapshot, domain, packageResult, analysis, usage, status, batchResults = null, failureReason = null, warningReasons = [], azureAttemptDiagnostics = [], currentBatch = null }) {
        const combinedText = JSON.stringify(analysis || {}).toLowerCase();
        const domainRunAudit = buildDomainRunAudit({
            domain,
            companyId,
            snapshot,
            packageResult,
            usage,
            status,
            batchResults,
            failureReason,
            warningReasons,
            azureAttemptDiagnostics,
            currentBatch
        });
        const auditInput = JSON.stringify({
            ...packageResult.package,
            domainRunAudit,
            evidenceBatchPlan: packageResult.audit.batchPlan,
            evidenceSample: packageResult.audit.evidenceSample,
            tokenTracking: {
                estimatedInputTokens: Math.ceil(Number(usage.requestBytes || packageResult.audit.inputSizeBytes || 0) / 4),
                actualInputTokens: usage.inputTokens,
                actualOutputTokens: usage.outputTokens,
                inputTokens: usage.inputTokens,
                outputTokens: usage.outputTokens,
                totalTokens: usage.totalTokens,
                thresholdUsed: settings.maxTotalTokens,
                retryCount: usage.retries || 0,
                retryOrCooldownOccurred: Boolean((usage.retries || 0) > 0),
                batchCount: packageResult.audit.batchPlan?.batchCount || 0,
                recordsSent: packageResult.audit.sentToAzureCount,
                recordsOmitted: packageResult.audit.evidenceOmittedCount,
                evidenceRowsIncluded: packageResult.audit.sentToAzureCount,
                catalogEntityCount: packageResult.audit.catalogEntityCount,
                catalogCategoryCount: packageResult.audit.catalogCategoryCount
            },
            jsonStatus: analysis
                ? (array(analysis.missingDataWarnings).some(warning => /recovered|incomplete json|closing json/i.test(String(warning))) ? 'recovered_with_warnings' : 'valid')
                : 'not_available'
        });
        const auditOmitted = JSON.stringify({
            stackCTRLDataCount: packageResult.audit.stackCTRLDataCount,
            sentToAzureCount: packageResult.audit.sentToAzureCount,
            omittedCount: packageResult.audit.omittedCount,
            evidenceOmittedCount: packageResult.audit.evidenceOmittedCount,
            catalogEntityCount: packageResult.audit.catalogEntityCount,
            catalogCategoryCount: packageResult.audit.catalogCategoryCount,
            batchPlan: packageResult.audit.batchPlan,
            detailReducedToMeetInputLimit: Boolean(packageResult.package.limitations?.detailReducedToMeetInputLimit),
            evidenceCompleteness: packageResult.package.limitations?.evidenceCompleteness || null,
            complete: packageResult.package.limitations?.evidenceCompleteness?.complete ?? null,
            omittedReasons: array(packageResult.package.limitations?.missingDataWarnings).slice(0, 20)
        });
        const azureMentioned = combinedText.includes(domain.key.replaceAll('_', ' ')) || combinedText.includes(domain.name.toLowerCase()) ? 1 : 0;
        const risksCount = array(analysis?.risks).length;
        const recommendationsCount = array(analysis?.recommendations).length;
        const trendsCount = array(analysis?.trendAnalysis).length;
        const inputBytes = usage.requestBytes || packageResult.audit.inputSizeBytes;
        await pool.query(
            `INSERT INTO StackCTRLIntelligenceEvidenceAudit
             (CompanyID, SnapshotID, RunID, DomainKey, StackCTRLDataCount, SentToAzureCount,
              OmittedCount, MetricsIncludedCount, EvidenceIncludedCount, EvidenceOmittedCount,
              HistoricalComparisonsIncluded, AzureMentionedDomain, RisksReturnedCount,
              RecommendationsReturnedCount, TrendsReturnedCount, InputSizeBytes, OutputSizeBytes,
              InputTokens, OutputTokens, RetryCount, Status, AzureInputSummaryJson,
              OmittedSummaryJson, CreatedAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
             ON DUPLICATE KEY UPDATE
              StackCTRLDataCount = ?, SentToAzureCount = ?, OmittedCount = ?, MetricsIncludedCount = ?,
              EvidenceIncludedCount = ?, EvidenceOmittedCount = ?, HistoricalComparisonsIncluded = ?,
              AzureMentionedDomain = ?, RisksReturnedCount = ?, RecommendationsReturnedCount = ?,
              TrendsReturnedCount = ?, InputSizeBytes = ?, OutputSizeBytes = ?, InputTokens = ?,
              OutputTokens = ?, RetryCount = ?, Status = ?, AzureInputSummaryJson = ?, OmittedSummaryJson = ?`,
            [
                companyId, snapshot.ID, run.id, domain.key, packageResult.audit.stackCTRLDataCount,
                packageResult.audit.sentToAzureCount, packageResult.audit.omittedCount,
                packageResult.audit.metricsIncludedCount, packageResult.audit.evidenceIncludedCount,
                packageResult.audit.evidenceOmittedCount, packageResult.audit.historicalComparisonsIncluded,
                azureMentioned, risksCount, recommendationsCount,
                trendsCount, inputBytes, usage.responseBytes, usage.inputTokens, usage.outputTokens, usage.retries, status,
                auditInput, auditOmitted,
                // ON DUPLICATE KEY UPDATE values
                packageResult.audit.stackCTRLDataCount, packageResult.audit.sentToAzureCount,
                packageResult.audit.omittedCount, packageResult.audit.metricsIncludedCount,
                packageResult.audit.evidenceIncludedCount, packageResult.audit.evidenceOmittedCount,
                packageResult.audit.historicalComparisonsIncluded, azureMentioned, risksCount,
                recommendationsCount, trendsCount, inputBytes, usage.responseBytes, usage.inputTokens,
                usage.outputTokens, usage.retries, status, auditInput, auditOmitted
            ]
        );
    }

    async function analyseDomain({ companyId, snapshot, run, domain, historicalContext, thresholdReached = false }) {
        if (domain.key === 'security_alerts') {
            logger.info?.('[security_alerts:start] Security Alerts enterprise domain processing starting');
            logger.info?.('[security_alerts:evidence_prepare:start] Preparing stored Security Alerts evidence for Azure');
            await updateRunStageProgress(run.id, { stage: 'evidence_prepare:start', lastSuccessfulStage: 'snapshot_collection:complete' });
        }
        const packageResult = await buildDomainPackage({ companyId, snapshot, runId: run.id, domain, historicalContext });
        if (domain.key === 'security_alerts') {
            logger.info?.(`[security_alerts:evidence_prepare:complete] Prepared ${packageResult.audit.preparedForAzureCount} stored evidence record(s)`);
            await updateRunStageProgress(run.id, { stage: 'evidence_prepare:complete', lastSuccessfulStage: 'evidence_prepare:complete' });
        }
        const missingFailure = DASHBOARD_BACKED_ENTERPRISE_DOMAINS.includes(domain.key)
            ? sourceMissingFailure(packageResult.package.sourceHealth, domain.name)
            : null;
        if (missingFailure) {
            const usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, requestBytes: 0, responseBytes: 0, retries: 0 };
            packageResult.audit.sentToAzureCount = 0;
            const limitedAnalysis = buildLimitedDataAnalysis({ domain, packageResult, reason: missingFailure.errorMessage });
            await storeDomain({
                run, companyId, snapshot, domain, packageResult, analysis: limitedAnalysis, usage,
                status: 'completed_with_warnings', errorMessage: missingFailure.errorMessage
            });
            await storeAudit({
                run, companyId, snapshot, domain, packageResult, analysis: limitedAnalysis, usage,
                status: 'completed_with_warnings'
            });
            if (domain.key === 'security_alerts') {
                logger.warn?.(`[security_alerts:complete_or_completed_with_warnings_or_failed] completed_with_warnings: ${missingFailure.errorMessage}`);
                await updateRunStageProgress(run.id, {
                    stage: 'completed_with_warnings',
                    lastSuccessfulStage: 'evidence_prepare:complete',
                    warning: missingFailure.errorMessage
                });
            }
            return {
                status: 'completed_with_warnings',
                domain,
                usage,
                audit: packageResult.audit,
                analysis: limitedAnalysis,
                errorMessage: missingFailure.errorMessage,
                sourceHealth: packageResult.package.sourceHealth,
                limitedData: true
            };
        }
        const alignmentFailure = sourceAlignmentFailure(packageResult.sourceAlignment, domain.name);
        if (alignmentFailure) {
            const usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, requestBytes: 0, responseBytes: 0, retries: 0 };
            packageResult.audit.sentToAzureCount = 0;
            await storeDomain({
                run, companyId, snapshot, domain, packageResult, analysis: null, usage,
                status: alignmentFailure.status, errorMessage: alignmentFailure.errorMessage
            });
            await storeAudit({
                run, companyId, snapshot, domain, packageResult, analysis: null, usage,
                status: alignmentFailure.status
            });
            if (domain.key === 'security_alerts') {
                await updateRunStageProgress(run.id, { stage: 'failed_terminal', lastSuccessfulStage: 'evidence_prepare:complete', failureReason: alignmentFailure.errorMessage });
            }
            return {
                status: alignmentFailure.status, domain, usage, audit: packageResult.audit,
                errorMessage: alignmentFailure.errorMessage, sourceAlignment: packageResult.sourceAlignment
            };
        }

        const staleFailure = sourceStaleFailure(packageResult.package.sourceHealth, domain.name);
        if (staleFailure) {
            packageResult.package.sourceHealth = {
                ...packageResult.package.sourceHealth,
                source_stale: true,
                ageMinutes: staleFailure.ageMinutes,
                lastRefreshTime: staleFailure.lastUpdated,
                warnings: [...new Set([...array(packageResult.package.sourceHealth?.warnings), staleFailure.errorMessage])]
            };
            packageResult.package.limitations.missingDataWarnings = [
                ...new Set([...array(packageResult.package.limitations?.missingDataWarnings), staleFailure.errorMessage])
            ];
            logger.warn?.(`[StackCTRL Enterprise] ${staleFailure.errorMessage}`);
        }

        if (domain.key === 'security_alerts') {
            const expectedSourceRecords = Number(packageResult.current.source?.sourceLineage?.evidenceRecordCount ?? packageResult.audit.preparedForAzureCount);
            const preparedRecords = Number(packageResult.audit.preparedForAzureCount || 0);
            if (expectedSourceRecords !== preparedRecords) {
                const errorMessage = `Security Alerts evidence validation failed: ${expectedSourceRecords} stored source record(s) were expected but ${preparedRecords} record(s) were prepared for Azure.`;
                packageResult.audit.evidenceOmittedCount = Math.max(0, expectedSourceRecords - preparedRecords);
                packageResult.package.limitations.missingDataWarnings.push(errorMessage);
                logger.warn?.(`[security_alerts:evidence_prepare:warning] ${errorMessage} Continuing with all prepared evidence and preserving the discrepancy in limitations.`);
                await updateRunStageProgress(run.id, {
                    stage: 'evidence_prepare:warning',
                    lastSuccessfulStage: 'evidence_prepare:complete',
                    warning: errorMessage
                });
            }
        }

        const preparedRecordCount = array(packageResult.allEvidence).length;
        const stackctrlRecordCount = Number(packageResult.audit.stackCTRLDataCount || 0);
        if (stackctrlRecordCount > 0 && preparedRecordCount === 0) {
            const omittedReasons = array(packageResult.package.limitations?.missingDataWarnings);
            const errorMessage = `evidence_prepare_failed: ${stackctrlRecordCount} StackCTRL source record(s) exist but 0 were prepared for Azure.${omittedReasons.length ? ` Omitted reasons: ${omittedReasons.join('; ')}` : ' No omission reason was recorded.'}`;
            const usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, requestBytes: 0, responseBytes: 0, retries: 0 };
            packageResult.audit.sentToAzureCount = 0;
            await storeDomain({
                run, companyId, snapshot, domain, packageResult, analysis: null, usage,
                status: 'failed_terminal', errorMessage
            });
            await storeAudit({
                run, companyId, snapshot, domain, packageResult, analysis: null, usage,
                status: 'failed_terminal',
                failureReason: 'evidence_prepare_failed',
                warningReasons: omittedReasons
            });
            if (domain.key === 'security_alerts') {
                await updateRunStageProgress(run.id, {
                    stage: 'failed_terminal',
                    lastSuccessfulStage: 'evidence_prepare:complete',
                    failureReason: errorMessage
                });
            }
            return {
                status: 'failed_terminal',
                domain,
                usage,
                audit: packageResult.audit,
                errorMessage,
                failureReason: 'evidence_prepare_failed'
            };
        }

        if (!array(packageResult.allEvidence).length) {
            const usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, requestBytes: 0, responseBytes: 0, retries: 0 };
            const warning = `${domain.name} has no entity-level evidence rows in this snapshot. Enterprise Deep Reporting continued with warning-only output for this domain.`;
            packageResult.audit.sentToAzureCount = 0;
            packageResult.package.limitations.missingDataWarnings.push(warning);
            const limitedAnalysis = buildLimitedDataAnalysis({ domain, packageResult, reason: warning });
            await storeDomain({
                run, companyId, snapshot, domain, packageResult, analysis: limitedAnalysis, usage,
                status: 'completed_with_warnings', errorMessage: warning
            });
            await storeAudit({
                run, companyId, snapshot, domain, packageResult, analysis: limitedAnalysis, usage,
                status: 'completed_with_warnings'
            });
            if (domain.key === 'security_alerts') {
                logger.warn?.(`[security_alerts:complete_or_completed_with_warnings_or_failed] completed_with_warnings: ${warning}`);
                await updateRunStageProgress(run.id, {
                    stage: 'completed_with_warnings',
                    lastSuccessfulStage: 'evidence_prepare:complete',
                    warning
                });
            }
            return {
                status: 'completed_with_warnings',
                domain,
                usage,
                audit: packageResult.audit,
                analysis: limitedAnalysis,
                errorMessage: warning,
                limitedData: true
            };
        }
        
        try {
            // Process domain in batches instead of reducing evidence
            const batchResults = await processDomainBatches({
                companyId, snapshot, run, domain,
                packageResult,
                allEvidence: packageResult.allEvidence,
                historicalContext,
                thresholdReached
            });
            
            // Check if all batches completed successfully
            const failedBatches = batchResults.results.filter(r => !isSuccessfulDomainStatus(r.status));
            const completedBatches = batchResults.results.filter(r => isSuccessfulDomainStatus(r.status));
            
            if (completedBatches.length === 0) {
                const failedStatus = domainFailureStatus(failedBatches);
                const failedMessage = failedBatches.map(batch => batch.errorMessage).filter(Boolean).join(' | ') || `All ${batchResults.batchCount} batches failed`;
                packageResult.audit.sentToAzureCount = 0;
                // All batches failed
                await storeDomain({
                    run, companyId, snapshot, domain, packageResult, analysis: null,
                    usage: batchResults.totals, status: failedStatus,
                    errorMessage: failedMessage
                });
                await storeAudit({
                    run, companyId, snapshot, domain, packageResult, analysis: null,
                    usage: batchResults.totals, status: failedStatus
                });
                return {
                    status: failedStatus,
                    domain,
                    usage: batchResults.totals,
                    audit: packageResult.audit,
                    errorMessage: failedMessage,
                    rateLimited: batchResults.rateLimited,
                    recommendedRetryAfterMs: batchResults.recommendedRetryAfterMs
                };
            }
            
            // Aggregate batch results into domain-level analysis
            const mergeByTitle = items => {
                const merged = new Map();
                const uniqueValues = values => {
                    const seen = new Set();
                    return array(values).filter(value => {
                        const key = typeof value === 'string' ? value : JSON.stringify(value);
                        if (seen.has(key)) return false;
                        seen.add(key);
                        return true;
                    });
                };
                for (const item of array(items)) {
                    const key = `${item?.title || ''}|${item?.sourceMetric || ''}|${item?.severity || ''}`;
                    if (!merged.has(key)) {
                        merged.set(key, { ...item });
                        continue;
                    }
                    const current = merged.get(key);
                    merged.set(key, {
                        ...current,
                        ...item,
                        affectedEntities: uniqueValues([...array(current.affectedEntities), ...array(item.affectedEntities)]),
                        evidenceRows: uniqueValues([...array(current.evidenceRows), ...array(item.evidenceRows)]),
                        sourceAlertIds: uniqueValues([...array(current.sourceAlertIds), ...array(item.sourceAlertIds)]),
                        sourceMetrics: uniqueValues([...array(current.sourceMetrics), ...array(item.sourceMetrics)]),
                        recommendedActions: uniqueValues([...array(current.recommendedActions), ...array(item.recommendedActions)])
                    });
                }
                return [...merged.values()];
            };
            const controlAssessments = completedBatches.map(batch => batch.analysis?.controlAssessment).filter(Boolean);
            const mergedControlAssessment = controlAssessments.some(Array.isArray)
                ? mergeByTitle(controlAssessments.flatMap(value => array(value)))
                : controlAssessments.reduce((merged, value) => ({ ...merged, ...value }), {});
            const confidenceScores = completedBatches
                .map(batch => numberOrNull(batch.analysis?.confidenceScore))
                .filter(score => score != null);
            const recordsPrepared = Number(packageResult.audit.preparedForAzureCount || packageResult.audit.stackCTRLDataCount || 0);
            const recordsSent = Number(batchResults.processedItems || 0);
            const batchRecordsOmitted = Number(batchResults.omittedItems || 0);
            const sourceRecordsOmitted = Number(packageResult.audit.evidenceOmittedCount || 0);
            const batchAccountingComplete = recordsSent + batchRecordsOmitted === recordsPrepared;
            const batchFailureReasons = failedBatches.map(batch => batch.failureReason || batch.errorMessage).filter(Boolean);
            const invalidJsonFallbacks = completedBatches
                .map(batch => batch.analysis)
                .filter(analysis => analysis?.warningType === 'azure_invalid_json');
            const aggregatedRawAnalysis = {
                domainKey: domain.key,
                status: invalidJsonFallbacks.length ? 'completed_with_warnings' : null,
                warningType: invalidJsonFallbacks.length ? 'azure_invalid_json' : null,
                snapshotId: snapshot.ID,
                recordsPrepared,
                recordsSent,
                recordsOmitted: batchRecordsOmitted + sourceRecordsOmitted,
                omittedReasons: [...array(packageResult.package.limitations?.missingDataWarnings), ...batchFailureReasons],
                evidenceAvailable: recordsPrepared > 0,
                message: invalidJsonFallbacks.map(item => item.message).filter(Boolean).join(' | ') || null,
                rawAzureResponseStored: invalidJsonFallbacks.length > 0 && invalidJsonFallbacks.every(item => item.rawAzureResponseStored),
                domainExecutiveSummary: completedBatches.map(b => b.analysis?.domainExecutiveSummary).filter(Boolean).join(' '),
                technicalSummary: completedBatches.map(b => b.analysis?.technicalSummary).filter(Boolean).join(' '),
                businessImpact: completedBatches.map(b => b.analysis?.businessImpact).filter(Boolean).join(' '),
                currentPosture: completedBatches.map(b => b.analysis?.currentPosture).filter(Boolean).join(' '),
                evidenceUsed: completedBatches.flatMap(b => b.analysis?.evidenceUsed || []),
                evidenceGaps: completedBatches.flatMap(b => b.analysis?.evidenceGaps || []),
                scoreJustification: completedBatches.map(b => b.analysis?.scoreJustification).filter(Boolean).join(' '),
                controlAssessment: mergedControlAssessment,
                keyFindings: mergeByTitle(completedBatches.flatMap(b => b.analysis?.keyFindings || [])),
                risks: mergeByTitle(completedBatches.flatMap(b => b.analysis?.risks || [])),
                recommendations: mergeByTitle(completedBatches.flatMap(b => b.analysis?.recommendations || [])),
                trendAnalysis: mergeByTitle(completedBatches.flatMap(b => b.analysis?.trendAnalysis || [])),
                yesterdayVsToday: completedBatches[0]?.analysis?.yesterdayVsToday || {},
                whatImproved: completedBatches.flatMap(b => b.analysis?.whatImproved || []),
                whatDeteriorated: completedBatches.flatMap(b => b.analysis?.whatDeteriorated || []),
                whatStayedTheSame: completedBatches.flatMap(b => b.analysis?.whatStayedTheSame || []),
                missingDataWarnings: [
                    ...array(packageResult.package.limitations?.missingDataWarnings),
                    ...completedBatches.flatMap(b => b.analysis?.missingDataWarnings || []),
                    ...(batchResults.omittedItems > 0 ? [`${batchResults.omittedItems} evidence row(s) were not analysed because ${failedBatches.length} batch(es) failed.`] : []),
                    ...(batchResults.complete ? [] : ['Domain analysis is incomplete; do not treat this output as fully complete.'])
                ],
                assumptions: completedBatches.flatMap(b => b.analysis?.assumptions || []),
                confidenceScore: confidenceScores.length
                    ? Number((confidenceScores.reduce((total, score) => total + score, 0) / confidenceScores.length).toFixed(2))
                    : completedBatches[0]?.analysis?.confidenceScore ?? null,
                managementActions: mergeByTitle(completedBatches.flatMap(b => b.analysis?.managementActions || [])),
                powerBiSummary: completedBatches.reduce((merged, batch) => ({ ...merged, ...(batch.analysis?.powerBiSummary || {}) }), {}),
                evidenceCatalog: packageResult.evidenceCatalog,
                evidenceLimitations: {
                    recordsPrepared,
                    recordsSent,
                    recordsOmitted: batchRecordsOmitted + sourceRecordsOmitted,
                    totalEntityRows: packageResult.audit.stackCTRLDataCount,
                    catalogEntityCount: packageResult.audit.catalogEntityCount,
                    catalogCategoryCount: packageResult.audit.catalogCategoryCount,
                    completedBatches: completedBatches.length,
                    totalBatches: batchResults.batchCount,
                    accountingComplete: batchAccountingComplete,
                    complete: batchResults.complete && sourceRecordsOmitted === 0 && batchAccountingComplete,
                    omittedReasons: [...array(packageResult.package.limitations?.missingDataWarnings), ...batchFailureReasons]
                },
                authoritativeScores: { healthScore: packageResult.current.healthScore, riskScore: packageResult.current.riskScore, riskLevel: packageResult.current.riskLevel },
                domain: { key: domain.key, name: domain.name },
                batchInfo: {
                    completedBatches: completedBatches.length,
                    totalBatches: batchResults.batchCount,
                    failedBatches: failedBatches.length,
                    processedItems: batchResults.processedItems,
                    omittedItems: batchResults.omittedItems,
                    complete: batchResults.complete
                }
            };
            const aggregatedAnalysis = normalizedDomainResult(
                aggregatedRawAnalysis,
                domain,
                packageResult.current,
                snapshot.ID,
                packageResult.allEvidence
            );
            aggregatedAnalysis.dataLineageComparison = buildDataLineageComparison({
                fields: packageResult.sourceAlignment.rows.map(row => row.metric),
                sourceValues: Object.fromEntries(packageResult.sourceAlignment.rows.map(row => [row.metric, row.stackCTRLSource])),
                inputValues: Object.fromEntries(packageResult.sourceAlignment.rows.map(row => [row.metric, row.enterpriseAzureInput])),
                azureOutput: aggregatedAnalysis,
                storedIntelligence: aggregatedAnalysis
            }).rows;
            
            const recoveredBatches = completedBatches.filter(batch => batch.status === 'completed_with_warnings');
            const securityAccountingFailure = domain.key === 'security_alerts' && !batchAccountingComplete;
            const finalStatus = failedBatches.length > 0 && completedBatches.length === 0
                ? (failedBatches.every(batch => isConnectionFailureResult(batch)) ? 'failed_terminal' : 'partial')
                : securityAccountingFailure
                    ? 'completed_with_warnings'
                    : failedBatches.length > 0
                        ? 'partial'
                        : recoveredBatches.length > 0 ? 'completed_with_warnings' : 'completed';
            const successfullyAnalysedCount = completedBatches.reduce((total, batch) => total + Number(batch.batchItemCount || 0), 0);
            packageResult.audit.sentToAzureCount = successfullyAnalysedCount;
            packageResult.audit.evidenceOmittedCount = sourceRecordsOmitted + batchRecordsOmitted;
            const partialErrorMessage = securityAccountingFailure
                ? `Security Alerts batch accounting failed: ${recordsPrepared} prepared, ${recordsSent} sent, ${batchRecordsOmitted} omitted.`
                : failedBatches.length
                ? `${failedBatches.length} of ${batchResults.batchCount} batch(es) failed. ${failedBatches.map(batch => batch.errorMessage).filter(Boolean).join(' | ')}`.slice(0, 5000)
                : invalidJsonFallbacks.length
                    ? invalidJsonFallbacks.map(item => item.message).filter(Boolean).join(' | ').slice(0, 5000)
                    : null;
            const domainIntelligenceId = await storeDomain({
                run, companyId, snapshot, domain, packageResult,
                analysis: aggregatedAnalysis, usage: batchResults.totals,
                status: finalStatus,
                errorMessage: partialErrorMessage
            });
            
            // Store aggregate audit info showing all data was processed in batches
            const updatedAudit = {
                ...packageResult.audit,
                batchCount: batchResults.batchCount,
                completedBatches: completedBatches.length
            };
            await storeAudit({
                run, companyId, snapshot, domain, packageResult,
                analysis: aggregatedAnalysis, usage: batchResults.totals,
                status: finalStatus,
                batchResults,
                failureReason: partialErrorMessage,
                warningReasons: array(aggregatedAnalysis.missingDataWarnings),
                azureAttemptDiagnostics: failedBatches.flatMap(batch => batch.attemptDiagnostics || [])
            });
            if (domain.key === 'security_alerts') {
                logger.info?.(`[security_alerts:storage:complete] Stored Security Alerts domain intelligence ${domainIntelligenceId}`);
                logger.info?.(`[security_alerts:complete_or_completed_with_warnings_or_failed] ${finalStatus}`, {
                    recordsPrepared, recordsSent, recordsOmitted: batchRecordsOmitted + sourceRecordsOmitted,
                    batchCount: batchResults.batchCount, warnings: aggregatedAnalysis.missingDataWarnings
                });
                await updateRunStageProgress(run.id, {
                    stage: finalStatus,
                    lastSuccessfulStage: 'storage:complete',
                    warning: finalStatus === 'completed_with_warnings' || finalStatus === 'partial'
                        ? aggregatedAnalysis.missingDataWarnings.join(' | ').slice(0, 2000) : null,
                    failureReason: finalStatus.startsWith('failed') ? partialErrorMessage : null
                });
            }
            
            return {
                status: finalStatus,
                domain,
                domainIntelligenceId,
                analysis: aggregatedAnalysis,
                usage: batchResults.totals,
                audit: updatedAudit,
                batchInfo: { completedBatches: completedBatches.length, totalBatches: batchResults.batchCount, failedBatches: failedBatches.length },
                errorMessage: partialErrorMessage,
                rateLimited: batchResults.rateLimited,
                recommendedRetryAfterMs: batchResults.recommendedRetryAfterMs
            };
        } catch (error) {
            logger.error(`[StackCTRL Enterprise] ${domain.name} analysis failed:`, error.message);
            const failureStatus = error.enterpriseStatus || classifyFailureStatus(error);
            packageResult.audit.sentToAzureCount = 0;
            await storeDomain({
                run, companyId, snapshot, domain, packageResult,
                analysis: null, usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, requestBytes: 0, responseBytes: 0, retries: 0 },
                status: failureStatus, errorMessage: error.message
            });
            await storeAudit({
                run, companyId, snapshot, domain, packageResult,
                analysis: null, usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, requestBytes: 0, responseBytes: 0, retries: 0 },
                status: failureStatus
            });
            if (domain.key === 'security_alerts') {
                logger.error?.(`[security_alerts:complete_or_completed_with_warnings_or_failed] failed_terminal: ${error.message}`);
                await updateRunStageProgress(run.id, { stage: 'failed_terminal', lastSuccessfulStage: 'evidence_prepare:complete', failureReason: error.message }).catch(() => {});
            }
            return { status: failureStatus, domain, usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, requestBytes: 0, responseBytes: 0, retries: 0 }, audit: packageResult.audit, errorMessage: error.message };
        }
    }

    async function loadDomainRows(runId, { successfulOnly = false } = {}) {
        const [rows] = await pool.query(
            `SELECT ID, CompanyID, SnapshotID, RunID, DomainKey, DomainName, HealthScore, RiskScore,
                    RiskLevel, Status, DomainExecutiveSummary, TechnicalSummary, BusinessImpact,
                    CurrentPosture, EvidenceSummary, ScoreJustification, ControlAssessment,
                    FindingsJson, RisksJson, RecommendationsJson, TrendAnalysisJson,
                    YesterdayVsTodayJson, MissingDataWarningsJson, AssumptionsJson, ConfidenceScore,
                    ErrorMessage
             FROM StackCTRLTenantDomainIntelligence WHERE RunID = ? ORDER BY ID`,
            [runId]
        );
        const mapped = rows.map(row => ({
            domainKey: row.DomainKey, domainName: row.DomainName, healthScore: row.HealthScore,
            riskScore: row.RiskScore, riskLevel: row.RiskLevel, status: row.Status,
            domainExecutiveSummary: row.DomainExecutiveSummary, technicalSummary: row.TechnicalSummary,
            businessImpact: row.BusinessImpact, currentPosture: row.CurrentPosture,
            evidenceSummary: row.EvidenceSummary, scoreJustification: row.ScoreJustification,
            controlAssessment: safeValue(parseJson(row.ControlAssessment, {}), 0, { maxArray: 20, maxString: 2000 }),
            findings: array(parseJson(row.FindingsJson, [])).slice(0, 20),
            risks: array(parseJson(row.RisksJson, [])).slice(0, 20),
            recommendations: array(parseJson(row.RecommendationsJson, [])).slice(0, 20),
            trends: array(parseJson(row.TrendAnalysisJson, [])).slice(0, 20),
            yesterdayVsToday: safeValue(parseJson(row.YesterdayVsTodayJson, {}), 0, { maxArray: 20 }),
            missingDataWarnings: array(parseJson(row.MissingDataWarningsJson, [])).slice(0, 30),
            assumptions: array(parseJson(row.AssumptionsJson, [])).slice(0, 30),
            confidenceScore: row.ConfidenceScore,
            errorMessage: row.ErrorMessage || null
        }));
        return successfulOnly ? mapped.filter(row => isSuccessfulDomainStatus(row.status)) : mapped;
    }

    async function loadRollups(companyId, periodType, periodStart, periodEnd) {
        const lowerPeriod = LOWER_PERIOD[periodType];
        if (!lowerPeriod) return [];
        const lowerPeriods = periodType === 'monthly' ? ['weekly', 'daily'] : [lowerPeriod];
        const periodPlaceholders = lowerPeriods.map(() => '?').join(', ');
        const [rows] = await pool.query(
            `SELECT synthesis.ID, synthesis.PeriodType, synthesis.PeriodStart, synthesis.PeriodEnd,
                    synthesis.ExecutiveSummaryJson, synthesis.BoardReportJson, synthesis.ManagementReportJson,
                    synthesis.DomainScorecardJson, synthesis.MaturityAssessmentJson,
                    synthesis.EvidenceJustificationJson, synthesis.LimitationsJson, synthesis.PowerBISummaryJson
             FROM StackCTRLEnterpriseSynthesis synthesis
             WHERE synthesis.CompanyID = ? AND synthesis.Status = 'completed'
               AND synthesis.PeriodType IN (${periodPlaceholders})
               AND synthesis.PeriodStart <= ? AND synthesis.PeriodEnd >= ?
             ORDER BY synthesis.PeriodStart ASC LIMIT 400`,
            [companyId, ...lowerPeriods, periodEnd, periodStart]
        );
        return rows.map(row => ({
            synthesisId: row.ID, periodType: row.PeriodType, periodStart: row.PeriodStart, periodEnd: row.PeriodEnd,
            executiveSummary: parseJson(row.ExecutiveSummaryJson, {}), boardReport: parseJson(row.BoardReportJson, {}),
            managementReport: parseJson(row.ManagementReportJson, {}), domainScorecard: parseJson(row.DomainScorecardJson, []),
            maturityAssessment: parseJson(row.MaturityAssessmentJson, {}), evidenceJustification: parseJson(row.EvidenceJustificationJson, {}),
            limitations: parseJson(row.LimitationsJson, []), powerBiSummary: parseJson(row.PowerBISummaryJson, {})
        }));
    }

    async function runSynthesis({ companyId, snapshotId, run, existingTotals = null, queuedDomainKeys = null }) {
        const allDomainRows = await loadDomainRows(run.id);
        const domainRows = await loadDomainRows(run.id, { successfulOnly: true });
        const rollups = await loadRollups(companyId, run.periodType, run.periodStart, run.periodEnd);
        if (!domainRows.length && !rollups.length) throw new Error('Enterprise synthesis requires stored domain intelligence or completed lower-period reports');
        const domainRunSummary = buildDomainRunSummary(allDomainRows, queuedDomainKeys || allDomainRows.map(row => row.domainKey));
        const synthesisPackage = {
            contextType: 'stackctrl_enterprise_synthesis',
            schemaVersion: 1,
            companyId,
            snapshotId: snapshotId || null,
            period: { type: run.periodType, start: run.periodStart, end: run.periodEnd },
            domainIntelligence: domainRows,
            domainRunSummary,
            lowerPeriodReports: rollups,
            sourceHealthSummary: domainRows.map(row => ({ domainKey: row.domainKey, status: row.status, healthScore: row.healthScore, riskScore: row.riskScore, riskLevel: row.riskLevel })),
            missingDataWarnings: domainRows.flatMap(row => array(row.missingDataWarnings)),
            limitations: {
                rawSnapshotIncluded: false,
                rawVendorPayloadIncluded: false,
                synthesisUsesStoredIntelligenceOnly: true,
                excludedDomainStatuses: allDomainRows
                    .filter(row => !isSuccessfulDomainStatus(row.status))
                    .map(row => ({ domainKey: row.domainKey, status: row.status, errorMessage: row.errorMessage || null }))
            }
        };
        const response = await azureOpenAI.createJsonCompletion({
            messages: [
                { role: 'system', content: 'You are StackCTRL Enterprise Intelligence. Return valid JSON only. No markdown. No code fences. No explanations outside JSON.' },
                { role: 'user', content: synthesisPrompt(safeValue(synthesisPackage, 0, { maxDepth: 8, maxArray: 100, maxString: 5000 })) }
            ],
            temperature: 0.15,
            maxTokens: settings.maxSynthesisOutputTokens,
            maxRetriesOverride: settings.maxRetries,
            retryDelaysMsOverride: ENTERPRISE_RATE_LIMIT_RETRY_DELAYS_MS,
                retryMaxMsOverride: ENTERPRISE_RATE_LIMIT_RETRY_MAX_MS,
                connectionRetryDelaysMsOverride: ENTERPRISE_CONNECTION_RETRY_DELAYS_MS,
                timeoutMs: settings.requestTimeoutMs,
            allowInvalidJsonResponse: true
        });
        const usage = responseUsage(response);
        const finishReason = responseFinishReason(response);
        let analysis = response.data || {};
        let synthesisJsonRecovered = false;
        if (typeof response.data === 'string') {
            const parsed = parseJsonWithDiagnostics(response.data);
            if (!parsed.success) {
                const localRepair = repairTruncatedJson(response.data);
                logger.warn(`[StackCTRL Enterprise] Synthesis JSON parsing failed, attempting one Azure repair. Error: ${parsed.error}`);
                let repairResponse = null;
                try {
                    repairResponse = await azureOpenAI.createJsonCompletion({
                    messages: [
                        { role: 'system', content: 'You are a JSON repair tool. Return valid JSON only. Preserve complete evidence fields and arrays. No markdown. No code fences. No explanations outside JSON.' },
                        { role: 'user', content: createJsonRepairPrompt(response.data.slice(0, 60000)) }
                    ],
                    temperature: 0,
                    maxTokens: settings.maxSynthesisOutputTokens,
                    maxRetriesOverride: 1,
                    retryDelaysMsOverride: ENTERPRISE_RATE_LIMIT_RETRY_DELAYS_MS,
                retryMaxMsOverride: ENTERPRISE_RATE_LIMIT_RETRY_MAX_MS,
                connectionRetryDelaysMsOverride: ENTERPRISE_CONNECTION_RETRY_DELAYS_MS,
                timeoutMs: settings.requestTimeoutMs,
                    allowInvalidJsonResponse: true
                    });
                } catch (repairError) {
                    if (!localRepair.success) throw repairError;
                    analysis = localRepair.value;
                    synthesisJsonRecovered = true;
                }
                if (repairResponse) {
                    const repairUsage = responseUsage(repairResponse);
                    usage.inputTokens += repairUsage.inputTokens;
                    usage.outputTokens += repairUsage.outputTokens;
                    usage.totalTokens += repairUsage.totalTokens;
                    usage.requestBytes += repairUsage.requestBytes;
                    usage.responseBytes += repairUsage.responseBytes;
                    usage.retries += repairUsage.retries;
                    const repaired = parseJsonWithDiagnostics(repairResponse.data);
                    const locallyRepairedResponse = repaired.success ? null : repairTruncatedJson(repairResponse.data);
                    const recovered = repaired.success
                        ? repaired.value
                        : locallyRepairedResponse?.success ? locallyRepairedResponse.value
                            : localRepair.success ? localRepair.value : null;
                    if (!recovered) {
                        const error = new Error(`Enterprise synthesis JSON parse failed: ${parsed.error}. Repair attempt also failed: ${repaired.error}`);
                        error.enterpriseStatus = 'failed_invalid_json';
                        throw error;
                    }
                    analysis = recovered;
                    synthesisJsonRecovered = true;
                }
            } else {
                analysis = parsed.value;
            }
        }
        if (synthesisJsonRecovered || finishReason === 'length') {
            analysis.limitationsAndAssumptions = [
                ...array(analysis.limitationsAndAssumptions),
                'Azure synthesis output ended before all closing JSON delimiters were returned. StackCTRL safely recovered the structured response; trailing narrative fields may be incomplete.'
            ];
        }
        const finalRunStatus = synthesisJsonRecovered || finishReason === 'length' || allDomainRows.some(row => row.status !== 'completed')
            ? 'completed_with_warnings'
            : 'completed';
        const [result] = await pool.query(
            `INSERT INTO StackCTRLEnterpriseSynthesis
             (CompanyID, SnapshotID, RunID, PeriodType, PeriodStart, PeriodEnd, Status,
              ExecutiveSummaryJson, BoardReportJson, ManagementReportJson, RiskRegisterJson,
              RecommendationsJson, TrendAnalysisJson, ComplianceReviewJson, GovernanceReviewJson,
              DomainScorecardJson, MaturityAssessmentJson, BusinessImpactSummary,
              TopDecisionsRequiredJson, Next30DaysPlanJson, Next90DaysPlanJson,
              EvidenceJustificationJson, LimitationsJson, PowerBISummaryJson, InputSizeBytes,
              ResponseSizeBytes, InputTokens, OutputTokens, TotalTokens, RetryCount, CreatedAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
             ON DUPLICATE KEY UPDATE
              Status = VALUES(Status), ExecutiveSummaryJson = VALUES(ExecutiveSummaryJson),
              BoardReportJson = VALUES(BoardReportJson), ManagementReportJson = VALUES(ManagementReportJson),
              RiskRegisterJson = VALUES(RiskRegisterJson), RecommendationsJson = VALUES(RecommendationsJson),
              TrendAnalysisJson = VALUES(TrendAnalysisJson), ComplianceReviewJson = VALUES(ComplianceReviewJson),
              GovernanceReviewJson = VALUES(GovernanceReviewJson), DomainScorecardJson = VALUES(DomainScorecardJson),
              MaturityAssessmentJson = VALUES(MaturityAssessmentJson), BusinessImpactSummary = VALUES(BusinessImpactSummary),
              TopDecisionsRequiredJson = VALUES(TopDecisionsRequiredJson), Next30DaysPlanJson = VALUES(Next30DaysPlanJson),
              Next90DaysPlanJson = VALUES(Next90DaysPlanJson), EvidenceJustificationJson = VALUES(EvidenceJustificationJson),
              LimitationsJson = VALUES(LimitationsJson), PowerBISummaryJson = VALUES(PowerBISummaryJson),
              InputSizeBytes = VALUES(InputSizeBytes), ResponseSizeBytes = VALUES(ResponseSizeBytes),
              InputTokens = VALUES(InputTokens), OutputTokens = VALUES(OutputTokens), TotalTokens = VALUES(TotalTokens),
              RetryCount = VALUES(RetryCount)`,
            [
                companyId, snapshotId || null, run.id, run.periodType, run.periodStart, run.periodEnd, finalRunStatus,
                JSON.stringify(analysis.enterpriseExecutiveSummary || {}), JSON.stringify(analysis.boardReport || {}),
                JSON.stringify(analysis.managementReport || {}), jsonArray(analysis.riskRegister),
                jsonArray(analysis.recommendations), jsonArray(analysis.trendAnalysis),
                JSON.stringify(analysis.complianceReview || {}), JSON.stringify(analysis.governanceReview || {}),
                jsonArray(analysis.domainScorecard), JSON.stringify(analysis.maturityAssessment || {}),
                textOrNull(analysis.businessImpactSummary), jsonArray(analysis.topDecisionsRequired),
                jsonArray(analysis.next30DaysPlan), jsonArray(analysis.next90DaysPlan),
                JSON.stringify(analysis.evidenceJustificationSummary || {}), jsonArray(analysis.limitationsAndAssumptions),
                JSON.stringify(analysis.powerBiSummary || {}), usage.requestBytes || bytes(synthesisPackage), usage.responseBytes,
                usage.inputTokens, usage.outputTokens, usage.totalTokens, usage.retries
            ]
        );
        await storeItems({
            companyId, snapshotId, runId: run.id,
            domain: { key: 'enterprise', name: 'Overall Risks' }, period: run,
            analysis: {
                riskRegister: analysis.riskRegister,
                recommendations: analysis.recommendations,
                trendAnalysis: analysis.trendAnalysis,
                managementActions: [...array(analysis.managementReport?.managementActions), ...array(analysis.managementReport?.actions)],
                topDecisionsRequired: analysis.topDecisionsRequired,
                next30DaysPlan: analysis.next30DaysPlan,
                next90DaysPlan: analysis.next90DaysPlan
            },
            source: 'synthesis'
        });
        const totals = existingTotals || { inputTokens: 0, outputTokens: 0, totalTokens: 0, requestBytes: 0, responseBytes: 0, retries: 0 };
        for (const key of Object.keys(totals)) totals[key] += usage[key] || 0;
        await pool.query(
            `UPDATE StackCTRLEnterpriseReportRuns
             SET Status = ?, CompletedAt = NOW(), TotalInputTokens = ?, TotalOutputTokens = ?,
                 TotalTokens = ?, TotalRequestBytes = ?, TotalResponseBytes = ?, RetryCount = ?
             WHERE ID = ?`,
            [finalRunStatus, totals.inputTokens, totals.outputTokens, totals.totalTokens, totals.requestBytes, totals.responseBytes, totals.retries, run.id]
        );
        return { synthesisId: result.insertId || run.id, status: finalRunStatus, analysis, usage };
    }

    async function processDomains({ companyId, snapshot, run, domainKeys }) {
        const historicalContext = await schedulerService.getHistoricalSnapshotContext(companyId, snapshot.ID);
        const selected = domainKeys.map(key => DOMAIN_BY_KEY[key]).filter(Boolean);
        const results = [];
        const totals = { inputTokens: 0, outputTokens: 0, totalTokens: 0, requestBytes: 0, responseBytes: 0, retries: 0 };
        let rateLimit = null;
        let terminalError = null;

        await updateRunProgress(run.id, buildRunProgress({
            run,
            domainKeys,
            results,
            phase: 'domains',
            snapshot
        }), totals);

        for (let index = 0; index < selected.length; index += 1) {
            const domain = selected[index];
            await updateRunProgress(run.id, buildRunProgress({
                run,
                domainKeys,
                results,
                currentDomainKey: domain.key,
                phase: 'domain',
                snapshot
            }), totals);

            const thresholdReached = totals.totalTokens >= settings.maxTotalTokens;
            if (thresholdReached) {
                logger.warn?.(`[StackCTRL Enterprise] Advisory token threshold reached before ${domain.name}; continuing with smaller safe evidence batches.`);
            }

            const result = await analyseDomain({ companyId, snapshot, run, domain, historicalContext, thresholdReached });
            results.push(result);
            for (const key of Object.keys(totals)) totals[key] += result.usage?.[key] || 0;

            await updateRunProgress(run.id, buildRunProgress({
                run,
                domainKeys,
                results,
                currentDomainKey: null,
                phase: 'domain',
                rateLimit: result.rateLimited ? {
                    domainKey: result.domain.key,
                    retryAfterMs: result.recommendedRetryAfterMs || Math.max(0, rateLimitCircuitOpenUntil - Date.now())
                } : null,
                snapshot
            }), totals);

            if (result.rateLimited || result.status === 'failed_rate_limited') {
                rateLimit = {
                    domainKey: result.domain.key,
                    retryAfterMs: result.recommendedRetryAfterMs || Math.max(0, rateLimitCircuitOpenUntil - Date.now())
                };
                for (let pendingIndex = index + 1; pendingIndex < selected.length; pendingIndex += 1) {
                    results.push(await storeSkippedDomain({
                        run, companyId, snapshot, domain: selected[pendingIndex],
                        status: 'skipped_rate_limited',
                        errorMessage: `Azure rate limit reached while processing ${result.domain.name}. Retry this domain after cooldown.`
                    }));
                }
                break;
            }

            if (['failed', 'failed_storage'].includes(String(result.status || ''))) {
                terminalError = {
                    domainKey: result.domain.key,
                    status: result.status,
                    errorMessage: result.errorMessage || `${result.domain.name} failed and the enterprise pipeline was stopped.`
                };
                for (let pendingIndex = index + 1; pendingIndex < selected.length; pendingIndex += 1) {
                    results.push({
                        status: 'skipped_pipeline_stop',
                        domain: selected[pendingIndex],
                        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, requestBytes: 0, responseBytes: 0, retries: 0 },
                        audit: null,
                        errorMessage: `Pipeline stopped after ${result.domain.name}: ${terminalError.errorMessage}`
                    });
                }
                break;
            }

            if (index < selected.length - 1) {
                const nextDomain = selected[index + 1];
                const delayMs = Math.max(
                    computeInterDomainDelayMs(result.usage?.inputTokens || 0, settings, domain.key),
                    computeInterDomainDelayMs(result.usage?.inputTokens || 0, settings, nextDomain?.key)
                );
                if (delayMs > 0) await wait(delayMs);
            }
        }

        await updateRunProgress(run.id, buildRunProgress({
            run,
            domainKeys,
            results,
            phase: rateLimit ? 'rate_limited' : terminalError ? 'failed' : 'domains_complete',
            rateLimit,
            snapshot
        }), totals);

        return { results, totals, rateLimited: Boolean(rateLimit), rateLimit, terminalError };
    }

    async function runEnterpriseReport({ companyId, snapshotId = null, periodType = 'daily', referenceDate = new Date(), domainKeys = null, includeSynthesis = true, deduplicationKey = null, refreshSnapshot = null, user = null } = {}) {
        const numericCompanyId = Number(companyId);
        if (!Number.isInteger(numericCompanyId) || numericCompanyId <= 0) throw new Error('A valid companyId is required');
        assertRateLimitCircuitClosed();
        const selectedKeys = Array.isArray(domainKeys) && domainKeys.length ? [...new Set(domainKeys)] : ENTERPRISE_DOMAINS.map(domain => domain.key);
        const invalid = selectedKeys.filter(key => !DOMAIN_BY_KEY[key]);
        if (invalid.length) throw new Error(`Unsupported enterprise domains: ${invalid.join(', ')}`);
        const isSingleDomainRun = selectedKeys.length === 1;
        // Enterprise analysis is read-first: use the latest stored evidence snapshot unless a caller
        // explicitly requests a refresh. This prevents a deep report from launching every live
        // collector at once and competing for Graph tokens and Secret Manager reads.
        const shouldRefreshSnapshot = refreshSnapshot === true;
        let resolvedSnapshotId = snapshotId;
        let snapshotRefresh = null;
        if (shouldRefreshSnapshot) {
            snapshotRefresh = await refreshEnterpriseSnapshot(numericCompanyId, user);
            resolvedSnapshotId = snapshotRefresh?.snapshotId || resolvedSnapshotId;
        }
        const snapshot = await loadSnapshot(numericCompanyId, resolvedSnapshotId);
        const run = await createRun({ companyId: numericCompanyId, snapshotId: snapshot.ID, periodType, referenceDate, mode: isSingleDomainRun ? DOMAIN_BY_KEY[selectedKeys[0]].mode : 'enterprise_deep_reporting', deduplicationKey });
        if (run.duplicate) return { status: 'duplicate', runId: run.id, snapshotId: snapshot.ID, periodType: run.periodType };
        try {
            const domains = await processDomains({ companyId: numericCompanyId, snapshot, run, domainKeys: selectedKeys });
            const runStatusBeforeSynthesis = rollupRunStatus(domains.results);
            const successfulDomains = domains.results.filter(result => isSuccessfulDomainStatus(result.status));
            const allDomainsStored = domains.results.length === selectedKeys.length;
            let synthesis = null;
            const canSynthesize = includeSynthesis
                && !domains.rateLimited
                && !domains.terminalError
                && allDomainsStored
                && successfulDomains.length > 0;
            if (canSynthesize) {
                await updateRunProgress(run.id, buildRunProgress({
                    run,
                    domainKeys: selectedKeys,
                    results: domains.results,
                    phase: 'synthesis',
                    synthesisStatus: 'running',
                    snapshot
                }), domains.totals);
                synthesis = await runSynthesis({
                    companyId: numericCompanyId,
                    snapshotId: snapshot.ID,
                    run,
                    existingTotals: domains.totals,
                    queuedDomainKeys: selectedKeys
                });
                await updateRunProgress(run.id, buildRunProgress({
                    run,
                    domainKeys: selectedKeys,
                    results: domains.results,
                    phase: 'complete',
                    synthesisStatus: synthesis.status,
                    snapshot
                }), domains.totals);
            } else {
                const incompleteCount = domains.results.filter(result => !isSuccessfulDomainStatus(result.status)).length;
                const errorMessage = domains.rateLimited
                    ? `Azure rate limit reached at ${domains.rateLimit?.domainKey || 'unknown domain'}. Completed domains were stored; synthesis was not run.`
                    : domains.terminalError
                        ? `Enterprise pipeline stopped at ${domains.terminalError.domainKey}: ${domains.terminalError.errorMessage}`
                    : runStatusBeforeSynthesis === 'completed'
                        ? null
                        : `${incompleteCount} domain analysis request(s) did not complete successfully.`;
                await pool.query(
                    `UPDATE StackCTRLEnterpriseReportRuns
                     SET Status = ?, CompletedAt = NOW(), TotalInputTokens = ?, TotalOutputTokens = ?, TotalTokens = ?,
                         TotalRequestBytes = ?, TotalResponseBytes = ?, RetryCount = ?, ErrorMessage = ? WHERE ID = ?`,
                    [runStatusBeforeSynthesis, domains.totals.inputTokens, domains.totals.outputTokens,
                        domains.totals.totalTokens, domains.totals.requestBytes, domains.totals.responseBytes, domains.totals.retries,
                        errorMessage, run.id]
                );
                await updateRunProgress(run.id, buildRunProgress({
                    run,
                    domainKeys: selectedKeys,
                    results: domains.results,
                    phase: domains.rateLimited ? 'rate_limited' : domains.terminalError ? 'failed' : 'domains_complete',
                    synthesisStatus: includeSynthesis ? 'skipped' : 'not_requested',
                    rateLimit: domains.rateLimit,
                    snapshot
                }), domains.totals);
            }
            const finalStatus = synthesis?.status || runStatusBeforeSynthesis;
            const domainRunSummary = buildDomainRunSummary(
                domains.results.map(result => ({
                    domainKey: result.domain.key,
                    status: result.status,
                    errorMessage: result.errorMessage || null
                })),
                selectedKeys
            );
            return {
                status: finalStatus,
                runId: run.id,
                snapshotId: snapshot.ID,
                snapshotRefresh,
                periodType: run.periodType,
                mode: run.mode,
                domains: domains.results.map(result => ({
                    domainKey: result.domain.key,
                    domainName: result.domain.name,
                    status: result.status,
                    domainIntelligenceId: result.domainIntelligenceId || null,
                    analysis: result.analysis || null,
                    errorMessage: result.errorMessage || null,
                    batchInfo: result.batchInfo || null
                })),
                domainRunSummary,
                synthesisId: synthesis?.synthesisId || null,
                synthesisStatus: synthesis?.status || (includeSynthesis ? (domains.rateLimited ? 'skipped_rate_limited' : domains.terminalError ? 'skipped_pipeline_stop' : (successfulDomains.length ? 'skipped' : 'skipped_no_successful_domains')) : 'not_requested'),
                totals: domains.totals,
                rateLimited: domains.rateLimited,
                rateLimit: domains.rateLimit,
                terminalError: domains.terminalError
            };
        } catch (error) {
            captureRateLimit(error);
            await pool.query(`UPDATE StackCTRLEnterpriseReportRuns SET Status = ?, CompletedAt = NOW(), ErrorMessage = ? WHERE ID = ?`, [error.enterpriseStatus || classifyFailureStatus(error), String(error.message).slice(0, 5000), run.id]);
            throw error;
        }
    }

    async function runEnterpriseSynthesis({ companyId, runId }) {
        assertRateLimitCircuitClosed();
        const [rows] = await pool.query(`SELECT * FROM StackCTRLEnterpriseReportRuns WHERE ID = ? AND CompanyID = ? LIMIT 1`, [Number(runId), Number(companyId)]);
        if (!rows.length) throw new Error('Enterprise run not found');
        const row = rows[0];
        const run = { id: row.ID, periodType: row.PeriodType, periodStart: row.PeriodStart, periodEnd: row.PeriodEnd, mode: row.Mode };
        const progress = parseJson(row.ProgressJson, {});
        const queuedDomainKeys = array(progress.domainQueue).map(item => item.domainKey).filter(Boolean);
        try {
            return await runSynthesis({
                companyId: Number(companyId),
                snapshotId: row.SnapshotID,
                run,
                queuedDomainKeys: queuedDomainKeys.length ? queuedDomainKeys : null
            });
        } catch (error) {
            captureRateLimit(error);
            throw error;
        }
    }

    async function runRollupReport({ companyId, periodType, referenceDate = new Date(), deduplicationKey = null }) {
        if (!LOWER_PERIOD[periodType]) throw new Error('Rollup period must be weekly, monthly, or yearly');
        assertRateLimitCircuitClosed();
        const latestSnapshot = await loadSnapshot(companyId, null);
        const run = await createRun({ companyId: Number(companyId), snapshotId: latestSnapshot.ID, periodType, referenceDate, mode: `enterprise_${periodType}_synthesis`, deduplicationKey });
        if (run.duplicate) return { status: 'duplicate', runId: run.id, periodType };
        try {
            const synthesis = await runSynthesis({ companyId: Number(companyId), snapshotId: latestSnapshot.ID, run });
            return { status: synthesis.status, runId: run.id, synthesisId: synthesis.synthesisId, periodType };
        } catch (error) {
            captureRateLimit(error);
            await pool.query(`UPDATE StackCTRLEnterpriseReportRuns SET Status = ?, CompletedAt = NOW(), ErrorMessage = ? WHERE ID = ?`, [error.enterpriseStatus || classifyFailureStatus(error), String(error.message).slice(0, 5000), run.id]);
            throw error;
        }
    }

    function isLastBusinessDay(local, unit) {
        let next = local.plus({ days: 1 });
        while (next.weekday > 5) next = next.plus({ days: 1 });
        return unit === 'month' ? next.month !== local.month : next.year !== local.year;
    }

    async function runScheduledTick({ now = new Date(), companyId = null } = {}) {
        const local = DateTime.fromJSDate(now instanceof Date ? now : new Date(now), { zone: 'utc' }).setZone('Africa/Johannesburg');
        if (local.weekday > 5 || local.hour !== 18 || local.minute < 15 || local.minute >= 30) return { status: 'not_due', localTime: local.toISO() };
        let companyIds = companyId ? [Number(companyId)] : [];
        if (!companyIds.length) {
            const [rows] = await pool.query(`SELECT DISTINCT CompanyID FROM StackCTRLClientCapabilities WHERE ProfileKey = 'sunbird' AND IsEnabled = 1`);
            companyIds = rows.map(row => Number(row.CompanyID)).filter(Boolean);
        }
        const results = [];
        for (const id of companyIds) {
            try {
                const scheduleDate = local.toFormat('yyyyLLdd');
                const daily = await runEnterpriseReport({ companyId: id, periodType: 'daily', referenceDate: now, deduplicationKey: `${id}:enterprise:daily:${scheduleDate}` });
                const companyRuns = [{ periodType: 'daily', status: 'completed', ...daily }];
                if (daily.rateLimited) {
                    results.push({ companyId: id, runs: companyRuns });
                    break;
                }
                if (local.weekday === 5) companyRuns.push({ periodType: 'weekly', status: 'completed', ...(await runRollupReport({ companyId: id, periodType: 'weekly', referenceDate: now, deduplicationKey: `${id}:enterprise:weekly:${local.weekNumber}:${local.weekYear}` })) });
                if (isLastBusinessDay(local, 'month')) companyRuns.push({ periodType: 'monthly', status: 'completed', ...(await runRollupReport({ companyId: id, periodType: 'monthly', referenceDate: now, deduplicationKey: `${id}:enterprise:monthly:${local.toFormat('yyyyLL')}` })) });
                if (isLastBusinessDay(local, 'year')) companyRuns.push({ periodType: 'yearly', status: 'completed', ...(await runRollupReport({ companyId: id, periodType: 'yearly', referenceDate: now, deduplicationKey: `${id}:enterprise:yearly:${local.year}` })) });
                results.push({ companyId: id, runs: companyRuns });
            } catch (error) {
                logger.error(`[StackCTRL Enterprise] Scheduled reporting failed for company ${id}:`, error.message);
                results.push({ companyId: id, runs: [{ status: 'failed', message: error.message }] });
            }
        }
        return { status: 'completed', localTime: local.toISO(), companies: results };
    }

    async function getAdminData(companyId, runId = null) {
        const params = [Number(companyId)];
        const runFilter = runId ? ' AND RunID = ?' : '';
        if (runId) params.push(Number(runId));
        const [[runs], [domains], [audits], [synthesis], [items], [batches]] = await Promise.all([
            pool.query(`SELECT * FROM StackCTRLEnterpriseReportRuns WHERE CompanyID = ? ORDER BY ID DESC LIMIT 50`, [Number(companyId)]),
            pool.query(`SELECT * FROM StackCTRLTenantDomainIntelligence WHERE CompanyID = ?${runFilter}
                        ORDER BY RunID DESC,
                         CASE
                           WHEN Status IN ('failed', 'failed_invalid_json', 'failed_storage', 'failed_rate_limited', 'failed_source_mismatch') THEN 0
                           WHEN Status IN ('partial', 'completed_with_warnings') THEN 1
                           WHEN Status IN ('running', 'queued') THEN 2
                           WHEN Status = 'completed' THEN 3
                           ELSE 4
                         END,
                         ID DESC LIMIT 200`, params),
            pool.query(`SELECT * FROM StackCTRLIntelligenceEvidenceAudit WHERE CompanyID = ?${runFilter}
                        ORDER BY RunID DESC,
                         CASE
                           WHEN Status IN ('failed', 'failed_invalid_json', 'failed_storage', 'failed_rate_limited', 'failed_source_mismatch') THEN 0
                           WHEN Status IN ('partial', 'completed_with_warnings') THEN 1
                           WHEN Status IN ('running', 'queued') THEN 2
                           WHEN Status = 'completed' THEN 3
                           ELSE 4
                         END,
                         ID DESC LIMIT 200`, params),
            pool.query(`SELECT * FROM StackCTRLEnterpriseSynthesis WHERE CompanyID = ?${runFilter} ORDER BY ID DESC LIMIT 50`, params),
            pool.query(`SELECT * FROM StackCTRLEnterpriseIntelligenceItems WHERE CompanyID = ?${runFilter} ORDER BY ID DESC LIMIT 500`, params),
            pool.query(`SELECT * FROM StackCTRLTenantDomainIntelligenceBatches WHERE CompanyID = ?${runFilter}
                        ORDER BY RunID DESC, DomainKey ASC, BatchNumber ASC LIMIT 1000`, params)
        ]);
        return {
            settings: { ...settings },
            domains: ENTERPRISE_DOMAINS.map(domain => ({ key: domain.key, name: domain.name, mode: domain.mode })),
            runs: runs.map(row => ({ ...row, ProgressJson: parseJson(row.ProgressJson, {}) })),
            domainIntelligence: domains.map(row => ({ ...row, AnalysisJson: parseJson(row.AnalysisJson, {}) })),
            evidenceAudit: audits.map(row => ({
                ...row,
                AzureInputSummaryJson: parseJson(row.AzureInputSummaryJson, {}),
                OmittedSummaryJson: parseJson(row.OmittedSummaryJson, {})
            })),
            synthesis: synthesis.map(row => ({
                ...row,
                ExecutiveSummaryJson: parseJson(row.ExecutiveSummaryJson, {}),
                BoardReportJson: parseJson(row.BoardReportJson, {}),
                ManagementReportJson: parseJson(row.ManagementReportJson, {}),
                RiskRegisterJson: parseJson(row.RiskRegisterJson, []),
                RecommendationsJson: parseJson(row.RecommendationsJson, []),
                TrendAnalysisJson: parseJson(row.TrendAnalysisJson, []),
                ComplianceReviewJson: parseJson(row.ComplianceReviewJson, {}),
                GovernanceReviewJson: parseJson(row.GovernanceReviewJson, {}),
                DomainScorecardJson: parseJson(row.DomainScorecardJson, []),
                MaturityAssessmentJson: parseJson(row.MaturityAssessmentJson, {}),
                TopDecisionsRequiredJson: parseJson(row.TopDecisionsRequiredJson, []),
                Next30DaysPlanJson: parseJson(row.Next30DaysPlanJson, []),
                Next90DaysPlanJson: parseJson(row.Next90DaysPlanJson, []),
                EvidenceJustificationJson: parseJson(row.EvidenceJustificationJson, {}),
                LimitationsJson: parseJson(row.LimitationsJson, []),
                PowerBISummaryJson: parseJson(row.PowerBISummaryJson, {})
            })),
            items,
            batches: batches.map(row => ({
                ...row,
                BatchSummaryJson: parseJson(row.BatchSummaryJson, {}),
                FindingsJson: parseJson(row.FindingsJson, []),
                RisksJson: parseJson(row.RisksJson, []),
                RecommendationsJson: parseJson(row.RecommendationsJson, []),
                TrendsJson: parseJson(row.TrendsJson, []),
                MissingDataWarningsJson: parseJson(row.MissingDataWarningsJson, [])
            }))
        };
    }

    async function getAdminProgress(companyId, runId = null) {
        const numericCompanyId = Number(companyId);
        const params = [numericCompanyId];
        const runFilter = runId ? ' AND RunID = ?' : '';
        if (runId) params.push(Number(runId));
        const [[runs], [domains], [audits], [synthesis], [batches]] = await Promise.all([
            pool.query(`SELECT ID, CompanyID, SnapshotID, PeriodType, PeriodStart, PeriodEnd, Status, Mode,
                               StartedAt, CompletedAt, TotalInputTokens, TotalOutputTokens, TotalTokens,
                               TotalRequestBytes, TotalResponseBytes, RetryCount, ErrorMessage, ProgressJson
                        FROM StackCTRLEnterpriseReportRuns WHERE CompanyID = ? ORDER BY ID DESC LIMIT 50`, [numericCompanyId]),
            pool.query(`SELECT ID, CompanyID, SnapshotID, RunID, DomainKey, DomainName, PeriodType, PeriodStart,
                               PeriodEnd, HealthScore, RiskScore, RiskLevel, InputSizeBytes, ResponseSizeBytes,
                               InputTokens, OutputTokens, TotalTokens, RetryCount, Status, ErrorMessage,
                               MissingDataWarningsJson, CreatedAt
                        FROM StackCTRLTenantDomainIntelligence WHERE CompanyID = ?${runFilter}
                        ORDER BY RunID DESC, ID DESC LIMIT 200`, params),
            pool.query(`SELECT ID, CompanyID, SnapshotID, RunID, DomainKey, StackCTRLDataCount, SentToAzureCount,
                               OmittedCount, MetricsIncludedCount, EvidenceIncludedCount, EvidenceOmittedCount,
                               HistoricalComparisonsIncluded, RisksReturnedCount, RecommendationsReturnedCount,
                               TrendsReturnedCount, InputSizeBytes, OutputSizeBytes, InputTokens, OutputTokens,
                               RetryCount, Status, CreatedAt
                        FROM StackCTRLIntelligenceEvidenceAudit WHERE CompanyID = ?${runFilter}
                        ORDER BY RunID DESC, ID DESC LIMIT 200`, params),
            pool.query(`SELECT ID, CompanyID, SnapshotID, RunID, PeriodType, PeriodStart, PeriodEnd, Status,
                               InputSizeBytes, ResponseSizeBytes, InputTokens, OutputTokens, TotalTokens,
                               RetryCount, CreatedAt
                        FROM StackCTRLEnterpriseSynthesis WHERE CompanyID = ?${runFilter} ORDER BY ID DESC LIMIT 50`, params),
            pool.query(`SELECT CompanyID, SnapshotID, RunID, DomainKey, MAX(DomainName) AS DomainName,
                               MAX(BatchCount) AS BatchCount, MAX(BatchNumber) AS BatchNumber,
                               SUM(Status IN ('completed', 'completed_with_warnings')) AS CompletedBatches,
                               SUM(Status NOT IN ('completed', 'completed_with_warnings')) AS FailedBatches,
                               CASE
                                   WHEN SUM(Status NOT IN ('completed', 'completed_with_warnings')) > 0
                                       AND SUM(Status IN ('completed', 'completed_with_warnings')) > 0 THEN 'partial'
                                   WHEN SUM(Status NOT IN ('completed', 'completed_with_warnings')) > 0 THEN 'failed'
                                   WHEN SUM(Status = 'completed_with_warnings') > 0 THEN 'completed_with_warnings'
                                   ELSE 'completed'
                               END AS Status,
                               SUM(BatchItemCount) AS BatchItemCount, SUM(SentToAzureCount) AS SentToAzureCount,
                               SUM(OmittedFromThisBatch) AS OmittedFromThisBatch,
                               MIN(RemainingAfterBatch) AS RemainingAfterBatch,
                               SUM(InputTokens) AS InputTokens, SUM(OutputTokens) AS OutputTokens,
                               SUM(TotalTokens) AS TotalTokens, SUM(RetryCount) AS RetryCount,
                               MAX(Status = 'completed_with_warnings' OR AzureFinishReason = 'length') AS JsonRecoveryWarning,
                               MAX(CASE WHEN Status NOT IN ('completed', 'completed_with_warnings') THEN ErrorMessage END) AS ErrorMessage,
                               MAX(CASE WHEN Status NOT IN ('completed', 'completed_with_warnings') THEN FailureReason END) AS FailureReason
                        FROM StackCTRLTenantDomainIntelligenceBatches WHERE CompanyID = ?${runFilter}
                        GROUP BY CompanyID, SnapshotID, RunID, DomainKey ORDER BY RunID DESC, DomainKey LIMIT 200`, params)
        ]);
        if (runs[0] && ['running', 'queued'].includes(String(runs[0].Status || ''))) {
            const progress = parseJson(runs[0].ProgressJson, {});
            const lastProgressAt = new Date(progress.updatedAt || runs[0].StartedAt || 0).getTime();
            if (lastProgressAt && Date.now() - lastProgressAt > settings.terminalStaleMs) {
                const stuckStage = progress.currentStage || progress.phase || progress.currentDomainKey || 'unknown_stage';
                const lastSuccessfulStage = progress.lastSuccessfulStage || 'unknown';
                const reason = `No enterprise progress for ${Math.ceil((Date.now() - lastProgressAt) / 60000)} minute(s). Stuck stage: ${stuckStage}. Last successful stage: ${lastSuccessfulStage}.`;
                await pool.query(
                    `UPDATE StackCTRLEnterpriseReportRuns SET Status = 'failed_terminal', CompletedAt = NOW(), ErrorMessage = ?,
                     ProgressJson = JSON_SET(COALESCE(ProgressJson, JSON_OBJECT()), '$.phase', 'failed_terminal', '$.stageFailureReason', ?, '$.updatedAt', ?)
                     WHERE ID = ? AND Status IN ('running', 'queued')`,
                    [reason, reason, new Date().toISOString(), runs[0].ID]
                );
                runs[0].Status = 'failed_terminal';
                runs[0].ErrorMessage = reason;
                runs[0].ProgressJson = { ...progress, phase: 'failed_terminal', stageFailureReason: reason, updatedAt: new Date().toISOString() };
            }
        }
        const classifyWarning = warning => {
            const text = String(warning || '');
            if (/permission|forbidden|unauthori[sz]ed|403/i.test(text)) return 'missing_api_permissions';
            if (/cloudflare.*field|missing.*field|unknown control/i.test(text)) return 'missing_cloudflare_fields';
            if (/stale|source_too_old|refresh.*source/i.test(text)) return 'stale_source';
            if (/recovered|closing json|truncated json|invalid json|json parse|azure_invalid_json/i.test(text)) return 'azure_recovered_json';
            if (/partial|omitted|incomplete/i.test(text)) return 'partial_evidence';
            if (/optional|unavailable|not configured/i.test(text)) return 'optional_source_unavailable';
            return 'other_warning';
        };
        const normalizedRuns = runs.map(row => ({ ...row, ProgressJson: parseJson(row.ProgressJson, {}) }));
        const lightweightDomains = domains.map(row => {
            const warningReasons = array(parseJson(row.MissingDataWarningsJson, [])).map(String);
            return {
                ...row,
                WarningReasons: warningReasons,
                WarningCategories: [...new Set(warningReasons.map(classifyWarning))]
            };
        });
        const latestRun = normalizedRuns[0] || null;
        const latestRunId = latestRun?.ID == null ? null : Number(latestRun.ID);
        let latestDomains = latestRunId ? lightweightDomains.filter(row => Number(row.RunID) === latestRunId) : [];
        const progress = latestRun?.ProgressJson || {};
        const lastProgressAt = new Date(progress.updatedAt || latestRun?.StartedAt || 0).getTime();
        if (latestRunId && lastProgressAt && Date.now() - lastProgressAt > settings.terminalStaleMs) {
            for (const row of latestDomains) {
                if (String(row.Status || '') !== 'running') continue;
                const reason = `Domain ${row.DomainKey} remained RUNNING for ${Math.ceil((Date.now() - lastProgressAt) / 60000)} minute(s) without progress. Marked failed_terminal.`;
                await pool.query(
                    `UPDATE StackCTRLTenantDomainIntelligence
                     SET Status = 'failed_terminal', ErrorMessage = ?
                     WHERE ID = ? AND Status = 'running'`,
                    [reason, row.ID]
                );
                row.Status = 'failed_terminal';
                row.ErrorMessage = reason;
            }
        }
        const latestAudits = latestRunId ? audits.filter(row => Number(row.RunID) === latestRunId) : [];
        const latestBatches = latestRunId ? batches.filter(row => Number(row.RunID) === latestRunId) : [];
        const domainRunAudits = latestAudits.map(row => ({
            domainKey: row.DomainKey,
            companyId: numericCompanyId,
            snapshotId: row.SnapshotID,
            collectionStatus: null,
            sourceFreshness: null,
            stackctrlRecordCount: row.StackCTRLDataCount,
            preparedRecordCount: row.EvidenceIncludedCount,
            analysedRecordCount: row.SentToAzureCount,
            omittedRecordCount: Number(row.OmittedCount || 0) + Number(row.EvidenceOmittedCount || 0),
            omittedReasons: [],
            batchCount: latestBatches.find(batch => batch.DomainKey === row.DomainKey)?.BatchCount || null,
            currentBatch: progress.currentDomainKey === row.DomainKey ? (progress.currentBatch || null) : null,
            azureAttemptCount: Number(row.RetryCount || 0) + 1,
            azureStatus: row.Status,
            storageStatus: row.Status,
            finalDomainStatus: row.Status,
            warningReasons: [],
            failureReason: null
        }));
        return {
            payloadType: 'enterprise_progress_only',
            companyId: numericCompanyId,
            settings: {
                domainDelayMs: settings.domainDelayMs,
                maxTotalTokens: settings.maxTotalTokens,
                maxItemsPerBatch: settings.maxItemsPerBatch,
                heavyDomainMaxItemsPerBatch: settings.heavyDomainMaxItemsPerBatch
            },
            domains: ENTERPRISE_DOMAINS.map(domain => ({ key: domain.key, name: domain.name, mode: domain.mode })),
            runs: normalizedRuns,
            domainIntelligence: lightweightDomains,
            evidenceAudit: audits,
            domainRunAudits,
            synthesis,
            batches,
            progressSummary: latestRun ? {
                runId: latestRunId,
                snapshotId: latestRun.SnapshotID == null ? null : Number(latestRun.SnapshotID),
                companyId: numericCompanyId,
                currentDomain: progress.currentDomainKey || null,
                currentStage: progress.currentStage || progress.phase || null,
                lastSuccessfulStage: progress.lastSuccessfulStage || null,
                stuckReason: progress.stageFailureReason || latestRun.ErrorMessage || null,
                domainStatuses: latestDomains.map(row => ({ domainKey: row.DomainKey, status: row.Status, errorMessage: row.ErrorMessage || null })),
                counts: progress.counts || {},
                recordsPrepared: latestAudits.reduce((total, row) => total + Number(row.EvidenceIncludedCount || 0), 0),
                recordsSent: latestAudits.reduce((total, row) => total + Number(row.SentToAzureCount || 0), 0),
                recordsOmitted: latestAudits.reduce((total, row) => total + Number(row.OmittedCount || 0) + Number(row.EvidenceOmittedCount || 0), 0),
                batchCount: latestBatches.reduce((total, row) => total + Number(row.BatchCount || 0), 0),
                currentDomainBatchCount: progress.batchCount || latestBatches.find(row => row.DomainKey === progress.currentDomainKey)?.BatchCount || null,
                currentBatch: progress.currentBatch || latestBatches.find(row => row.DomainKey === progress.currentDomainKey)?.BatchNumber || null,
                tokenSummary: {
                    inputTokens: Number(latestRun.TotalInputTokens || 0), outputTokens: Number(latestRun.TotalOutputTokens || 0),
                    totalTokens: Number(latestRun.TotalTokens || 0), retryCount: Number(latestRun.RetryCount || 0)
                },
                evidenceCountSummary: latestAudits.map(row => ({
                    domainKey: row.DomainKey, recordsPrepared: Number(row.EvidenceIncludedCount || 0),
                    recordsSent: Number(row.SentToAzureCount || 0),
                    recordsOmitted: Number(row.OmittedCount || 0) + Number(row.EvidenceOmittedCount || 0)
                })),
                domainRunAudits,
                jsonRecoveryWarning: latestBatches.some(row => Boolean(Number(row.JsonRecoveryWarning))),
                finalSynthesisReady: synthesis.some(row => Number(row.RunID) === latestRunId && ['completed', 'completed_with_warnings'].includes(row.Status))
            } : null
        };
    }

    async function latestRunIdForCompany(companyId, requestedRunId = null) {
        if (requestedRunId) return Number(requestedRunId);
        const [rows] = await pool.query('SELECT ID FROM StackCTRLEnterpriseReportRuns WHERE CompanyID = ? ORDER BY ID DESC LIMIT 1', [Number(companyId)]);
        if (!rows[0]) { const error = new Error('Enterprise intelligence run not found'); error.statusCode = 404; throw error; }
        return Number(rows[0].ID);
    }

    async function getAdminDomainDetail(companyId, domainKey, runId = null) {
        if (!DOMAIN_BY_KEY[domainKey]) { const error = new Error(`Unsupported enterprise domain: ${domainKey}`); error.statusCode = 400; throw error; }
        const resolvedRunId = await latestRunIdForCompany(companyId, runId);
        const [rows] = await pool.query('SELECT * FROM StackCTRLTenantDomainIntelligence WHERE CompanyID = ? AND RunID = ? AND DomainKey = ? ORDER BY ID DESC LIMIT 1', [Number(companyId), resolvedRunId, domainKey]);
        if (!rows[0]) { const error = new Error('Domain intelligence detail not found'); error.statusCode = 404; throw error; }
        return { ...rows[0], AnalysisJson: parseJson(rows[0].AnalysisJson, {}) };
    }

    async function getAdminAuditDetail(companyId, domainKey, runId = null) {
        const resolvedRunId = await latestRunIdForCompany(companyId, runId);
        const [rows] = await pool.query('SELECT * FROM StackCTRLIntelligenceEvidenceAudit WHERE CompanyID = ? AND RunID = ? AND DomainKey = ? ORDER BY ID DESC LIMIT 1', [Number(companyId), resolvedRunId, domainKey]);
        if (!rows[0]) { const error = new Error('Enterprise evidence audit detail not found'); error.statusCode = 404; throw error; }
        return {
            ...rows[0],
            AzureInputSummaryJson: parseJson(rows[0].AzureInputSummaryJson, {}),
            OmittedSummaryJson: parseJson(rows[0].OmittedSummaryJson, {}),
            domainRunAudit: parseJson(rows[0].AzureInputSummaryJson, {}).domainRunAudit || null
        };
    }

    async function getAdminBatchDetails(companyId, domainKey, runId = null) {
        const resolvedRunId = await latestRunIdForCompany(companyId, runId);
        const [rows] = await pool.query('SELECT * FROM StackCTRLTenantDomainIntelligenceBatches WHERE CompanyID = ? AND RunID = ? AND DomainKey = ? ORDER BY BatchNumber', [Number(companyId), resolvedRunId, domainKey]);
        return rows.map(row => ({
            ...row, BatchSummaryJson: parseJson(row.BatchSummaryJson, {}), FindingsJson: parseJson(row.FindingsJson, []),
            RisksJson: parseJson(row.RisksJson, []), RecommendationsJson: parseJson(row.RecommendationsJson, []),
            TrendsJson: parseJson(row.TrendsJson, []), MissingDataWarningsJson: parseJson(row.MissingDataWarningsJson, [])
        }));
    }

    async function getAdminSynthesisDetail(companyId, runId = null) {
        const resolvedRunId = await latestRunIdForCompany(companyId, runId);
        const [rows] = await pool.query('SELECT * FROM StackCTRLEnterpriseSynthesis WHERE CompanyID = ? AND RunID = ? ORDER BY ID DESC LIMIT 1', [Number(companyId), resolvedRunId]);
        if (!rows[0]) { const error = new Error('Enterprise synthesis detail not found'); error.statusCode = 404; throw error; }
        return powerBISynthesisRow(rows[0]);
    }

    function powerBIDomainRow(row) {
        const intelligenceOutput = parseJson(row.AnalysisJson, null);
        return {
            companyId: Number(row.CompanyID),
            snapshotId: row.SnapshotID == null ? null : Number(row.SnapshotID),
            runId: Number(row.RunID),
            domainKey: row.DomainKey,
            domainName: row.DomainName,
            periodType: row.PeriodType,
            periodStart: row.PeriodStart,
            periodEnd: row.PeriodEnd,
            createdAt: row.CreatedAt,
            status: row.Status,
            tokenUsage: {
                estimatedInputTokens: Math.ceil(Number(row.InputSizeBytes || 0) / 4),
                inputTokens: Number(row.InputTokens || 0),
                outputTokens: Number(row.OutputTokens || 0),
                totalTokens: Number(row.TotalTokens || 0),
                retryCount: Number(row.RetryCount || 0)
            },
            batchInfo: intelligenceOutput?.batchInfo || null,
            evidenceLimitations: intelligenceOutput?.evidenceLimitations || null,
            errorMessage: row.ErrorMessage || null,
            intelligenceOutput
        };
    }

    function powerBISynthesisRow(row) {
        if (!row) return null;
        const synthesisOutput = {
            enterpriseExecutiveSummary: parseJson(row.ExecutiveSummaryJson, {}),
            boardReport: parseJson(row.BoardReportJson, {}),
            managementReport: parseJson(row.ManagementReportJson, {}),
            riskRegister: parseJson(row.RiskRegisterJson, []),
            recommendations: parseJson(row.RecommendationsJson, []),
            trendAnalysis: parseJson(row.TrendAnalysisJson, []),
            complianceReview: parseJson(row.ComplianceReviewJson, {}),
            governanceReview: parseJson(row.GovernanceReviewJson, {}),
            domainScorecard: parseJson(row.DomainScorecardJson, []),
            maturityAssessment: parseJson(row.MaturityAssessmentJson, {}),
            businessImpactSummary: row.BusinessImpactSummary || null,
            topDecisionsRequired: parseJson(row.TopDecisionsRequiredJson, []),
            next30DaysPlan: parseJson(row.Next30DaysPlanJson, []),
            next90DaysPlan: parseJson(row.Next90DaysPlanJson, []),
            evidenceJustificationSummary: parseJson(row.EvidenceJustificationJson, {}),
            limitationsAndAssumptions: parseJson(row.LimitationsJson, []),
            powerBiSummary: parseJson(row.PowerBISummaryJson, {})
        };
        return {
            companyId: Number(row.CompanyID), snapshotId: row.SnapshotID == null ? null : Number(row.SnapshotID),
            runId: Number(row.RunID), synthesisId: Number(row.ID), periodType: row.PeriodType,
            periodStart: row.PeriodStart, periodEnd: row.PeriodEnd, createdAt: row.CreatedAt,
            status: row.Status,
            tokenUsage: {
                estimatedInputTokens: Math.ceil(Number(row.InputSizeBytes || 0) / 4),
                inputTokens: Number(row.InputTokens || 0), outputTokens: Number(row.OutputTokens || 0),
                totalTokens: Number(row.TotalTokens || 0), retryCount: Number(row.RetryCount || 0)
            },
            synthesisOutput
        };
    }

    function powerBIAuditRow(row) {
        return {
            ...row,
            AzureInputSummaryJson: parseJson(row.AzureInputSummaryJson, {}),
            OmittedSummaryJson: parseJson(row.OmittedSummaryJson, {})
        };
    }

    function flattenPowerBITables({ domains = [], finalSynthesis = null, audits = [], runs = [] } = {}) {
        const DomainScorecardRows = array(finalSynthesis?.synthesisOutput?.domainScorecard);
        const flattenControls = (value, category = null) => {
            if (Array.isArray(value)) return value.flatMap(item => flattenControls(item, category));
            if (!value || typeof value !== 'object') return [];
            if (value.title || value.name || value.control || value.description || value.detail) return [{ category, ...value }];
            return Object.entries(value).flatMap(([key, nested]) => flattenControls(nested, category ? `${category}.${key}` : key));
        };
        const sectionRows = (section, outputKey) => domains.flatMap(domain => array(domain.intelligenceOutput?.[section]).map((item, index) => ({
            companyId: domain.companyId, snapshotId: domain.snapshotId, runId: domain.runId,
            periodType: domain.periodType, periodStart: domain.periodStart, periodEnd: domain.periodEnd,
            domainKey: domain.domainKey, domainName: domain.domainName, rowNumber: index + 1,
            [outputKey]: item
        })));
        const RiskRegisterRows = sectionRows('risks', 'risk');
        const RecommendationRows = sectionRows('recommendations', 'recommendation');
        const ControlAssessmentRows = domains.flatMap(domain => {
            const assessment = domain.intelligenceOutput?.controlAssessment;
            const rows = flattenControls(assessment);
            return rows.map((control, index) => ({ companyId: domain.companyId, snapshotId: domain.snapshotId, runId: domain.runId, domainKey: domain.domainKey, rowNumber: index + 1, control }));
        });
        const TrendRows = sectionRows('trendAnalysis', 'trend');
        const evidenceBearingRows = [
            ...sectionRows('keyFindings', 'item'), ...sectionRows('risks', 'item'),
            ...sectionRows('recommendations', 'item'), ...sectionRows('managementActions', 'item'),
            ...sectionRows('trendAnalysis', 'item')
        ];
        const AffectedEntityRows = evidenceBearingRows.flatMap(row => array(row.item?.affectedEntities).map((affectedEntity, index) => ({
            companyId: row.companyId, snapshotId: row.snapshotId, runId: row.runId, domainKey: row.domainKey,
            sourceMetric: row.item?.sourceMetric || null, itemTitle: row.item?.title || row.item?.metricName || null,
            rowNumber: index + 1, affectedEntity
        })));
        const EvidenceRows = evidenceBearingRows.flatMap(row => array(row.item?.evidenceRows).map((evidenceRow, index) => ({
            companyId: row.companyId, snapshotId: row.snapshotId, runId: row.runId, domainKey: row.domainKey,
            sourceMetric: row.item?.sourceMetric || null, evidenceSource: row.item?.evidenceSource || null,
            itemTitle: row.item?.title || row.item?.metricName || null, rowNumber: index + 1, evidenceRow
        })));
        const TokenUsageRows = domains.map(domain => ({ companyId: domain.companyId, snapshotId: domain.snapshotId, runId: domain.runId, domainKey: domain.domainKey, ...domain.tokenUsage }));
        return {
            DomainScorecardRows, RiskRegisterRows, RecommendationRows, AffectedEntityRows, EvidenceRows,
            ControlAssessmentRows, TrendRows, AuditCompletenessRows: audits.map(powerBIAuditRow),
            TokenUsageRows, RunHistoryRows: runs
        };
    }

    async function getPowerBIIntelligenceRun(companyId, runId = null, { periodType = null } = {}) {
        const numericCompanyId = Number(companyId);
        const params = [numericCompanyId];
        let where = 'runs.CompanyID = ?';
        if (runId) {
            where += ' AND runs.ID = ?';
            params.push(Number(runId));
        } else {
            where += ` AND runs.Status IN ('completed', 'completed_with_warnings')
                       AND EXISTS (
                           SELECT 1 FROM StackCTRLEnterpriseSynthesis completedSynthesis
                           WHERE completedSynthesis.RunID = runs.ID
                             AND completedSynthesis.Status IN ('completed', 'completed_with_warnings')
                       )
                       AND (
                           SELECT COUNT(DISTINCT completedDomain.DomainKey)
                           FROM StackCTRLTenantDomainIntelligence completedDomain
                           WHERE completedDomain.RunID = runs.ID
                             AND completedDomain.Status IN ('completed', 'completed_with_warnings', 'partial')
                       ) >= ?`;
            params.push(ENTERPRISE_DOMAINS.length);
        }
        if (periodType) { where += ' AND runs.PeriodType = ?'; params.push(String(periodType)); }
        const [runRows] = await pool.query(`SELECT runs.* FROM StackCTRLEnterpriseReportRuns runs WHERE ${where} ORDER BY runs.ID DESC LIMIT 1`, params);
        const run = runRows[0];
        if (!run) {
            const error = new Error('Enterprise intelligence run not found');
            error.statusCode = 404;
            throw error;
        }
        const [[domainRows], [synthesisRows], [auditRows]] = await Promise.all([
            pool.query('SELECT * FROM StackCTRLTenantDomainIntelligence WHERE CompanyID = ? AND RunID = ? ORDER BY ID', [numericCompanyId, run.ID]),
            pool.query('SELECT * FROM StackCTRLEnterpriseSynthesis WHERE CompanyID = ? AND RunID = ? ORDER BY ID DESC LIMIT 1', [numericCompanyId, run.ID]),
            pool.query('SELECT * FROM StackCTRLIntelligenceEvidenceAudit WHERE CompanyID = ? AND RunID = ? ORDER BY DomainKey', [numericCompanyId, run.ID])
        ]);
        const domains = domainRows.map(powerBIDomainRow);
        const finalSynthesis = powerBISynthesisRow(synthesisRows[0]);
        const audits = auditRows.map(powerBIAuditRow);
        return {
            dataClassification: 'intelligent_azure_output',
            companyId: numericCompanyId,
            latestSnapshotId: run.SnapshotID == null ? null : Number(run.SnapshotID),
            latestRunId: Number(run.ID),
            periodType: run.PeriodType, periodStart: run.PeriodStart, periodEnd: run.PeriodEnd,
            createdAt: run.CreatedAt || run.StartedAt,
            domains,
            finalSynthesis,
            completeness: {
                expectedDomains: ENTERPRISE_DOMAINS.length,
                returnedDomains: domains.length,
                successfulDomains: domains.filter(domain => isSuccessfulDomainStatus(domain.status)).length,
                recordsSent: audits.reduce((total, audit) => total + Number(audit.SentToAzureCount || 0), 0),
                recordsOmitted: audits.reduce((total, audit) => total + Number(audit.OmittedCount || 0) + Number(audit.EvidenceOmittedCount || 0), 0),
                audits
            },
            tables: flattenPowerBITables({ domains, finalSynthesis, audits, runs: [run] })
        };
    }

    async function getPowerBIDomain(companyId, domainKey, { runId = null, periodType = null } = {}) {
        if (!DOMAIN_BY_KEY[domainKey]) {
            const error = new Error(`Unsupported enterprise domain: ${domainKey}`);
            error.statusCode = 400;
            throw error;
        }
        const params = [Number(companyId), domainKey];
        let where = 'CompanyID = ? AND DomainKey = ?';
        if (runId) { where += ' AND RunID = ?'; params.push(Number(runId)); }
        else where += ` AND Status IN ('completed', 'completed_with_warnings', 'partial')`;
        if (periodType) { where += ' AND PeriodType = ?'; params.push(String(periodType)); }
        const [rows] = await pool.query(`SELECT * FROM StackCTRLTenantDomainIntelligence WHERE ${where} ORDER BY ID DESC LIMIT 1`, params);
        if (!rows[0]) { const error = new Error('Domain intelligence output not found'); error.statusCode = 404; throw error; }
        return { dataClassification: 'intelligent_azure_output', domain: powerBIDomainRow(rows[0]) };
    }

    async function getPowerBIFinal(companyId, runId = null, { periodType = null } = {}) {
        const params = [Number(companyId)];
        let where = 'CompanyID = ?';
        if (runId) { where += ' AND RunID = ?'; params.push(Number(runId)); }
        else where += ` AND Status IN ('completed', 'completed_with_warnings')`;
        if (periodType) { where += ' AND PeriodType = ?'; params.push(String(periodType)); }
        const [rows] = await pool.query(`SELECT * FROM StackCTRLEnterpriseSynthesis WHERE ${where} ORDER BY ID DESC LIMIT 1`, params);
        if (!rows[0]) { const error = new Error('Enterprise synthesis output not found'); error.statusCode = 404; throw error; }
        return { dataClassification: 'intelligent_azure_output', finalSynthesis: powerBISynthesisRow(rows[0]) };
    }

    async function getPowerBIRaw(companyId, domainKey = null) {
        if (domainKey && !DOMAIN_BY_KEY[domainKey]) { const error = new Error(`Unsupported enterprise domain: ${domainKey}`); error.statusCode = 400; throw error; }
        const [rows] = await pool.query('SELECT * FROM StackCTRLTenantEvidenceSnapshots WHERE CompanyID = ? ORDER BY ID DESC LIMIT 1', [Number(companyId)]);
        const snapshot = rows[0];
        if (!snapshot) { const error = new Error('StackCTRL evidence snapshot not found'); error.statusCode = 404; throw error; }
        const context = parseJson(snapshot.ContextJson, {});
        const sources = array(context.sources);
        const selectedSources = domainKey ? sources.filter(source => source.sourceKey === DOMAIN_BY_KEY[domainKey].sourceKey) : sources;
        return {
            dataClassification: 'raw_non_intelligent_stackctrl',
            warning: 'Raw StackCTRL evidence. This payload has not been analysed by Azure OpenAI.',
            companyId: Number(companyId), snapshotId: Number(snapshot.ID), runId: null,
            periodType: snapshot.SnapshotType || 'snapshot', periodStart: snapshot.PeriodStart || null,
            periodEnd: snapshot.PeriodEnd || null, createdAt: snapshot.CreatedAt,
            domainKey: domainKey || null,
            rawStackCTRLData: domainKey ? selectedSources[0] || null : { metrics: parseJson(snapshot.MetricsJson, {}), sources: selectedSources }
        };
    }

    async function getPowerBIHistory(companyId, { periodType = null, limit = 100 } = {}) {
        const numericCompanyId = Number(companyId);
        const params = [numericCompanyId];
        const periodFilter = periodType ? ' AND PeriodType = ?' : '';
        if (periodType) params.push(String(periodType));
        params.push(Math.min(500, Math.max(1, Number(limit) || 100)));
        const [runs] = await pool.query(`SELECT * FROM StackCTRLEnterpriseReportRuns WHERE CompanyID = ?${periodFilter} ORDER BY ID DESC LIMIT ?`, params);
        const runIds = runs.map(run => Number(run.ID)).filter(Boolean);
        if (!runIds.length) return { dataClassification: 'intelligent_azure_output', companyId: numericCompanyId, periodType: periodType || 'all', runs: [], domains: [], finalSyntheses: [] };
        const placeholders = runIds.map(() => '?').join(',');
        const [[domainRows], [synthesisRows]] = await Promise.all([
            pool.query(`SELECT * FROM StackCTRLTenantDomainIntelligence WHERE CompanyID = ? AND RunID IN (${placeholders}) ORDER BY RunID DESC, ID`, [numericCompanyId, ...runIds]),
            pool.query(`SELECT * FROM StackCTRLEnterpriseSynthesis WHERE CompanyID = ? AND RunID IN (${placeholders}) ORDER BY RunID DESC, ID DESC`, [numericCompanyId, ...runIds])
        ]);
        return {
            dataClassification: 'intelligent_azure_output', companyId: numericCompanyId,
            periodType: periodType || 'all', runs,
            domains: domainRows.map(powerBIDomainRow),
            finalSyntheses: synthesisRows.map(powerBISynthesisRow)
        };
    }

    return {
        settings,
        domains: ENTERPRISE_DOMAINS,
        buildDomainPackage,
        buildDomainBatchPackage,
        runEnterpriseReport,
        runEnterpriseSynthesis,
        runRollupReport,
        runScheduledTick,
        getAdminData,
        getAdminProgress,
        getAdminDomainDetail,
        getAdminAuditDetail,
        getAdminBatchDetails,
        getAdminSynthesisDetail,
        getPowerBIIntelligenceRun,
        getPowerBIDomain,
        getPowerBIFinal,
        getPowerBIRaw,
        getPowerBIHistory,
        flattenPowerBITables
    };
}

module.exports = {
    ENTERPRISE_DOMAINS,
    DOMAIN_BY_KEY,
    IDENTITY_LINEAGE_FIELDS,
    DEVICE_LINEAGE_FIELDS,
    EMAIL_LINEAGE_FIELDS,
    NETWORK_LINEAGE_FIELDS,
    BACKUP_LINEAGE_FIELDS,
    APPLICATIONS_LINEAGE_FIELDS,
    SECURITY_LINEAGE_FIELDS,
    GOVERNANCE_LINEAGE_FIELDS,
    COMPLIANCE_LINEAGE_FIELDS,
    OPERATIONS_LINEAGE_FIELDS,
    DASHBOARD_BACKED_ENTERPRISE_DOMAINS,
    DOMAIN_EVIDENCE_TYPES,
    buildDataLineageComparison,
    buildDomainRunAudit,
    sourceAlignmentFailure,
    createEnterpriseIntelligenceService,
    flattenDomainEvidence,
    filterDomainEvidence,
    buildEvidenceCatalog,
    repairTruncatedJson,
    splitIntoBatches,
    securityAlertSemantics,
    splitSecurityAlertsIntoBatches,
    computeInterBatchDelayMs,
    computeInterDomainDelayMs,
    periodWindow,
    normalizeMysqlDate,
    normalizeEvidenceBackedItem
};

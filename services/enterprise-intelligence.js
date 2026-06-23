const { DateTime } = require('luxon');

const ENTERPRISE_DOMAINS = Object.freeze([
    { key: 'identity', name: 'Identity Protection', sourceKey: 'identity', mode: 'enterprise_domain_identity', riskKey: 'identity', healthKey: 'identityHealth', focus: ['MFA coverage', 'users without MFA', 'privileged accounts', 'admin roles', 'legacy authentication', 'risky sign-ins', 'external users', 'Conditional Access gaps'] },
    { key: 'devices', name: 'Device Protection', sourceKey: 'devices', mode: 'enterprise_domain_devices', riskKey: 'devices', healthKey: 'deviceHealth', focus: ['compliance rate', 'stale devices', 'non-compliant devices', 'unmanaged indicators', 'endpoint security risk', 'remediation actions'] },
    { key: 'email_security', name: 'Email Security', sourceKey: 'email_security', mode: 'enterprise_domain_email_security', riskKey: 'email', healthKey: 'emailHealth', focus: ['active threats', 'unresolved threats', 'phishing and malware indicators', 'response posture', 'resolution rate', 'user exposure'] },
    { key: 'cloudflare_network_security', name: 'Network Security / Cloudflare', sourceKey: 'cloudflare_network_security', mode: 'enterprise_domain_cloudflare_network_security', riskKey: 'network', healthKey: null, focus: ['network posture', 'WAF and firewall controls', 'DNS posture', 'SSL/TLS posture', 'bot protection', 'rate limiting', 'security events', 'unknown controls'] },
    { key: 'governance', name: 'Governance', sourceKey: 'governance', mode: 'enterprise_domain_governance', riskKey: 'governance', healthKey: 'governanceHealth', focus: ['access reviews', 'admin reviews', 'policy reviews', 'governance maturity', 'manual review needs', 'evidence gaps'] },
    { key: 'compliance', name: 'Compliance Validation', sourceKey: 'compliance', mode: 'enterprise_domain_compliance', riskKey: 'compliance', healthKey: 'complianceHealth', focus: ['control status', 'failed controls', 'partial controls', 'manual-review controls', 'compliance readiness', 'evidence gaps'] },
    { key: 'security_alerts', name: 'Security Alerts', sourceKey: 'security_alerts', mode: 'enterprise_domain_security_alerts', riskKey: 'security', healthKey: 'securityHealth', focus: ['alert severity', 'high-severity alerts', 'anonymous IP sign-ins', 'active incidents', 'incident response posture', 'containment actions'] },
    { key: 'operations', name: 'Operations', sourceKey: 'operations', mode: 'enterprise_domain_operations', riskKey: 'operations', healthKey: 'operationsHealth', focus: ['data freshness', 'stale operational evidence', 'failed tasks', 'service health', 'operational risk', 'process gaps'] },
    { key: 'backup', name: 'Backup and Recovery', sourceKey: 'backup', mode: 'enterprise_domain_backup', riskKey: 'backup', healthKey: 'backupHealth', focus: ['backup coverage', 'third-party backup', 'immutable storage', 'restore testing', 'ransomware recovery readiness', 'business continuity'] },
    { key: 'applications', name: 'Applications', sourceKey: 'applications', mode: 'enterprise_domain_applications', riskKey: 'applications', healthKey: 'applicationsHealth', focus: ['external publishers', 'broad permissions', 'high-risk applications', 'shadow IT', 'consent risk', 'application governance'] }
]);

const DOMAIN_BY_KEY = Object.freeze(Object.fromEntries(ENTERPRISE_DOMAINS.map(domain => [domain.key, domain])));
const LOWER_PERIOD = Object.freeze({ weekly: 'daily', monthly: 'weekly', yearly: 'monthly' });
const DEFAULT_DOMAIN_DELAY_MS = 30000;
const DEFAULT_MAX_INPUT_BYTES = 350000;
const DEFAULT_MAX_ITEMS_PER_BATCH = 750;
const DEFAULT_MAX_TOTAL_TOKENS = 200000;
const DEFAULT_DOMAIN_OUTPUT_TOKENS = 5000;
const DEFAULT_SYNTHESIS_OUTPUT_TOKENS = 8000;
const ENTERPRISE_RATE_LIMIT_RETRY_DELAYS_MS = Object.freeze([60000, 120000, 240000]);
const ENTERPRISE_RATE_LIMIT_RETRY_MAX_MS = 15 * 60 * 1000;
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
        return Object.fromEntries(Object.entries(value).slice(0, 80).map(([key, nested]) => [key, safeValue(nested, depth + 1, limits)]));
    }
    return String(value).slice(0, maxString);
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

function flattenDomainEvidence(evidence, { rootPath = 'evidence' } = {}) {
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
        return context;
    }

    function append(value, path, context) {
        const itemContext = containerContext(value, context);
        const sourceLabel = String(itemContext.evidenceType || itemContext.type || itemContext.sourceKey || itemContext.source || pathLabel(path));
        flattened.push({
            sourcePath: path,
            sourceLabel,
            evidenceType: String(itemContext.evidenceType || itemContext.type || sourceLabel || 'stored_evidence'),
            data: safeValue(value?.data ?? value, 0, { maxDepth: 7, maxArray: 20, maxString: 1600 })
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

        const entries = Object.entries(value);
        const arrayBearingEntries = entries.filter(([, nested]) => containsArray(nested));
        if (!arrayBearingEntries.length) {
            append(value, path, inherited);
            return;
        }

        const context = containerContext(value, inherited);
        if (isArrayItem) {
            const recordFields = Object.fromEntries(entries.filter(([key, nested]) =>
                !containsArray(nested) && !EVIDENCE_CONTAINER_METADATA_KEYS.has(key.toLowerCase())
            ));
            if (Object.keys(recordFields).length) append(recordFields, path, context);
        }

        for (const [key, nested] of arrayBearingEntries) {
            walk(nested, `${path}.${key}`, context, false);
        }
    }

    walk(evidence, rootPath);
    return flattened;
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
    const warnings = sourceHealth.warnings || [];
    const refreshFailedWarning = warnings.find(w => /refresh failed|stored evidence retained/i.test(w));
    if (refreshFailedWarning) {
        return {
            status: 'blocked_stale_source',
            isStale: true,
            ageMinutes: age,
            lastUpdated,
            errorMessage: `${domainName} source is stale ${ageDisplay}. Refresh ${domainName.toLowerCase()} dashboard/source before running Azure analysis.`,
            reason: 'refresh_failed_stale_cache'
        };
    }
    return {
        status: 'blocked_stale_source',
        isStale: true,
        ageMinutes: age,
        lastUpdated,
        errorMessage: `${domainName} source is stale ${ageDisplay}. Refresh ${domainName.toLowerCase()} dashboard/source before running Azure analysis.`,
        reason: 'source_too_old'
    };
}

function sourceMissingFailure(sourceHealth, domainName) {
    const status = String(sourceHealth?.status || 'missing');
    if (!['missing', 'error', 'not_configured'].includes(status)) return null;
    const warning = array(sourceHealth?.warnings).find(Boolean);
    return {
        status: 'blocked_missing_source',
        errorMessage: warning || `${domainName} has no complete saved evidence snapshot. Azure analysis is blocked until evidence collection succeeds.`,
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

function safeResponsePreview(text, maximum = 2000) {
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
    if ((statuses.length && statuses.every(status => status === 'failed_storage')) || reasons.includes('storage')) return 'failed_storage';
    return 'failed';
}

function classifyFailureStatus(error) {
    const message = String(error?.message || '').toLowerCase();
    if (message.includes('source mismatch') || message.includes('source_mismatch')) return 'failed_source_mismatch';
    if (message.includes('json')) return 'failed_invalid_json';
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
    return `You are a JSON repair tool. Return valid JSON only. No markdown. No code fences. No explanations outside JSON.

Repair this incomplete or invalid JSON into the required schema:

${invalidJson}`;
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
        maxInputBytes: Math.max(50000, Number(config.maxInputBytes ?? process.env.ENTERPRISE_AI_MAX_INPUT_BYTES_PER_DOMAIN) || DEFAULT_MAX_INPUT_BYTES),
        maxItemsPerBatch: Math.max(1, Number(config.maxItemsPerBatch ?? process.env.ENTERPRISE_AI_MAX_ITEMS_PER_BATCH) || DEFAULT_MAX_ITEMS_PER_BATCH),
        maxDomainOutputTokens: Math.max(1000, Number(config.maxDomainOutputTokens ?? process.env.ENTERPRISE_AI_MAX_OUTPUT_TOKENS_PER_DOMAIN) || DEFAULT_DOMAIN_OUTPUT_TOKENS),
        maxSynthesisOutputTokens: Math.max(2000, Number(config.maxSynthesisOutputTokens ?? process.env.ENTERPRISE_AI_MAX_OUTPUT_TOKENS_SYNTHESIS) || DEFAULT_SYNTHESIS_OUTPUT_TOKENS),
        maxTotalTokens: Math.max(10000, Number(config.maxTotalTokens ?? process.env.ENTERPRISE_AI_MAX_TOTAL_TOKENS) || DEFAULT_MAX_TOTAL_TOKENS),
        requestTimeoutMs: Math.max(60000, Number(config.requestTimeoutMs ?? process.env.ENTERPRISE_AI_REQUEST_TIMEOUT_MS) || 180000)
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
        const evidence = domain.key === 'identity' && source.sourceLineage?.sourceBuilder === 'storedStackCTRLIdentityEvidence'
            ? array(sourceEvidence).filter(item => item?.evidenceType === 'users')
            : domain.key === 'devices' && source.sourceLineage?.sourceBuilder === 'storedStackCTRLDeviceEvidence'
            ? array(sourceEvidence).filter(item => item?.evidenceType === 'devices')
            : domain.key === 'email_security' && source.sourceLineage?.sourceBuilder === 'storedStackCTRLEmailEvidence'
            ? array(sourceEvidence).filter(item => ['alerts', 'incidents', 'mailActivityUsers'].includes(item?.evidenceType))
            : domain.key === 'cloudflare_network_security' && source.sourceLineage?.sourceBuilder === 'storedStackCTRLNetworkEvidence'
            ? array(sourceEvidence).filter(item => ['accessApps', 'devices', 'gatewayRules', 'accessLogs', 'dlpProfiles', 'warpProfiles'].includes(item?.evidenceType))
            : domain.key === 'backup' && source.sourceLineage?.sourceBuilder === 'storedStackCTRLBackupEvidence'
            ? array(sourceEvidence).filter(item => ['users', 'sites'].includes(item?.evidenceType))
            : domain.key === 'applications' && source.sourceLineage?.sourceBuilder === 'storedStackCTRLApplicationsEvidence'
            ? array(sourceEvidence).filter(item => item?.evidenceType === 'applications')
            : domain.key === 'security_alerts' && source.sourceLineage?.sourceBuilder === 'storedStackCTRLSecurityEvidence'
            ? array(sourceEvidence).filter(item => ['alerts', 'incidents', 'signIns', 'threatIndicators'].includes(item?.evidenceType))
            : domain.key === 'governance' && source.sourceLineage?.sourceBuilder === 'storedStackCTRLGovernanceEvidence'
            ? array(sourceEvidence).filter(item => item?.evidenceType === 'governanceRows')
            : domain.key === 'compliance' && source.sourceLineage?.sourceBuilder === 'storedStackCTRLComplianceEvidence'
            ? array(sourceEvidence).filter(item => item?.evidenceType === 'controls')
            : domain.key === 'operations' && source.sourceLineage?.sourceBuilder === 'storedStackCTRLOperationsEvidence'
            ? array(sourceEvidence).filter(item => item?.evidenceType === 'tasks')
            : sourceEvidence;
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
        const knowledge = await loadKnowledge(domain.key);
        const previousAnalysis = await loadPreviousDomain(companyId, domain.key, runId);
        const flattenedEvidence = flattenDomainEvidence(current.evidence, { rootPath: `${domain.sourceKey}.evidence` });
        const stackCTRLDataCount = flattenedEvidence.length;
        const sourceEvidenceLineage = current.source.sourceLineage || {};
        const manualFilteredDomain = ['governance', 'compliance', 'operations'].includes(domain.key);
        const manualExcludedCount = manualFilteredDomain ? Number(sourceEvidenceLineage.manualRowsExcluded || sourceEvidenceLineage.omittedRecordCount || 0) : 0;
        
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
            evidence: [],
            limitations: {
                rawVendorPayloadIncluded: false,
                rawSnapshotContextIncluded: false,
                missingDataWarnings: [
                    ...array(current.source.warnings),
                    ...(manualExcludedCount > 0 ? [`${manualExcludedCount} manual evidence row(s) were intentionally excluded from Azure input; only API-connected evidence was prepared.`] : []),
                    ...(!knowledge.length ? [`Curated ${domain.name} best-practice references were unavailable.`] : [])
                ]
            }
        };

        const sourceLineageValues = {
            ...(DASHBOARD_BACKED_ENTERPRISE_DOMAINS.includes(domain.key) ? current.dashboardMetrics : current.metrics),
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
        return {
            package: base,
            current,
            allEvidence: flattenedEvidence,
            sourceAlignment,
            audit: {
                stackCTRLDataCount,
                preparedForAzureCount: stackCTRLDataCount,
                sentToAzureCount: 0, // Successfully analysed by Azure; updated after completed batches
                omittedCount: manualExcludedCount,
                metricsIncludedCount: primitiveMetricCount(base.currentMetrics) + primitiveMetricCount(base.dashboardMetrics) + primitiveMetricCount(base.calculatedIndicators),
                evidenceIncludedCount: stackCTRLDataCount,
                evidenceOmittedCount: 0, // Batching handles all evidence
                historicalComparisonsIncluded: Object.values(base.historicalComparisons).filter(item => item.availability === 'available').length,
                inputSizeBytes
            }
        };
    }

    function domainPrompt(domain, packageValue) {
        return `You are StackCTRL Enterprise Intelligence. Analyse only the supplied frozen StackCTRL ${domain.name} package.
Azure builds structured enterprise intelligence; Power BI builds the final report. Do not create layouts, visuals, HTML, dashboard instructions, or Power BI files.
Do not claim direct access to Microsoft Graph, Cloudflare, or another vendor. Do not invent missing controls or evidence.
Every posture claim must identify supporting evidence, assessed areas, confirmed controls, unknown controls, gaps, movement, business impact, and recommended action.
StackCTRL authoritative scores must be justified but never recalculated or replaced.

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
  "powerBiSummary": {}
}

Finding fields: title, description, severity, status, evidenceSummary, businessImpact.
Risk fields: title, description, severity, likelihood, impact, businessImpact, evidenceSummary, recommendation.
Recommendation/action fields: title, detail, priority, businessReason, suggestedOwner, suggestedDueDate.
Trend fields: metricName, currentValue, previousValue, changePercent, direction, comparisonPeriod, explanation.
Use empty arrays, objects, or null when evidence is unavailable. Clearly state limitations instead of filling gaps with assumptions.

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
    function buildDomainBatchPackage(basePackage, batchEvidence, batchNumber, totalBatches) {
        return {
            ...basePackage,
            evidence: batchEvidence.map((item, index) => ({
                evidenceNumber: index + 1,
                evidenceType: item?.evidenceType || item?.type || 'stored_evidence',
                sourceLabel: item?.sourceLabel || null,
                sourcePath: item?.sourcePath || null,
                data: safeValue(item?.data ?? item, 0, { maxDepth: 6, maxArray: 15, maxString: 1600 })
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
                batchEvidentItemCount: batchEvidence.length
            },
            limitations: {
                ...basePackage.limitations,
                batchProcessing: true,
                batchNumber,
                totalBatches
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
        jsonRepaired = false, jsonRepairMethod = null, recommendedRetryAfterMs = null, stackCTRLDataCount = 0
    }) {
        const batchItemCount = batchEvidence.length;
        const batchSummary = {
            summary: analysis?.domainExecutiveSummary || '',
            findingsCount: array(analysis?.keyFindings).length,
            risksCount: array(analysis?.risks).length,
            recommendationsCount: array(analysis?.recommendations).length,
            trendsCount: array(analysis?.trendAnalysis).length,
            jsonRepaired: Boolean(jsonRepaired),
            jsonRepairMethod,
            recommendedRetryAfterMs: recommendedRetryAfterMs == null ? null : Number(recommendedRetryAfterMs)
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
              Status = ?, StackCTRLDataCount = ?, BatchCount = ?, BatchItemCount = ?, SentToAzureCount = ?, InputSizeBytes = ?, ResponseSizeBytes = ?,
              InputTokens = ?, OutputTokens = ?, TotalTokens = ?, RetryCount = ?,
              BatchSummaryJson = ?, FindingsJson = ?, RisksJson = ?, RecommendationsJson = ?, TrendsJson = ?,
              MissingDataWarningsJson = ?, CompletedAt = NOW(), ErrorMessage = ?, FailureReason = ?,
              RawResponsePreview = ?, AzureFinishReason = ?, UpdatedAt = NOW()`,
            [
                companyId, snapshotId, runId, domain.key, domain.name, batchNumber, totalBatches, status,
                stackCTRLDataCount, batchItemCount, analysis ? batchItemCount : 0, 0, 0,
                usage.requestBytes || 0, usage.responseBytes, usage.inputTokens, usage.outputTokens, usage.totalTokens, usage.retries || 0,
                JSON.stringify(batchSummary || {}),
                analysis ? jsonArray(analysis.keyFindings) : null,
                analysis ? jsonArray(analysis.risks) : null,
                analysis ? jsonArray(analysis.recommendations) : null,
                analysis ? jsonArray(analysis.trendAnalysis) : null,
                analysis ? jsonArray(analysis.missingDataWarnings) : null,
                errorMessage, failureReason, rawResponsePreview, azureFinishReason,
                // ON DUPLICATE KEY UPDATE values
                status, stackCTRLDataCount, totalBatches, batchItemCount, analysis ? batchItemCount : 0, usage.requestBytes || 0, usage.responseBytes,
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
    async function analyzeDomainBatch({ companyId, snapshot, run, domain, packageResult, batchEvidence, batchNumber, totalBatches, historicalContext }) {
        const batchPackage = buildDomainBatchPackage(packageResult.package, batchEvidence, batchNumber, totalBatches);
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
                    if (localRepair.success) {
                        logger.warn(`[StackCTRL Enterprise] Batch ${batchNumber} contained truncated JSON; StackCTRL closed the incomplete JSON structure locally.`);
                        jsonRepaired = true;
                        jsonRepairMethod = 'local_truncation_closure';
                        analysis = normalizedDomainResult(localRepair.value, domain, packageResult.current);
                    } else {
                        logger.warn(`[StackCTRL Enterprise] Batch ${batchNumber} JSON parsing failed, attempting repair. Error: ${jsonResult.error}`);
                        const repairResponse = await azureOpenAI.createJsonCompletion({
                            messages: [
                                { role: 'system', content: 'You are a JSON repair tool. Return valid JSON only. No markdown. No code fences. No explanations outside JSON.' },
                                { role: 'user', content: createJsonRepairPrompt(response.data.slice(0, 5000)) }
                            ],
                            temperature: 0,
                            maxTokens: settings.maxDomainOutputTokens,
                            maxRetriesOverride: 1,
                            retryDelaysMsOverride: ENTERPRISE_RATE_LIMIT_RETRY_DELAYS_MS,
                            retryMaxMsOverride: ENTERPRISE_RATE_LIMIT_RETRY_MAX_MS,
                            timeoutMs: settings.requestTimeoutMs,
                            allowInvalidJsonResponse: true
                        });
                        const repairUsage = responseUsage(repairResponse);
                        usage.outputTokens += repairUsage.outputTokens;
                        usage.totalTokens += repairUsage.totalTokens;
                        const repairResult = parseJsonWithDiagnostics(repairResponse.data);
                        const localRepairResult = repairResult.success ? null : repairTruncatedJson(repairResponse.data);
                        if (!repairResult.success && !localRepairResult?.success) {
                            const failureReason = finishReason === 'length' ? 'output_truncated_unrepairable' : 'invalid_json_unrepairable';
                            await storeBatch({
                                companyId, snapshotId: snapshot.ID, runId: run.id, domain,
                                batchNumber, totalBatches, batchEvidence, analysis: null, usage,
                                stackCTRLDataCount: packageResult.audit.stackCTRLDataCount,
                                status: 'failed_invalid_json',
                                errorMessage: `JSON parse failed: ${jsonResult.error}. Repair attempt also failed: ${repairResult.error}`,
                                failureReason,
                                rawResponsePreview,
                                azureFinishReason: finishReason
                            });
                            return {
                                status: 'failed_invalid_json', batchNumber, batchItemCount: batchEvidence.length, domain, usage,
                                failureReason,
                                errorMessage: `JSON parse failed: ${jsonResult.error}. Repair attempt also failed: ${repairResult.error}`
                            };
                        }
                        jsonRepaired = true;
                        jsonRepairMethod = repairResult.success ? 'azure_repair' : 'azure_repair_then_local_closure';
                        analysis = normalizedDomainResult(repairResult.success ? repairResult.value : localRepairResult.value, domain, packageResult.current);
                    }
                } else {
                    analysis = normalizedDomainResult(jsonResult.value, domain, packageResult.current);
                }
            } else {
                analysis = normalizedDomainResult(response.data, domain, packageResult.current);
            }

            if (jsonRepairMethod === 'local_truncation_closure' || finishReason === 'length') {
                analysis.missingDataWarnings = [
                    ...array(analysis.missingDataWarnings),
                    'Azure output ended before all closing JSON delimiters were returned. StackCTRL safely recovered the structured response; trailing narrative fields may be incomplete.'
                ];
            }
            
            // Store successful batch
            await storeBatch({
                companyId, snapshotId: snapshot.ID, runId: run.id, domain,
                batchNumber, totalBatches, batchEvidence, analysis, usage, status: 'completed',
                stackCTRLDataCount: packageResult.audit.stackCTRLDataCount,
                rawResponsePreview, azureFinishReason: finishReason, jsonRepaired, jsonRepairMethod
            });
            
            return { status: 'completed', batchNumber, batchItemCount: batchEvidence.length, domain, analysis, usage, jsonRepaired, jsonRepairMethod };
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
            else if (metadata.rateLimited || metadata.statusCode === 429 || error.message.includes('429') || error.message.includes('throttl')) failureReason = 'rate_limited';
            const status = failureReason === 'output_truncated' || failureReason === 'invalid_json'
                ? 'failed_invalid_json'
                : failureReason === 'rate_limited' ? 'failed_rate_limited' : classifyFailureStatus(error);
            const recommendedRetryAfterMs = metadata.retryAfterMs ?? metadata.lastRetryDelayMs ?? null;
            if (failureReason === 'rate_limited') captureRateLimit(error);
            
            if (!alreadyStored) {
                await storeBatch({
                    companyId, snapshotId: snapshot.ID, runId: run.id, domain,
                    batchNumber, totalBatches, batchEvidence, analysis: null, usage,
                    stackCTRLDataCount: packageResult.audit.stackCTRLDataCount,
                    status, errorMessage: error.message, failureReason,
                    rawResponsePreview: safeResponsePreview(metadata.rawResponse || metadata.responseText || ''),
                    azureFinishReason: metadata.finishReason || null,
                    recommendedRetryAfterMs
                });
            }
            
            logger.error(`[StackCTRL Enterprise] ${domain.name} batch ${batchNumber} failed:`, error.message);
            return { status, batchNumber, batchItemCount: batchEvidence.length, domain, usage, failureReason, errorMessage: error.message, recommendedRetryAfterMs };
        }
    }

    // Process all batches for a domain and aggregate results
    async function processDomainBatches({ companyId, snapshot, run, domain, packageResult, allEvidence, historicalContext }) {
        const batches = splitIntoBatches(allEvidence, {
            maxItems: settings.maxItemsPerBatch,
            maxBytes: settings.maxInputBytes,
            estimateBytes: items => estimateDomainRequestBytes(
                domain,
                buildDomainBatchPackage(packageResult.package, items, 1, Math.max(1, Math.ceil(allEvidence.length / settings.maxItemsPerBatch)))
            )
        });
        const results = [];
        const totals = { inputTokens: 0, outputTokens: 0, totalTokens: 0, requestBytes: 0, responseBytes: 0, retries: 0 };
        
        logger.info(`[StackCTRL Enterprise] Processing ${domain.name} in ${batches.length} batch(es)`);
        
        for (const batch of batches) {
            const result = await analyzeDomainBatch({
                companyId, snapshot, run, domain, packageResult,
                batchEvidence: batch.items, batchNumber: batch.number, totalBatches: batches.length,
                historicalContext
            });
            
            results.push(result);
            for (const key of Object.keys(totals)) {
                totals[key] += result.usage?.[key] || 0;
            }

            if (result.status === 'failed_rate_limited') {
                logger.warn?.(`[StackCTRL Enterprise] Stopping ${domain.name} after an exhausted Azure 429 retry budget.`);
                break;
            }
            
            // Delay between batches to avoid throttling
            if (batch.number < batches.length && settings.domainDelayMs > 0) {
                await wait(settings.domainDelayMs);
            }
        }
        
        const rateLimitedBatch = results.find(result => result.status === 'failed_rate_limited');
        return {
            results,
            batchCount: batches.length,
            totals,
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

    async function refreshEnterpriseSnapshot(companyId, user = {}) {
        if (!intelligenceService?.createSnapshot) return null;
        return intelligenceService.createSnapshot({
            companyId: Number(companyId),
            options: { snapshotType: 'enterprise_pipeline', refresh: true },
            user
        });
    }

    function normalizedDomainResult(data, domain, current) {
        const value = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
        return {
            ...value,
            domainExecutiveSummary: textOrNull(value.domainExecutiveSummary),
            technicalSummary: textOrNull(value.technicalSummary),
            businessImpact: textOrNull(value.businessImpact),
            currentPosture: textOrNull(value.currentPosture),
            evidenceUsed: array(value.evidenceUsed),
            evidenceGaps: array(value.evidenceGaps),
            scoreJustification: textOrNull(value.scoreJustification),
            controlAssessment: value.controlAssessment || {},
            keyFindings: array(value.keyFindings),
            risks: array(value.risks),
            recommendations: array(value.recommendations),
            trendAnalysis: array(value.trendAnalysis),
            yesterdayVsToday: value.yesterdayVsToday || {},
            whatImproved: array(value.whatImproved),
            whatDeteriorated: array(value.whatDeteriorated),
            whatStayedTheSame: array(value.whatStayedTheSame),
            missingDataWarnings: array(value.missingDataWarnings),
            assumptions: array(value.assumptions),
            confidenceScore: numberOrNull(value.confidenceScore),
            managementActions: array(value.managementActions),
            powerBiSummary: value.powerBiSummary || {},
            authoritativeScores: { healthScore: current.healthScore, riskScore: current.riskScore, riskLevel: current.riskLevel },
            domain: { key: domain.key, name: domain.name }
        };
    }

    async function insertItem({ companyId, snapshotId, runId, domainKey, domainName, period, itemType, item, source }) {
        const title = item?.title || item?.metricName || item?.name || item?.action || `${domainName} ${itemType}`;
        const suggestedDueDate = normalizeMysqlDate(item?.suggestedDueDate || item?.dueDate || item?.targetDate || item?.actionDueDate || item?.reviewDate || item?.completionDate);
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
                textOrNull(item?.businessImpact || item?.businessReason), textOrNull(item?.evidenceSummary),
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

    async function storeDomain({ run, companyId, snapshot, domain, packageResult, analysis, usage, status = 'completed', errorMessage = null }) {
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
        if (analysis) await storeItems({ companyId, snapshotId: snapshot.ID, runId: run.id, domain, period: run, analysis });
        return result.insertId || result.affectedRows;
    }

    async function storeAudit({ run, companyId, snapshot, domain, packageResult, analysis, usage, status }) {
        const combinedText = JSON.stringify(analysis || {}).toLowerCase();
        const auditInput = JSON.stringify(packageResult.package);
        const auditOmitted = JSON.stringify({
            stackCTRLDataCount: packageResult.audit.stackCTRLDataCount,
            sentToAzureCount: packageResult.audit.sentToAzureCount,
            omittedCount: packageResult.audit.omittedCount,
            evidenceOmittedCount: packageResult.audit.evidenceOmittedCount,
            detailReducedToMeetInputLimit: Boolean(packageResult.package.limitations?.detailReducedToMeetInputLimit)
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

    async function analyseDomain({ companyId, snapshot, run, domain, historicalContext }) {
        const packageResult = await buildDomainPackage({ companyId, snapshot, runId: run.id, domain, historicalContext });
        const missingFailure = DASHBOARD_BACKED_ENTERPRISE_DOMAINS.includes(domain.key)
            ? sourceMissingFailure(packageResult.package.sourceHealth, domain.name)
            : null;
        if (missingFailure) {
            const usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, requestBytes: 0, responseBytes: 0, retries: 0 };
            packageResult.audit.sentToAzureCount = 0;
            await storeDomain({
                run, companyId, snapshot, domain, packageResult, analysis: null, usage,
                status: missingFailure.status, errorMessage: missingFailure.errorMessage
            });
            await storeAudit({
                run, companyId, snapshot, domain, packageResult, analysis: null, usage,
                status: missingFailure.status
            });
            return {
                status: missingFailure.status, domain, usage, audit: packageResult.audit,
                errorMessage: missingFailure.errorMessage, sourceHealth: packageResult.package.sourceHealth
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
            return {
                status: alignmentFailure.status, domain, usage, audit: packageResult.audit,
                errorMessage: alignmentFailure.errorMessage, sourceAlignment: packageResult.sourceAlignment
            };
        }

        const staleFailure = sourceStaleFailure(packageResult.package.sourceHealth, domain.name);
        if (staleFailure) {
            const usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, requestBytes: 0, responseBytes: 0, retries: 0 };
            packageResult.audit.sentToAzureCount = 0;
            await storeDomain({
                run, companyId, snapshot, domain, packageResult, analysis: null, usage,
                status: staleFailure.status, errorMessage: staleFailure.errorMessage
            });
            await storeAudit({
                run, companyId, snapshot, domain, packageResult, analysis: null, usage,
                status: staleFailure.status
            });
            return {
                status: staleFailure.status, domain, usage, audit: packageResult.audit,
                errorMessage: staleFailure.errorMessage, sourceHealth: packageResult.package.sourceHealth
            };
        }
        
        try {
            // Process domain in batches instead of reducing evidence
            const batchResults = await processDomainBatches({
                companyId, snapshot, run, domain,
                packageResult,
                allEvidence: packageResult.allEvidence,
                historicalContext
            });
            
            // Check if all batches completed successfully
            const failedBatches = batchResults.results.filter(r => r.status !== 'completed');
            const completedBatches = batchResults.results.filter(r => r.status === 'completed');
            
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
            const aggregatedAnalysis = {
                domainExecutiveSummary: completedBatches.map(b => b.analysis?.domainExecutiveSummary).filter(Boolean).join(' '),
                technicalSummary: completedBatches.map(b => b.analysis?.technicalSummary).filter(Boolean).join(' '),
                businessImpact: completedBatches.map(b => b.analysis?.businessImpact).filter(Boolean).join(' '),
                currentPosture: completedBatches.map(b => b.analysis?.currentPosture).filter(Boolean).join(' '),
                evidenceUsed: completedBatches.flatMap(b => b.analysis?.evidenceUsed || []),
                evidenceGaps: completedBatches.flatMap(b => b.analysis?.evidenceGaps || []),
                scoreJustification: completedBatches.map(b => b.analysis?.scoreJustification).filter(Boolean).join(' '),
                controlAssessment: completedBatches[0]?.analysis?.controlAssessment || {},
                keyFindings: completedBatches.flatMap(b => b.analysis?.keyFindings || []).slice(0, 50),
                risks: completedBatches.flatMap(b => b.analysis?.risks || []).slice(0, 50),
                recommendations: completedBatches.flatMap(b => b.analysis?.recommendations || []).slice(0, 50),
                trendAnalysis: completedBatches.flatMap(b => b.analysis?.trendAnalysis || []).slice(0, 50),
                yesterdayVsToday: completedBatches[0]?.analysis?.yesterdayVsToday || {},
                whatImproved: completedBatches.flatMap(b => b.analysis?.whatImproved || []),
                whatDeteriorated: completedBatches.flatMap(b => b.analysis?.whatDeteriorated || []),
                whatStayedTheSame: completedBatches.flatMap(b => b.analysis?.whatStayedTheSame || []),
                missingDataWarnings: completedBatches.flatMap(b => b.analysis?.missingDataWarnings || []),
                assumptions: completedBatches.flatMap(b => b.analysis?.assumptions || []),
                confidenceScore: completedBatches[0]?.analysis?.confidenceScore ?? null,
                managementActions: completedBatches.flatMap(b => b.analysis?.managementActions || []),
                powerBiSummary: completedBatches[0]?.analysis?.powerBiSummary || {},
                authoritativeScores: { healthScore: packageResult.current.healthScore, riskScore: packageResult.current.riskScore, riskLevel: packageResult.current.riskLevel },
                domain: { key: domain.key, name: domain.name },
                batchInfo: { completedBatches: completedBatches.length, totalBatches: batchResults.batchCount, failedBatches: failedBatches.length }
            };
            aggregatedAnalysis.dataLineageComparison = buildDataLineageComparison({
                fields: packageResult.sourceAlignment.rows.map(row => row.metric),
                sourceValues: Object.fromEntries(packageResult.sourceAlignment.rows.map(row => [row.metric, row.stackCTRLSource])),
                inputValues: Object.fromEntries(packageResult.sourceAlignment.rows.map(row => [row.metric, row.enterpriseAzureInput])),
                azureOutput: aggregatedAnalysis,
                storedIntelligence: aggregatedAnalysis
            }).rows;
            
            const finalStatus = failedBatches.length > 0 ? 'partial' : 'completed';
            const successfullyAnalysedCount = completedBatches.reduce((total, batch) => total + Number(batch.batchItemCount || 0), 0);
            packageResult.audit.sentToAzureCount = successfullyAnalysedCount;
            const partialErrorMessage = failedBatches.length
                ? `${failedBatches.length} of ${batchResults.batchCount} batch(es) failed. ${failedBatches.map(batch => batch.errorMessage).filter(Boolean).join(' | ')}`.slice(0, 5000)
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
                status: finalStatus
            });
            
            return {
                status: finalStatus,
                domain,
                domainIntelligenceId,
                analysis: aggregatedAnalysis,
                usage: batchResults.totals,
                audit: updatedAudit,
                batchInfo: { completedBatches: completedBatches.length, totalBatches: batchResults.batchCount, failedBatches: failedBatches.length },
                rateLimited: batchResults.rateLimited,
                recommendedRetryAfterMs: batchResults.recommendedRetryAfterMs
            };
        } catch (error) {
            logger.error(`[StackCTRL Enterprise] ${domain.name} analysis failed:`, error.message);
            const failureStatus = classifyFailureStatus(error);
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
                if (localRepair.success) {
                    logger.warn('[StackCTRL Enterprise] Synthesis contained truncated JSON; StackCTRL closed the incomplete JSON structure locally.');
                    analysis = localRepair.value;
                    synthesisJsonRecovered = true;
                } else {
                    logger.warn(`[StackCTRL Enterprise] Synthesis JSON parsing failed, attempting repair. Error: ${parsed.error}`);
                    const repairResponse = await azureOpenAI.createJsonCompletion({
                        messages: [
                            { role: 'system', content: 'You are a JSON repair tool. Return valid JSON only. No markdown. No code fences. No explanations outside JSON.' },
                            { role: 'user', content: createJsonRepairPrompt(response.data.slice(0, 8000)) }
                        ],
                        temperature: 0,
                        maxTokens: settings.maxSynthesisOutputTokens,
                        maxRetriesOverride: 1,
                        retryDelaysMsOverride: ENTERPRISE_RATE_LIMIT_RETRY_DELAYS_MS,
                        retryMaxMsOverride: ENTERPRISE_RATE_LIMIT_RETRY_MAX_MS,
                        timeoutMs: settings.requestTimeoutMs,
                        allowInvalidJsonResponse: true
                    });
                    const repairUsage = responseUsage(repairResponse);
                    usage.outputTokens += repairUsage.outputTokens;
                    usage.totalTokens += repairUsage.totalTokens;
                    const repaired = parseJsonWithDiagnostics(repairResponse.data);
                    const locallyRepairedResponse = repaired.success ? null : repairTruncatedJson(repairResponse.data);
                    if (!repaired.success && !locallyRepairedResponse?.success) {
                        const error = new Error(`Enterprise synthesis JSON parse failed: ${parsed.error}. Repair attempt also failed: ${repaired.error}`);
                        error.enterpriseStatus = 'failed_invalid_json';
                        throw error;
                    }
                    analysis = repaired.success ? repaired.value : locallyRepairedResponse.value;
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
        const finalRunStatus = synthesisJsonRecovered || finishReason === 'length' || allDomainRows.some(row => !isSuccessfulDomainStatus(row.status))
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

            if (totals.totalTokens >= settings.maxTotalTokens) {
                const skipped = await storeSkippedDomain({
                    run, companyId, snapshot, domain,
                    status: 'skipped_token_threshold',
                    errorMessage: 'Enterprise total token safety threshold reached before this domain could be analysed'
                });
                results.push(skipped);
                for (let pendingIndex = index + 1; pendingIndex < selected.length; pendingIndex += 1) {
                    results.push(await storeSkippedDomain({
                        run, companyId, snapshot, domain: selected[pendingIndex],
                        status: 'skipped_token_threshold',
                        errorMessage: 'Enterprise total token safety threshold reached before this domain could be analysed'
                    }));
                }
                break;
            }

            const result = await analyseDomain({ companyId, snapshot, run, domain, historicalContext });
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

            if (index < selected.length - 1 && settings.domainDelayMs > 0) await wait(settings.domainDelayMs);
        }

        await updateRunProgress(run.id, buildRunProgress({
            run,
            domainKeys,
            results,
            phase: rateLimit ? 'rate_limited' : 'domains_complete',
            rateLimit,
            snapshot
        }), totals);

        return { results, totals, rateLimited: Boolean(rateLimit), rateLimit };
    }

    async function runEnterpriseReport({ companyId, snapshotId = null, periodType = 'daily', referenceDate = new Date(), domainKeys = null, includeSynthesis = true, deduplicationKey = null, refreshSnapshot = null, user = null } = {}) {
        const numericCompanyId = Number(companyId);
        if (!Number.isInteger(numericCompanyId) || numericCompanyId <= 0) throw new Error('A valid companyId is required');
        assertRateLimitCircuitClosed();
        const selectedKeys = Array.isArray(domainKeys) && domainKeys.length ? [...new Set(domainKeys)] : ENTERPRISE_DOMAINS.map(domain => domain.key);
        const invalid = selectedKeys.filter(key => !DOMAIN_BY_KEY[key]);
        if (invalid.length) throw new Error(`Unsupported enterprise domains: ${invalid.join(', ')}`);
        const isSingleDomainRun = selectedKeys.length === 1;
        const shouldRefreshSnapshot = refreshSnapshot ?? !isSingleDomainRun;
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
                    phase: domains.rateLimited ? 'rate_limited' : 'domains_complete',
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
                    errorMessage: result.errorMessage || null,
                    batchInfo: result.batchInfo || null
                })),
                domainRunSummary,
                synthesisId: synthesis?.synthesisId || null,
                synthesisStatus: synthesis?.status || (includeSynthesis ? (domains.rateLimited ? 'skipped_rate_limited' : (successfulDomains.length ? 'skipped' : 'skipped_no_successful_domains')) : 'not_requested'),
                totals: domains.totals,
                rateLimited: domains.rateLimited,
                rateLimit: domains.rateLimit
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
                DomainScorecardJson: parseJson(row.DomainScorecardJson, []),
                MaturityAssessmentJson: parseJson(row.MaturityAssessmentJson, {}),
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

    return {
        settings,
        domains: ENTERPRISE_DOMAINS,
        buildDomainPackage,
        buildDomainBatchPackage,
        runEnterpriseReport,
        runEnterpriseSynthesis,
        runRollupReport,
        runScheduledTick,
        getAdminData
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
    buildDataLineageComparison,
    sourceAlignmentFailure,
    createEnterpriseIntelligenceService,
    flattenDomainEvidence,
    repairTruncatedJson,
    splitIntoBatches,
    periodWindow,
    normalizeMysqlDate
};

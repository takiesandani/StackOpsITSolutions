const SOURCE_CATALOG = [
    { sourceKey: 'identity', displayName: 'Identity Protection', refreshMode: 'refresh_if_stale', freshnessMinutes: 60 },
    { sourceKey: 'devices', displayName: 'Device Security', refreshMode: 'refresh_if_stale', freshnessMinutes: 60 },
    { sourceKey: 'email_security', displayName: 'Email Security', refreshMode: 'refresh_if_stale', freshnessMinutes: 60 },
    { sourceKey: 'security_alerts', displayName: 'Security Alerts and Incidents', refreshMode: 'refresh_if_stale', freshnessMinutes: 30 },
    { sourceKey: 'backup', displayName: 'Backup and Recovery', refreshMode: 'refresh_if_stale', freshnessMinutes: 360 },
    { sourceKey: 'applications', displayName: 'Applications and Service Principals', refreshMode: 'refresh_if_stale', freshnessMinutes: 360 },
    { sourceKey: 'governance', displayName: 'Governance', refreshMode: 'stored_only', freshnessMinutes: 1440 },
    { sourceKey: 'compliance', displayName: 'Compliance Controls', refreshMode: 'stored_only', freshnessMinutes: 1440 },
    { sourceKey: 'operations', displayName: 'Operations', refreshMode: 'stored_only', freshnessMinutes: 360 },
    { sourceKey: 'cloudflare_network_security', displayName: 'Cloudflare Network Security', refreshMode: 'refresh_if_stale', freshnessMinutes: 60 },
    { sourceKey: 'duo_licences', displayName: 'Duo Licences', refreshMode: 'refresh_if_stale', freshnessMinutes: 1440 },
    { sourceKey: 'billing', displayName: 'Billing and Invoices', refreshMode: 'stored_only', freshnessMinutes: null },
    { sourceKey: 'projects', displayName: 'Projects', refreshMode: 'stored_only', freshnessMinutes: null }
];

const PROFILE_EXPECTATIONS = {
    sedfa: new Set(['duo_licences', 'billing', 'projects', 'operations']),
    sunbird: new Set([
        'identity',
        'devices',
        'email_security',
        'security_alerts',
        'backup',
        'applications',
        'governance',
        'compliance',
        'operations',
        'cloudflare_network_security'
    ]),
    standard: new Set(['billing', 'projects'])
};

function parseJson(value, fallback = {}) {
    if (!value) return fallback;
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch (_) {
        return fallback;
    }
}

function inferCapabilityProfile({ company = {}, accessType = null } = {}) {
    const access = String(accessType || '').toLowerCase();
    const companyName = String(company.CompanyName || company.companyname || company.Name || '').toLowerCase();
    if (access.includes('sunbird') || companyName.includes('sunbird')) return 'sunbird';
    if (['duo', 'sedfa'].some(value => access.includes(value) || companyName.includes(value))) return 'sedfa';
    return 'standard';
}

function getDefaultCapabilities(profileKey) {
    const expected = PROFILE_EXPECTATIONS[profileKey] || PROFILE_EXPECTATIONS.standard;
    return SOURCE_CATALOG.map(source => ({
        companyId: null,
        profileKey,
        sourceKey: source.sourceKey,
        displayName: source.displayName,
        isExpected: expected.has(source.sourceKey),
        isEnabled: true,
        refreshMode: source.refreshMode,
        freshnessThresholdMinutes: source.freshnessMinutes,
        configuration: {},
        notes: null
    }));
}

async function persistCapabilityDefaults(pool, companyId, defaults) {
    for (const capability of defaults) {
        await pool.query(
            `INSERT INTO StackCTRLClientCapabilities
             (CompanyID, ProfileKey, SourceKey, DisplayName, IsExpected, IsEnabled,
              RefreshMode, FreshnessThresholdMinutes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                DisplayName = VALUES(DisplayName),
                ProfileKey = COALESCE(ProfileKey, VALUES(ProfileKey))`,
            [
                companyId,
                capability.profileKey,
                capability.sourceKey,
                capability.displayName,
                capability.isExpected ? 1 : 0,
                capability.isEnabled ? 1 : 0,
                capability.refreshMode,
                capability.freshnessThresholdMinutes
            ]
        );
    }
}

async function loadClientCapabilities({ pool, companyId, company, accessType = null, persistDefaults = true }) {
    const profileKey = inferCapabilityProfile({ company, accessType });
    const defaults = getDefaultCapabilities(profileKey);

    if (persistDefaults) {
        await persistCapabilityDefaults(pool, companyId, defaults);
    }

    const [rows] = await pool.query(
        `SELECT * FROM StackCTRLClientCapabilities
         WHERE CompanyID = ?`,
        [companyId]
    );
    const stored = new Map(rows.map(row => [row.SourceKey, row]));

    return defaults.map(defaultCapability => {
        const row = stored.get(defaultCapability.sourceKey);
        if (!row) return { ...defaultCapability, companyId };
        return {
            companyId,
            profileKey: row.ProfileKey || profileKey,
            sourceKey: row.SourceKey,
            displayName: row.DisplayName || defaultCapability.displayName,
            isExpected: Boolean(Number(row.IsExpected)),
            isEnabled: Boolean(Number(row.IsEnabled)),
            refreshMode: row.RefreshMode || defaultCapability.refreshMode,
            freshnessThresholdMinutes: row.FreshnessThresholdMinutes == null
                ? defaultCapability.freshnessThresholdMinutes
                : Number(row.FreshnessThresholdMinutes),
            configuration: parseJson(row.ConfigurationJson, {}),
            notes: row.Notes || null
        };
    });
}

module.exports = {
    SOURCE_CATALOG,
    inferCapabilityProfile,
    getDefaultCapabilities,
    loadClientCapabilities
};

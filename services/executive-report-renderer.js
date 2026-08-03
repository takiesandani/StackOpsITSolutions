function normalizeText(value, fallback = '') {
    if (value == null) return fallback;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return String(value).replace(/\s+/g, ' ').trim() || fallback;
    }
    if (Array.isArray(value)) {
        return value.map(item => normalizeText(item)).filter(Boolean).join('; ') || fallback;
    }
    if (typeof value === 'object') {
        const selected = value.title || value.name || value.displayName || value.summary || value.detail || value.description || value.message || value.value || value.email || value.userPrincipalName || value.id;
        return normalizeText(selected, fallback);
    }
    return fallback;
}

function toDisplayRisk(value) {
    const normalized = String(value || '').trim().toUpperCase();
    if (['CRIT', 'CRITICAL', 'HIGH'].includes(normalized)) return '[ CRIT ]';
    if (['HIGH'].includes(normalized)) return '[ HIGH ]';
    if (['MED', 'MEDIUM'].includes(normalized)) return '[ MED ]';
    return '[ LOW ]';
}

function formatDaysAgo(value) {
    if (!value) return 'N/A';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'N/A';
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
    return `${diffDays}d ago`;
}

function buildExecutiveReportSections(report = {}) {
    const summary = report.summary || {};
    const trend = report.trend || {};
    const domains = Array.isArray(report.domainInsights?.domains) ? report.domainInsights.domains : [];

    const header = {
        riskScore: summary.riskScore ?? summary.risk ?? 0,
        healthScore: summary.healthScore ?? summary.health ?? 0,
        totalUsers: summary.totalUsers ?? summary.users ?? 0,
        protected: summary.protected ?? summary.protectedUsers ?? 0
    };

    const trends = {
        mfaCoverage: trend.mfaCoverage ?? trend.mfaCoveragePercent ?? 0,
        mfaCoverageDelta: trend.mfaCoverageDelta ?? trend.mfaCoverageChange ?? 0,
        riskScore: trend.riskScore ?? summary.riskScore ?? 0,
        riskScoreDelta: trend.riskScoreDelta ?? trend.riskChange ?? 0
    };

    const findings = [];
    const addFinding = (item, kind = 'risk') => {
        const title = normalizeText(item?.title || item?.name || item?.finding || item?.summary || item?.description, 'Untitled finding');
        const description = normalizeText(item?.description || item?.impact || item?.summary || item?.detail, 'No description provided.');
        const impact = normalizeText(item?.impact || item?.businessImpact || item?.details || item?.whyItMatters, 'No impact detail provided.');
        const recommendations = Array.isArray(item?.recommendations) ? item.recommendations.map(item => normalizeText(item)).filter(Boolean) : [];
        const affectedEntities = Array.isArray(item?.affectedEntities) ? item.affectedEntities : [];
        const affectedAssets = affectedEntities.slice(0, 10).map(entity => ({
            who: normalizeText(entity?.entityEmail || entity?.email || entity?.displayName || entity?.name || entity?.entityName, 'Unknown asset'),
            status: entity?.mfaEnabled ? '[ EQUIPPED ]' : '[ UNEQUIPPED ]',
            whereWhen: `${normalizeText(entity?.lastSignIn?.device || entity?.device || entity?.deviceName || 'Unknown device', 'Unknown device')} • ${normalizeText(entity?.lastSignIn?.location || entity?.location || 'Unknown location', 'Unknown location')} • ${formatDaysAgo(entity?.lastSignIn?.dateTime || entity?.lastSignInDateTime || entity?.dateTime)}`,
            risk: toDisplayRisk(entity?.riskLevel || item?.severity || item?.riskLevel || 'LOW')
        }));
        const evidenceSummary = `${affectedAssets.length || affectedEntities.length} affected asset${(affectedAssets.length || affectedEntities.length) === 1 ? '' : 's'} identified for this finding.`;
        const businessImpact = `${description} ${impact}`.trim();
        const whyThisMatters = `${title} introduces a measurable authentication or governance gap that can increase exposure to compromise, privilege abuse, or delayed response.`;
        findings.push({
            kind,
            title,
            businessImpact,
            evidenceSummary,
            affectedAssets,
            whyThisMatters,
            recommendations,
            riskReduction: normalizeText(item?.severity || item?.riskReduction || item?.expectedRiskReduction || 'MEDIUM', 'MEDIUM')
        });
    };

    domains.forEach(domain => {
        const output = domain?.intelligenceOutput || {};
        Array.isArray(output.risks) && output.risks.forEach(item => addFinding(item, 'risk'));
        Array.isArray(output.keyFindings) && output.keyFindings.forEach(item => addFinding(item, 'finding'));
    });

    return { header, trends, findings };
}

module.exports = { buildExecutiveReportSections };

const DOMAIN_WEIGHTS = {
    security: 20,
    identity: 15,
    devices: 15,
    email: 10,
    backup: 10,
    governance: 10,
    compliance: 10,
    network: 10
};

function clamp(value, minimum = 0, maximum = 100) {
    return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}

function numberFrom(values, keys, fallback = null) {
    for (const value of values) {
        for (const key of keys) {
            const candidate = value?.[key];
            if (candidate !== null && candidate !== undefined && candidate !== '' && Number.isFinite(Number(candidate))) {
                return Number(candidate);
            }
        }
    }
    return fallback;
}

function getSource(sources, sourceKey) {
    return sources.find(source => source.sourceKey === sourceKey) || null;
}

function sourceValues(source) {
    return [source?.dashboardMetrics, source?.calculatedIndicators, source?.metrics];
}

function sourceAvailable(source) {
    return source && ['available', 'stale'].includes(source.status);
}

function applySourceStatus(score, source) {
    if (!source?.isExpected) return null;
    if (!sourceAvailable(source)) return 50;
    return clamp(score - (source.status === 'stale' ? 5 : 0));
}

function ratioHealth(total, problemCount) {
    if (!Number.isFinite(total) || total <= 0) return 100;
    return clamp(100 - ((Math.max(0, problemCount || 0) / total) * 100));
}

function identityHealth(source) {
    const values = sourceValues(source);
    const total = numberFrom(values, ['totalUsers', 'TotalUsers'], 0);
    const privileged = numberFrom(values, ['privilegedUsers', 'AdminRoles', 'adminRoles'], 0);
    const mfaCoverage = numberFrom(values, ['mfaCoverage'], 0);
    const highRiskHealth = ratioHealth(total, numberFrom(values, ['highRiskUsers'], 0));
    const privilegedMfaHealth = ratioHealth(privileged, numberFrom(values, ['adminsWithoutMfa', 'privilegedMfaGap'], 0));
    const signInHealth = ratioHealth(total, numberFrom(values, ['signInIssues', 'failedSignIns'], 0));
    return applySourceStatus((mfaCoverage * 0.45) + (highRiskHealth * 0.2) + (privilegedMfaHealth * 0.2) + (signInHealth * 0.15), source);
}

function deviceHealth(source) {
    const values = sourceValues(source);
    const total = numberFrom(values, ['totalDevices', 'TotalDevices'], 0);
    const compliance = numberFrom(values, ['complianceRate', 'compliancePercentage'], ratioHealth(total, numberFrom(values, ['nonCompliantDevices', 'NonCompliant', 'nonCompliant'], 0)));
    const encryption = numberFrom(values, ['encryptionRate', 'encryptionPercentage'], ratioHealth(total, numberFrom(values, ['notEncryptedDevices', 'NotEncrypted', 'notEncrypted'], 0)));
    const activity = ratioHealth(total, numberFrom(values, ['staleDevices', 'StaleDevices'], 0) + numberFrom(values, ['dead30Days'], 0));
    return applySourceStatus((compliance * 0.45) + (encryption * 0.35) + (activity * 0.2), source);
}

function securityHealth(source) {
    const values = sourceValues(source);
    const base = numberFrom(values, ['securityScore'], 100);
    const high = numberFrom(values, ['highSeverityAlerts'], 0);
    const incidents = numberFrom(values, ['activeIncidents'], 0);
    const suspicious = numberFrom(values, ['suspiciousSignIns'], 0);
    return applySourceStatus(base - Math.min(35, (high * 3) + (incidents * 4) + (suspicious * 0.5)), source);
}

function emailHealth(source) {
    const values = sourceValues(source);
    const high = numberFrom(values, ['highSeverityAlerts', 'HighSeverity'], 0);
    const incidents = numberFrom(values, ['activeIncidents', 'OpenIncidents'], 0);
    const threats = numberFrom(values, ['activeThreats', 'ActiveThreats'], 0);
    return applySourceStatus(100 - Math.min(100, (high * 12) + (incidents * 15) + (threats * 5)), source);
}

function backupHealth(source) {
    const values = sourceValues(source);
    const coverage = numberFrom(values, ['backupCoverageScore'], null);
    const services = numberFrom(values, ['servicesCovered'], 0);
    const derivedCoverage = coverage ?? clamp((services / 3) * 100);
    const configured = values.some(value => value?.backupConfigured === true);
    return applySourceStatus(configured ? derivedCoverage : derivedCoverage * 0.75, source);
}

function postureHealth(source, keys) {
    const values = sourceValues(source);
    const score = numberFrom(values, keys, null);
    const failed = numberFrom(values, ['failedControlCount', 'openRisks', 'highRisks'], 0);
    return applySourceStatus(score == null ? 100 - Math.min(60, failed * 10) : score, source);
}

function networkHealth(source) {
    const values = sourceValues(source);
    const score = numberFrom(values, ['networkSecurityScore'], 50);
    const denied = numberFrom(values, ['deniedAccessEvents'], 0);
    const errors = numberFrom(values, ['sectionErrors'], 0);
    return applySourceStatus(score - Math.min(25, (denied * 0.25) + (errors * 5)), source);
}

function levelFromHealth(score) {
    if (score == null) return 'not_scored';
    if (score >= 90) return 'excellent';
    if (score >= 75) return 'good';
    if (score >= 60) return 'attention';
    if (score >= 40) return 'weak';
    return 'critical';
}

function riskLevel(score) {
    if (score == null) return 'not_scored';
    if (score >= 75) return 'critical';
    if (score >= 50) return 'high';
    if (score >= 25) return 'moderate';
    return 'low';
}

function maturityLevel(score) {
    if (score == null) return 'not_scored';
    if (score >= 90) return 'optimised';
    if (score >= 75) return 'managed';
    if (score >= 60) return 'defined';
    if (score >= 40) return 'developing';
    return 'initial';
}

function buildRiskEngine({ sources = [], dataCompleteness = {} } = {}) {
    const domainHealthScores = {
        security: securityHealth(getSource(sources, 'security_alerts')),
        identity: identityHealth(getSource(sources, 'identity')),
        devices: deviceHealth(getSource(sources, 'devices')),
        email: emailHealth(getSource(sources, 'email_security')),
        backup: backupHealth(getSource(sources, 'backup')),
        governance: postureHealth(getSource(sources, 'governance'), ['governanceScore', 'healthScore', 'score', 'maturityScore']),
        compliance: postureHealth(getSource(sources, 'compliance'), ['complianceScore', 'healthScore', 'score']),
        network: networkHealth(getSource(sources, 'cloudflare_network_security'))
    };

    const scoredDomains = Object.entries(domainHealthScores).filter(([, score]) => score != null);
    const totalWeight = scoredDomains.reduce((total, [domain]) => total + DOMAIN_WEIGHTS[domain], 0);
    const weightedHealth = totalWeight
        ? scoredDomains.reduce((total, [domain, score]) => total + (score * DOMAIN_WEIGHTS[domain]), 0) / totalWeight
        : null;
    const completeness = clamp(dataCompleteness.score ?? 0);
    const adjustedHealth = weightedHealth == null ? null : clamp((weightedHealth * 0.85) + (completeness * 0.15));
    const overallRiskScore = adjustedHealth == null ? null : Math.round(100 - adjustedHealth);
    const securityMaturityScore = adjustedHealth == null ? null : Math.round(adjustedHealth);
    const roundedHealth = Object.fromEntries(Object.entries(domainHealthScores).map(([domain, score]) => [domain, score == null ? null : Math.round(score)]));
    const domainRiskScores = Object.fromEntries(Object.entries(roundedHealth).map(([domain, score]) => [domain, score == null ? null : 100 - score]));
    const executiveKPIs = {
        securityHealth: roundedHealth.security,
        governanceHealth: roundedHealth.governance,
        complianceHealth: roundedHealth.compliance,
        identityHealth: roundedHealth.identity,
        deviceHealth: roundedHealth.devices,
        emailHealth: roundedHealth.email,
        backupHealth: roundedHealth.backup
    };

    return {
        methodologyVersion: 'stackctrl-risk-v1',
        generatedAt: new Date().toISOString(),
        overallRiskScore,
        overallRiskLevel: riskLevel(overallRiskScore),
        domainRiskScores,
        domainHealthScores: roundedHealth,
        domainHealthLevels: Object.fromEntries(Object.entries(roundedHealth).map(([domain, score]) => [domain, levelFromHealth(score)])),
        securityMaturityScore,
        securityMaturityLevel: maturityLevel(securityMaturityScore),
        executiveKPIs,
        dataCompletenessScore: completeness
    };
}

module.exports = {
    DOMAIN_WEIGHTS,
    buildRiskEngine,
    maturityLevel,
    riskLevel
};

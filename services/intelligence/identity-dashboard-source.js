function numberValue(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function parseArray(value) {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string' || !value.trim()) return [];
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
        return [];
    }
}

function booleanValue(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value === 1;
    return ['1', 'true', 'yes', 'enabled'].includes(String(value || '').toLowerCase());
}

function normalizeIdentityDashboardUser(row = {}) {
    return {
        id: row.id || row.ID || null,
        displayName: row.displayName || row.display_name || 'Unknown User',
        mail: row.mail || null,
        userPrincipalName: row.userPrincipalName || row.user_principal_name || null,
        jobTitle: row.jobTitle || row.job_title || 'No Title',
        mobilePhone: row.mobilePhone || row.mobile_phone || 'N/A',
        roles: parseArray(row.roles),
        mfaEnabled: booleanValue(row.mfaEnabled ?? row.mfa_enabled),
        authMethodCount: numberValue(row.authMethodCount ?? row.auth_method_count),
        riskLevel: row.riskLevel || row.risk_level || 'SAFE',
        isExternal: booleanValue(row.isExternal ?? row.is_external),
        accountEnabled: row.accountEnabled ?? row.account_enabled ?? true,
        lastSignIn: {
            dateTime: row.lastSignIn?.dateTime || row.last_signin_datetime || null,
            daysSince: numberValue(row.lastSignIn?.daysSince ?? row.days_since_signin, 999),
            location: row.lastSignIn?.location || row.last_signin_location || 'Unknown',
            device: row.lastSignIn?.device || row.last_signin_device || 'Unknown',
            status: row.lastSignIn?.status || row.last_signin_status || null
        }
    };
}

function buildIdentityDashboardSource({ metricsRow = {}, usersRows = [], riskRow = {}, signInRow = {}, roleAssignments = [] } = {}) {
    const users = usersRows.map(normalizeIdentityDashboardUser);
    const totalUsers = numberValue(metricsRow.total_users, users.length);
    const mfaEnabled = numberValue(metricsRow.mfa_enabled_users, users.filter(user => user.mfaEnabled).length);
    const mfaCoverage = numberValue(metricsRow.mfa_percentage, totalUsers ? Math.round((mfaEnabled / totalUsers) * 100) : 0);
    const privilegedUsers = numberValue(metricsRow.admin_users, users.filter(user => user.roles.length > 0).length);
    const highRiskUsers = numberValue(metricsRow.high_risk_users, users.filter(user => String(user.riskLevel).toUpperCase() === 'HIGH').length);
    const externalUsers = users.filter(user => user.isExternal).length;
    const unknownDevices = numberValue(riskRow.device_unknown, users.filter(user => /unknown|n\/a/i.test(String(user.lastSignIn.device))).length);
    const signInIssues = numberValue(signInRow.failed_signin_count_24h, users.filter(user => /fail/i.test(String(user.lastSignIn.status || ''))).length);
    const roleCounts = new Map();
    for (const assignment of roleAssignments) {
        const principal = assignment.principalId || assignment.userId || assignment.userPrincipalName || assignment.principalName;
        if (principal) roleCounts.set(principal, (roleCounts.get(principal) || 0) + 1);
    }
    const multiplePrivilegedRoles = [...roleCounts.values()].filter(count => count > 1).length || users.filter(user => user.roles.length > 1).length;
    const securityScore = Math.round(
        (mfaCoverage * 0.4) +
        ((100 - (totalUsers > 0 ? (highRiskUsers / totalUsers) * 100 : 0)) * 0.3) +
        ((privilegedUsers <= 5 ? 100 : 50) * 0.3)
    );
    const dashboardMetrics = {
        totalUsers,
        activeUsers: numberValue(metricsRow.active_users_24h),
        mfaEnabled,
        mfaMissing: Math.max(0, totalUsers - mfaEnabled),
        mfaCoverage,
        privilegedUsers,
        adminsWithoutMfa: numberValue(metricsRow.privileged_users_without_mfa),
        highRiskUsers,
        signInIssues,
        externalUsers,
        unknownDevices,
        multiplePrivilegedRoles,
        securityScore
    };
    return {
        users,
        dashboardMetrics,
        legacyMetrics: {
            totalUsers,
            adminUsers: privilegedUsers,
            mfaEnabledUsers: mfaEnabled,
            mfaPercentage: mfaCoverage,
            highRiskUsers,
            mediumRiskUsers: numberValue(metricsRow.medium_risk_users),
            activeUsers24h: numberValue(metricsRow.active_users_24h),
            usersWithCompleteProfile: numberValue(metricsRow.users_with_complete_profile),
            privilegedUsersWithoutMFA: dashboardMetrics.adminsWithoutMfa,
            identityRiskScore: numberValue(metricsRow.identity_risk_score)
        }
    };
}

module.exports = {
    buildIdentityDashboardSource,
    normalizeIdentityDashboardUser
};

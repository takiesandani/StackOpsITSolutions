const { asArray, booleanFrom, buildContext, daysSince, numberFrom } = require('./common');

function getRoleNames(user) {
    const roles = user?.roles || user?.assignedRoles || user?.roleNames || [];
    return asArray(roles).map(role => typeof role === 'string' ? role : role.displayName || role.name || '').filter(Boolean);
}

function isPrivileged(user) {
    return Boolean(user?.hasAdminRole || user?.isPrivileged) ||
        getRoleNames(user).some(role => /(admin|global|privileged|security|directory)/i.test(role));
}

function getLastSignIn(user) {
    return user?.lastSignIn?.dateTime || user?.signInActivity?.lastSignInDateTime || user?.lastSignInDateTime || null;
}

function buildIdentityDashboardContext(source) {
    const users = asArray(source.evidence?.find(item => item?.evidenceType === 'users')?.data);
    const stored = source.metrics || {};
    const totalUsers = users.length || numberFrom(stored, ['TotalUsers', 'totalUsers']);
    const privilegedUsers = users.filter(isPrivileged);
    const usersWithoutMfa = users.filter(user => !booleanFrom(user.mfaEnabled ?? user.hasMfa ?? user.mfaRegistered));
    const highRiskUsers = users.filter(user => String(user.riskLevel || '').toUpperCase() === 'HIGH');
    const mediumRiskUsers = users.filter(user => String(user.riskLevel || '').toUpperCase() === 'MEDIUM');
    const externalUsers = users.filter(user => Boolean(user.isExternal) || String(user.userType || '').toLowerCase() === 'guest');
    const inactiveUsers = users.filter(user => daysSince(getLastSignIn(user)) > 30);
    const unknownDeviceUsers = users.filter(user => /unknown|no sign-in|n\/a/i.test(String(user?.lastSignIn?.device || user?.device || 'Unknown')));
    const failedSignInUsers = users.filter(user => /fail/i.test(String(user?.lastSignIn?.status || user?.signInStatus || '')) ||
        String(user.riskLevel || '').toUpperCase() === 'HIGH');
    const adminsWithoutMfa = privilegedUsers.filter(user => usersWithoutMfa.includes(user));
    const mfaEnabled = users.length ? users.length - usersWithoutMfa.length : numberFrom(stored, ['MFAEnabled', 'mfaEnabled']);
    const mfaMissing = users.length ? usersWithoutMfa.length : Math.max(0, totalUsers - mfaEnabled);
    const mfaCoverage = totalUsers ? Math.round((mfaEnabled / totalUsers) * 100) : 0;
    const dashboardSource = source.dashboardSourceMetrics || {};
    const dashboardMetrics = {
        totalUsers: numberFrom(dashboardSource, ['totalUsers'], totalUsers),
        activeUsers: numberFrom(dashboardSource, ['activeUsers'], users.length ? users.filter(user => daysSince(getLastSignIn(user)) <= 30).length : numberFrom(stored, ['ActiveUsers', 'activeUsers'])),
        mfaEnabled: numberFrom(dashboardSource, ['mfaEnabled'], mfaEnabled),
        mfaMissing: numberFrom(dashboardSource, ['mfaMissing'], mfaMissing),
        mfaCoverage: numberFrom(dashboardSource, ['mfaCoverage'], mfaCoverage),
        privilegedUsers: numberFrom(dashboardSource, ['privilegedUsers'], users.length ? privilegedUsers.length : numberFrom(stored, ['AdminRoles', 'adminRoles'])),
        highRiskUsers: numberFrom(dashboardSource, ['highRiskUsers'], highRiskUsers.length),
        mediumRiskUsers: numberFrom(dashboardSource, ['mediumRiskUsers'], mediumRiskUsers.length),
        externalUsers: numberFrom(dashboardSource, ['externalUsers'], externalUsers.length),
        inactiveUsers: numberFrom(dashboardSource, ['inactiveUsers'], inactiveUsers.length),
        signInIssues: numberFrom(dashboardSource, ['signInIssues'], failedSignInUsers.length),
        unknownDevices: numberFrom(dashboardSource, ['unknownDevices'], unknownDeviceUsers.length),
        adminsWithoutMfa: numberFrom(dashboardSource, ['adminsWithoutMfa'], adminsWithoutMfa.length),
        multiplePrivilegedRoles: numberFrom(dashboardSource, ['multiplePrivilegedRoles'], users.filter(user => getRoleNames(user).length > 1).length),
        securityScore: numberFrom(dashboardSource, ['securityScore'], numberFrom(stored, ['SecurityScore', 'securityScore']))
    };

    return buildContext(source, {
        dashboardMetrics,
        calculatedIndicators: {
            mfaCoverageStatus: dashboardMetrics.mfaCoverage >= 90 ? 'healthy' : dashboardMetrics.mfaCoverage >= 70 ? 'attention' : 'high_risk',
            privilegedMfaGap: dashboardMetrics.adminsWithoutMfa,
            identityRiskUsers: dashboardMetrics.highRiskUsers + dashboardMetrics.signInIssues
        },
        evidenceLists: {
            allUsers: users,
            usersWithoutMfa,
            privilegedUsers,
            highRiskUsers,
            adminsWithoutMfa,
            inactiveUsers,
            failedSignInUsers,
            externalUsers,
            unknownDeviceUsers
        },
        chartsData: {
            mfaCoverage: { enabled: dashboardMetrics.mfaEnabled, missing: dashboardMetrics.mfaMissing },
            riskDistribution: {
                high: dashboardMetrics.highRiskUsers,
                medium: dashboardMetrics.mediumRiskUsers,
                safe: Math.max(0, dashboardMetrics.totalUsers - dashboardMetrics.highRiskUsers - dashboardMetrics.mediumRiskUsers)
            },
            privilegeDistribution: {
                privileged: dashboardMetrics.privilegedUsers,
                standard: Math.max(0, dashboardMetrics.totalUsers - dashboardMetrics.privilegedUsers)
            }
        }
    });
}

module.exports = buildIdentityDashboardContext;

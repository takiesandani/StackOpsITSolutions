(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.IdentityPortalModel = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function toBooleanMfa(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value > 0;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      return normalized === 'true' || normalized === 'yes' || normalized === 'enabled' || normalized === '1';
    }
    return false;
  }

  function normalizeSunbirdIdentityUser(user = {}) {
    const rawSignIn = user.lastSignIn || {};
    const signInActivity = user.signInActivity || {};
    const dateTime = rawSignIn.dateTime || signInActivity.lastSignInDateTime || user.lastSignInDateTime || null;
    const lastSignInTime = dateTime ? new Date(dateTime).getTime() : 0;
    const daysSince = Number.isFinite(Number(rawSignIn.daysSince))
      ? Number(rawSignIn.daysSince)
      : lastSignInTime
        ? Math.floor((Date.now() - lastSignInTime) / (24 * 60 * 60 * 1000))
        : 999;
    return {
      ...user,
      signInActivity: {
        ...signInActivity,
        lastSignInDateTime: dateTime || signInActivity.lastSignInDateTime || null
      },
      lastSignIn: {
        ...rawSignIn,
        dateTime,
        location: rawSignIn.location || user.location || signInActivity.location || 'Unknown',
        device: rawSignIn.device || user.device || signInActivity.device || 'Unknown Device',
        status: rawSignIn.status || signInActivity.status || user.signInStatus || 'Success',
        daysSince
      }
    };
  }

  function getIdentityLastSignInTime(user) {
    const raw = user?.lastSignIn?.dateTime || user?.signInActivity?.lastSignInDateTime || null;
    const time = raw ? new Date(raw).getTime() : 0;
    return Number.isFinite(time) ? time : 0;
  }

  function getIdentityDaysSinceSignIn(user) {
    if (Number.isFinite(Number(user?.lastSignIn?.daysSince))) return Number(user.lastSignIn.daysSince);
    const time = getIdentityLastSignInTime(user);
    if (!time) return 999;
    return Math.floor((Date.now() - time) / (24 * 60 * 60 * 1000));
  }

  function getIdentityRoleNames(user) {
    const roles = Array.isArray(user?.roles) ? user.roles : [];
    return roles.map(role => typeof role === 'string' ? role : role?.name || role?.displayName || role?.roleName || '').filter(Boolean);
  }

  function isIdentityPrivileged(user) {
    return getIdentityRoleNames(user).some(role => /(admin|global|privileged|security|directory|exchange|sharepoint|compliance)/i.test(role));
  }

  function getIdentityRiskRank(user) {
    const risk = String(user?.riskLevel || 'SAFE').toUpperCase();
    if (risk === 'HIGH') return 3;
    if (risk === 'MEDIUM') return 2;
    return 1;
  }

  function getSunbirdSignInIssueReasons(user) {
    const reasons = [];
    const status = String(user?.lastSignIn?.status || '').toLowerCase();
    const location = String(user?.lastSignIn?.location || '').toLowerCase();
    const device = String(user?.lastSignIn?.device || '').toLowerCase();
    const risk = String(user?.riskLevel || '').toUpperCase();
    const daysSince = getIdentityDaysSinceSignIn(user);

    if (status.includes('fail')) reasons.push('Failed sign-in');
    if (risk === 'HIGH') reasons.push('High-risk user');
    if (location.includes('unknown') || location === 'no sign-in') reasons.push('Unknown location');
    if (device.includes('unknown') || device === 'no sign-in') reasons.push('Unknown device');
    if (daysSince > 30) reasons.push('Inactive sign-in');

    return reasons;
  }

  function buildSunbirdIdentityModel(data = {}) {
    const users = Array.isArray(data?.users) && data.users.length > 0
      ? data.users
      : Array.isArray(data?.identityUsers) && data.identityUsers.length > 0
        ? data.identityUsers
        : Array.isArray(data?.allUsers) && data.allUsers.length > 0
          ? data.allUsers
          : [];
    const summary = data?.summary || data?.identitySummary || {};
    const normalizedUsers = users.map(user => normalizeSunbirdIdentityUser(user));
    const totalUsers = normalizedUsers.length;
    const privilegedUsers = normalizedUsers.filter(isIdentityPrivileged);
    const mfaEnabledUsers = normalizedUsers.filter(user => toBooleanMfa(user.mfaEnabled));
    const mfaMissingUsers = normalizedUsers.filter(user => !toBooleanMfa(user.mfaEnabled));
    const highRiskUsers = normalizedUsers.filter(user => String(user.riskLevel || '').toUpperCase() === 'HIGH');
    const mediumRiskUsers = normalizedUsers.filter(user => String(user.riskLevel || '').toUpperCase() === 'MEDIUM');
    const safeUsers = Math.max(0, totalUsers - highRiskUsers.length - mediumRiskUsers.length);
    const externalUsers = normalizedUsers.filter(user => user.isExternal);
    const inactiveUsers = normalizedUsers.filter(user => getIdentityDaysSinceSignIn(user) > 30);
    const unknownDeviceUsers = normalizedUsers.filter(user => /unknown|no sign-in|n\/a/i.test(String(user?.lastSignIn?.device || 'Unknown')));
    const adminsWithoutMfa = privilegedUsers.filter(user => !toBooleanMfa(user.mfaEnabled));
    const failedSignInUsers = normalizedUsers.filter(user => getSunbirdSignInIssueReasons(user).length > 0);
    const multiplePrivilegedRoles = normalizedUsers.filter(user => getIdentityRoleNames(user).filter(role => /(admin|global|privileged|security|directory)/i.test(role)).length > 1);

    const mfaCoverage = summary?.mfaCoverage != null
      ? Number(summary.mfaCoverage)
      : summary?.mfaEnabledPercentage != null
        ? Number(summary.mfaEnabledPercentage)
        : totalUsers
          ? Math.round((mfaEnabledUsers.length / totalUsers) * 100)
          : 0;
    const highRiskCount = summary?.highRiskUsers != null
      ? Number(summary.highRiskUsers)
      : highRiskUsers.length;
    const privilegedWithoutMfaCount = summary?.privilegedUsersWithoutMFA != null
      ? Number(summary.privilegedUsersWithoutMFA)
      : adminsWithoutMfa.length;
    const missingMfaCount = summary?.missingMfaUsers != null
      ? Number(summary.missingMfaUsers)
      : mfaMissingUsers.length;
    const signInIssueCount = summary?.signInIssues != null
      ? Number(summary.signInIssues)
      : failedSignInUsers.length;
    const unknownDeviceCount = summary?.unknownDevices != null
      ? Number(summary.unknownDevices)
      : unknownDeviceUsers.length;

    return {
      users: normalizedUsers,
      metrics: {
        totalUsers,
        mfaEnabled: mfaEnabledUsers.length,
        mfaMissing: mfaMissingUsers.length,
        mfaCoverage,
        privilegedUsers: privilegedUsers.length,
        highRiskUsers: highRiskCount,
        mediumRiskUsers: mediumRiskUsers.length,
        safeUsers,
        externalUsers: externalUsers.length,
        inactiveUsers: inactiveUsers.length,
        failedSignIns: signInIssueCount,
        unknownDevices: unknownDeviceCount,
        adminsWithoutMfa: privilegedWithoutMfaCount,
        multiplePrivilegedRoles: multiplePrivilegedRoles.length,
        missingMfaUsers: missingMfaCount,
        signInIssues: signInIssueCount,
        privilegedUsersWithoutMFA: privilegedWithoutMfaCount,
        unknownDeviceUsers: unknownDeviceCount
      },
      evidence: {
        allUsers: normalizedUsers,
        mfaEnabledUsers,
        mfaMissingUsers,
        privilegedUsers,
        highRiskUsers,
        adminsWithoutMfa,
        usersWithoutMfa: mfaMissingUsers,
        inactiveUsers,
        failedSignInUsers,
        externalUsers,
        unknownDeviceUsers,
        multiplePrivilegedRoles
      },
      summary: {
        title: summary?.title || 'Identity Protection',
        executiveSummary: summary?.executiveSummary || summary?.domainExecutiveSummary || ''
      }
    };
  }

  return {
    toBooleanMfa,
    normalizeSunbirdIdentityUser,
    getIdentityLastSignInTime,
    getIdentityDaysSinceSignIn,
    getIdentityRoleNames,
    isIdentityPrivileged,
    getIdentityRiskRank,
    getSunbirdSignInIssueReasons,
    buildSunbirdIdentityModel
  };
});

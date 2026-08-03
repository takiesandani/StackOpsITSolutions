const { buildSunbirdIdentityModel } = require('../../js/identity-portal-model');

function normalizeIdentityText(value, fallback = '—') {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'string') {
    const text = value.trim();
    return text || fallback;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

function normalizeIdentityValue(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'object') return value;
  return value;
}

function flattenIdentityValue(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  return [value];
}

function pickFirstValue(source, keys) {
  for (const key of keys) {
    if (source && Object.prototype.hasOwnProperty.call(source, key) && source[key] != null && source[key] !== '') {
      return source[key];
    }
  }
  return null;
}

function toDisplayName(entity) {
  return normalizeIdentityText(pickFirstValue(entity, ['displayName', 'display_name', 'name', 'entityName', 'userPrincipalName', 'email', 'mail']), 'Unknown');
}

function toEmail(entity) {
  return normalizeIdentityText(pickFirstValue(entity, ['userPrincipalName', 'email', 'mail', 'entityEmail', 'emailAddress']), '—');
}

function toRoles(entity) {
  const roles = normalizeIdentityValue(pickFirstValue(entity, ['roles', 'roleAssignments', 'roleNames'])) || [];
  if (Array.isArray(roles)) {
    return roles.map(role => normalizeIdentityText(typeof role === 'string' ? role : role?.name || role?.displayName || role?.roleName, '—')).filter(Boolean);
  }
  return normalizeIdentityText(roles, '—');
}

function yesNo(value) {
  return value === true || value === 'true' || value === 'True' || value === 'yes' || value === 1 || value === '1' ? 'Yes' : 'No';
}

function toRiskLevel(value) {
  const normalized = normalizeIdentityText(value, '—');
  if (normalized === '—') return '—';
  return normalized;
}

function toAccountStatus(value) {
  const normalized = normalizeIdentityText(value, '—');
  return normalized === '—' ? '—' : normalized;
}

function toMfaStatus(entity) {
  const value = entity?.mfaEnabled ?? entity?.hasMfa ?? entity?.mfaRegistered ?? entity?.mfa ?? null;
  return yesNo(value);
}

function toLastSignIn(entity) {
  const lastSignIn = normalizeIdentityValue(pickFirstValue(entity, ['lastSignIn', 'signIn'])) || {};
  const iso = pickFirstValue(lastSignIn, ['dateTime', 'createdDateTime', 'lastSignInDateTime']);
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return normalizeIdentityText(iso, '—');
  return `${date.toISOString().slice(0, 10)}`;
}

function toDaysSinceLastSignIn(entity) {
  const lastSignIn = normalizeIdentityValue(pickFirstValue(entity, ['lastSignIn', 'signIn'])) || {};
  const days = pickFirstValue(lastSignIn, ['daysSince', 'daysSinceSignIn']);
  if (days === null || days === undefined || days === '') return '—';
  return String(days);
}

function toDevice(entity) {
  const lastSignIn = normalizeIdentityValue(pickFirstValue(entity, ['lastSignIn', 'signIn'])) || {};
  return normalizeIdentityText(pickFirstValue(lastSignIn, ['device', 'deviceName', 'displayName']), '—');
}

function toLocation(entity) {
  const lastSignIn = normalizeIdentityValue(pickFirstValue(entity, ['lastSignIn', 'signIn'])) || {};
  return normalizeIdentityText(pickFirstValue(lastSignIn, ['location', 'locationName', 'city']), '—');
}

function getIdentityEvidenceColumns(entity, findingType = 'general') {
  const columns = [];
  const hasName = Boolean(entity?.displayName || entity?.name || entity?.entityName || entity?.userPrincipalName || entity?.email || entity?.mail);
  if (hasName) columns.push('Name');
  const hasEmail = Boolean(entity?.userPrincipalName || entity?.email || entity?.mail || entity?.entityEmail);
  if (hasEmail) columns.push('Email');
  const hasRoles = Boolean(entity?.roles?.length || entity?.roleAssignments?.length || entity?.roleNames?.length) && /privileged|admin/i.test(String(findingType));
  if (hasRoles) columns.push('Role(s)');
  const hasMfa = entity?.mfaEnabled != null || entity?.hasMfa != null || entity?.authMethods != null;
  if (hasMfa) columns.push('MFA');
  const hasRisk = entity?.riskLevel || entity?.risk || entity?.riskState;
  if (hasRisk) columns.push('Risk');
  const hasLastSignIn = entity?.lastSignIn || entity?.signIn;
  if (hasLastSignIn) columns.push('Last Sign In');
  const hasDays = entity?.lastSignIn?.daysSince != null || entity?.daysSinceLastSignIn != null || entity?.signIn?.daysSince != null;
  if (hasDays) columns.push('Days Inactive');
  const hasDevice = Boolean(entity?.lastSignIn?.device || entity?.device || entity?.deviceName);
  if (hasDevice) columns.push('Device');
  const hasLocation = Boolean(entity?.lastSignIn?.location || entity?.location || entity?.locationName);
  if (hasLocation) columns.push('Location');

  if (!columns.length) {
    columns.push('Name');
    if (hasEmail) columns.push('Email');
    if (hasMfa) columns.push('MFA');
    if (hasRisk) columns.push('Risk');
  }
  return columns;
}

function buildIdentityEvidenceRows(items, columns) {
  return items.slice(0, 8).map(entity => {
    const row = {};
    if (columns.includes('Name')) row['Name'] = toDisplayName(entity);
    if (columns.includes('Email')) row['Email'] = toEmail(entity);
    if (columns.includes('Role(s)')) row['Role(s)'] = Array.isArray(toRoles(entity)) ? toRoles(entity).join('\n') : toRoles(entity);
    if (columns.includes('MFA')) row['MFA'] = toMfaStatus(entity);
    if (columns.includes('Risk')) row['Risk'] = toRiskLevel(entity?.riskLevel || entity?.risk || entity?.riskState);
    if (columns.includes('Last Sign In')) row['Last Sign In'] = toLastSignIn(entity);
    if (columns.includes('Days Inactive')) row['Days Inactive'] = toDaysSinceLastSignIn(entity);
    if (columns.includes('Device')) row['Device'] = toDevice(entity);
    if (columns.includes('Location')) row['Location'] = toLocation(entity);
    return row;
  });
}

function buildProcessedIdentityFindings(identityModel, output) {
  const metrics = identityModel?.metrics || {};
  const evidence = identityModel?.evidence || {};
  const findings = [];

  if (metrics.missingMfaUsers > 0 || evidence.mfaMissingUsers?.length) {
    findings.push({
      title: 'Missing MFA',
      severity: 'High',
      businessImpact: 'Users without MFA are more exposed to credential theft and phishing-led account compromise.',
      recommendations: ['Enforce MFA for all users.', 'Review registration gaps and remind affected users to enrol.'],
      evidenceItems: evidence.mfaMissingUsers || [],
      findingType: 'missing-mfa'
    });
  }

  if (metrics.highRiskUsers > 0 || evidence.highRiskUsers?.length) {
    findings.push({
      title: 'High Risk Users',
      severity: 'High',
      businessImpact: 'High-risk accounts warrant immediate review because they can materially increase tenant exposure.',
      recommendations: ['Review high-risk accounts and confirm their current access and sign-in posture.'],
      evidenceItems: evidence.highRiskUsers || [],
      findingType: 'high-risk'
    });
  }

  if (metrics.privilegedUsersWithoutMFA > 0 || evidence.adminsWithoutMfa?.length) {
    findings.push({
      title: 'Privileged Users Without MFA',
      severity: 'Critical',
      businessImpact: 'Privileged accounts without MFA create an immediate path for administrative compromise.',
      recommendations: ['Require phishing-resistant MFA for privileged accounts.', 'Remove unnecessary administrator access where it is no longer needed.'],
      evidenceItems: evidence.adminsWithoutMfa || [],
      findingType: 'privileged'
    });
  }

  if (metrics.unknownDevices > 0 || evidence.unknownDeviceUsers?.length) {
    findings.push({
      title: 'Unknown Devices',
      severity: 'Medium',
      businessImpact: 'Unknown devices can indicate unmanaged access or weak device trust controls.',
      recommendations: ['Review unknown devices and verify that they are approved for access.'],
      evidenceItems: evidence.unknownDeviceUsers || [],
      findingType: 'unknown-device'
    });
  }

  if (metrics.signInIssues > 0 || evidence.failedSignInUsers?.length) {
    findings.push({
      title: 'Sign-In Issues',
      severity: 'Medium',
      businessImpact: 'Repeated sign-in issues can point to account lockouts, failed authentication, or abnormal access behaviour.',
      recommendations: ['Investigate failed sign-ins and reset or remediate affected accounts as needed.'],
      evidenceItems: evidence.failedSignInUsers || [],
      findingType: 'sign-in'
    });
  }

  return findings;
}

function buildIdentityPdfViewModel(report) {
  const output = report?.intelligenceOutput || report?.output || {};
  const summary = output.summary || {};
  const identityModel = report?.identityModel || report?.processedIdentityModel || null;
  const processedFindings = identityModel ? buildProcessedIdentityFindings(identityModel, output) : [];
  const findings = processedFindings.length
    ? processedFindings.map(finding => {
        const evidenceItems = flattenIdentityValue(finding.evidenceItems || []);
        const columns = getIdentityEvidenceColumns(evidenceItems[0] || finding, finding.findingType || 'general');
        return {
          title: normalizeIdentityText(finding.title, 'Finding'),
          severity: normalizeIdentityText(finding.severity, 'Medium'),
          businessImpact: normalizeIdentityText(finding.businessImpact, 'Business impact is included in the stored intelligence output.'),
          recommendations: (Array.isArray(finding.recommendations) ? finding.recommendations : []).map(item => normalizeIdentityText(item, 'Review the recommended action.')),
          evidence: {
            columns,
            rows: buildIdentityEvidenceRows(evidenceItems, columns),
            totalCount: evidenceItems.length,
            displayedCount: Math.min(evidenceItems.length, 8)
          }
        };
      })
    : flattenIdentityValue(output.keyFindings || output.findings || []).map(finding => {
        const evidenceItems = flattenIdentityValue(finding?.affectedEntities || finding?.evidenceRows || []);
        const columns = getIdentityEvidenceColumns(evidenceItems[0] || finding, 'general');
        return {
          title: normalizeIdentityText(finding?.title || finding?.name, 'Finding'),
          severity: normalizeIdentityText(finding?.severity || finding?.riskLevel || finding?.priority, 'Medium'),
          businessImpact: normalizeIdentityText(finding?.businessImpact || finding?.businessReason || output.businessImpact, 'Business impact is included in the stored intelligence output.'),
          recommendations: [
            ...(Array.isArray(finding?.recommendedActions) ? finding.recommendedActions : []),
            ...(Array.isArray(finding?.recommendations) ? finding.recommendations : []),
            ...(finding?.recommendation ? [finding.recommendation] : []),
            ...(Array.isArray(output.recommendations) ? output.recommendations.map(item => item?.title || item?.recommendation || item?.detail).filter(Boolean) : [])
          ].filter(Boolean).map(item => normalizeIdentityText(item, 'Review the recommended action.')),
          evidence: {
            columns,
            rows: buildIdentityEvidenceRows(evidenceItems, columns),
            totalCount: evidenceItems.length,
            displayedCount: Math.min(evidenceItems.length, 8)
          }
        };
      });

  const portalSummary = identityModel?.summary || {};
  const metrics = identityModel?.metrics || {};
  const effectiveMetrics = {
    totalUsers: Number(metrics.totalUsers ?? summary.totalUsers ?? summary.totalUsersCount ?? 0),
    mfaCoverage: Number(metrics.mfaCoverage ?? summary.mfaEnabledPercentage ?? summary.mfaCoverage ?? 0),
    highRiskUsers: Number(metrics.highRiskUsers ?? summary.highRiskUsers ?? summary.highRiskCount ?? 0),
    privilegedUsersWithoutMFA: Number(metrics.privilegedUsersWithoutMFA ?? metrics.adminsWithoutMfa ?? summary.privilegedUsersWithoutMFA ?? summary.adminsWithoutMfa ?? 0),
    activeUsers24h: Number(metrics.activeUsers24h ?? summary.activeUsers24h ?? summary.activeUsers ?? 0),
    identityRiskScore: Number(metrics.identityRiskScore ?? summary.identityRiskScore ?? summary.securityScore ?? 0)
  };

  return {
    domainKey: report?.domainKey || 'identity',
    domainName: report?.domainName || 'Identity Protection',
    summary: {
      title: portalSummary.title || report?.domainName || 'Identity Protection',
      executiveSummary: normalizeIdentityText(portalSummary.executiveSummary || output.domainExecutiveSummary || output.executiveSummary || output.summary || output.currentPosture, 'No executive summary is available.'),
      businessImpact: normalizeIdentityText(output.businessImpact || output.businessImpactSummary || output.technicalSummary, 'Business impact is included in the stored intelligence output.'),
      metrics: effectiveMetrics
    },
    findings
  };
}

module.exports = { buildIdentityPdfViewModel };

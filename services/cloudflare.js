const axios = require('axios');

const CLOUDFLARE_BASE_URL = 'https://api.cloudflare.com/client/v4';

const CLOUDFLARE_ENDPOINTS = [
  { key: 'account', label: 'Account Information', path: accountId => `/accounts/${accountId}` },
  { key: 'apps', label: 'Access Applications', path: accountId => `/accounts/${accountId}/access/apps` },
  { key: 'identityProviders', label: 'Identity Providers', path: accountId => `/accounts/${accountId}/access/identity_providers` },
  { key: 'policies', label: 'Access Policies', path: accountId => `/accounts/${accountId}/access/policies` },
  { key: 'devices', label: 'Devices', path: accountId => `/accounts/${accountId}/devices` },
  { key: 'deviceRegistrations', label: 'Device Registrations', path: accountId => `/accounts/${accountId}/devices/registrations` },
  { key: 'devicePosture', label: 'Device Posture', path: accountId => `/accounts/${accountId}/devices/posture` },
  { key: 'warpProfiles', label: 'WARP Profiles', path: accountId => `/accounts/${accountId}/devices/policies` },
  { key: 'gatewayRules', label: 'Gateway Rules', path: accountId => `/accounts/${accountId}/gateway/rules` },
  { key: 'gatewayConfig', label: 'Gateway Configuration', path: accountId => `/accounts/${accountId}/gateway/configuration` },
  { key: 'gatewayAppTypes', label: 'Gateway App Categories', path: accountId => `/accounts/${accountId}/gateway/app_types` },
  { key: 'virtualNetworks', label: 'Virtual Networks', path: accountId => `/accounts/${accountId}/teamnet/virtual_networks` },
  { key: 'accessLogs', label: 'Access Logs', path: accountId => `/accounts/${accountId}/access/logs/access_requests` },
  { key: 'dlpProfiles', label: 'DLP Profiles', path: accountId => `/accounts/${accountId}/dlp/profiles` },
  { key: 'zones', label: 'Zones', path: () => '/zones' }
];

function getList(result) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.result)) return result.result;
  if (Array.isArray(result?.result_info?.result)) return result.result_info.result;
  return [];
}

function firstDefined(...values) {
  return values.find(value => value !== undefined && value !== null && value !== '');
}

function toIso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function getTimeValue(value) {
  const date = new Date(value || 0);
  return Number.isFinite(date.getTime()) ? date.getTime() : 0;
}

function maskSensitiveObject(input) {
  if (!input || typeof input !== 'object') return input;
  if (Array.isArray(input)) return input.map(maskSensitiveObject);

  const masked = {};
  Object.entries(input).forEach(([key, value]) => {
    if (/token|secret|private|certificate|cert|public_key|serial|mac|key/i.test(key)) {
      masked[key] = value ? 'masked' : value;
    } else if (value && typeof value === 'object') {
      masked[key] = maskSensitiveObject(value);
    } else {
      masked[key] = value;
    }
  });
  return masked;
}

function sanitizeAccount(data) {
  const result = data?.result || data || {};
  return {
    id: result.id || null,
    name: result.name || 'Cloudflare Account',
    type: result.type || null,
    createdOn: toIso(result.created_on),
    settings: maskSensitiveObject(result.settings || {})
  };
}

function sanitizeApp(app) {
  return {
    id: app.id || null,
    name: app.name || app.aud || 'Access app',
    type: app.type || app.app_launcher_visible || 'self_hosted',
    domain: app.domain || app.hostname || null,
    sessionDuration: app.session_duration || app.sessionDuration || null,
    policies: Array.isArray(app.policies) ? app.policies.map(policy => ({
      id: policy.id || null,
      name: policy.name || 'Policy',
      decision: policy.decision || null
    })) : []
  };
}

function sanitizeIdentityProvider(provider) {
  return {
    id: provider.id || null,
    name: provider.name || provider.type || 'Identity provider',
    type: provider.type || null,
    status: provider.id ? 'active' : 'configured'
  };
}

function sanitizePolicy(policy) {
  return {
    id: policy.id || null,
    name: policy.name || 'Access policy',
    decision: policy.decision || null,
    sessionDuration: policy.session_duration || null,
    includes: Array.isArray(policy.include) ? policy.include.map(maskSensitiveObject) : [],
    requires: Array.isArray(policy.require) ? policy.require.map(maskSensitiveObject) : []
  };
}

function sanitizeDevice(device) {
  return {
    id: device.id || device.device_id || null,
    name: firstDefined(device.name, device.hostname, device.device_name, device.serial_number, 'Device'),
    userEmail: firstDefined(device.user?.email, device.email, device.owner?.email, device.user_email, null),
    os: firstDefined(device.os, device.os_version, device.platform, device.device_type, null),
    model: firstDefined(device.model, device.manufacturer, null),
    warpVersion: firstDefined(device.warp_version, device.version, device.client_version, null),
    lastSeen: toIso(firstDefined(device.last_seen, device.last_seen_at, device.updated_at, device.created_at)),
    ipAddress: firstDefined(device.ip, device.ip_address, device.client_ip, null),
    status: firstDefined(device.status, device.active === false ? 'inactive' : 'active')
  };
}

function sanitizeRegistration(registration) {
  return {
    id: registration.id || null,
    deviceName: firstDefined(registration.device?.name, registration.name, registration.hostname, 'Registered device'),
    userEmail: firstDefined(registration.user?.email, registration.email, registration.user_email, null),
    virtualIpv4: firstDefined(registration.virtual_ipv4, registration.vnet_ipv4, registration.ipv4, null),
    virtualIpv6: firstDefined(registration.virtual_ipv6, registration.vnet_ipv6, registration.ipv6, null),
    tunnelType: firstDefined(registration.tunnel_type, registration.tunnelType, null),
    lastSeen: toIso(firstDefined(registration.last_seen, registration.last_seen_at, registration.updated_at)),
    status: firstDefined(registration.status, 'registered')
  };
}

function sanitizeGatewayRule(rule) {
  return {
    id: rule.id || null,
    name: rule.name || 'Gateway rule',
    action: rule.action || null,
    enabled: rule.enabled !== false,
    precedence: rule.precedence ?? null,
    traffic: rule.traffic || null,
    filters: Array.isArray(rule.filters) ? rule.filters : []
  };
}

function sanitizeWarpProfile(profile) {
  return {
    id: profile.id || null,
    name: profile.name || 'WARP profile',
    enabled: profile.enabled !== false,
    allowModeSwitch: profile.allow_mode_switch ?? null,
    allowUpdates: profile.allow_updates ?? null,
    allowedToLeave: profile.allowed_to_leave ?? null,
    autoConnect: profile.auto_connect ?? null,
    serviceMode: firstDefined(profile.service_mode, profile.serviceMode, null),
    precedence: profile.precedence ?? null
  };
}

function sanitizeAccessLog(log) {
  return {
    id: log.id || log.ray_id || null,
    userEmail: firstDefined(log.user_email, log.email, log.actor?.email, log.user?.email, null),
    appName: firstDefined(log.app_name, log.application?.name, log.aud, 'Access request'),
    action: firstDefined(log.action, log.decision, log.allowed === false ? 'blocked' : 'allowed'),
    connection: firstDefined(log.connection, log.connection_method, log.login_method, null),
    country: firstDefined(log.country, log.location?.country, null),
    ipAddress: firstDefined(log.ip_address, log.ip, log.client_ip, null),
    allowed: log.allowed !== false && log.action !== 'blocked',
    timestamp: toIso(firstDefined(log.created_at, log.timestamp, log.datetime, log.time)),
    rayId: log.ray_id || null
  };
}

function sanitizeDlpProfile(profile) {
  return {
    id: profile.id || null,
    name: profile.name || 'DLP profile',
    enabled: profile.enabled !== false,
    entries: Array.isArray(profile.entries) ? profile.entries.length : 0,
    detections: Array.isArray(profile.allowed_match_count) ? profile.allowed_match_count.length : null
  };
}

function summarizeSectionError(error) {
  const response = error?.response;
  const status = response?.status || 500;
  const cfErrors = Array.isArray(response?.data?.errors) ? response.data.errors : [];
  const code = cfErrors[0]?.code || null;
  const message = cfErrors[0]?.message || error.message || 'Cloudflare request failed';
  const permissionUnavailable = status === 403 || Number(code) === 9109;

  return {
    status: permissionUnavailable ? 'permission_unavailable' : 'error',
    httpStatus: status,
    code,
    message: permissionUnavailable ? 'Permission not available' : message
  };
}

async function fetchCloudflareEndpoint(client, endpoint, accountId) {
  const response = await client.get(endpoint.path(accountId));
  return response.data;
}

function buildSectionStatuses(results) {
  return results.reduce((sections, item) => {
    sections[item.key] = {
      label: item.label,
      status: item.status,
      message: item.message || null,
      count: item.count ?? null
    };
    return sections;
  }, {});
}

function countEnabled(items) {
  return items.filter(item => item.enabled !== false).length;
}

function normalizeCloudflarePayload(raw) {
  const byKey = raw.reduce((acc, item) => {
    acc[item.key] = item;
    return acc;
  }, {});

  const apps = getList(byKey.apps?.data).map(sanitizeApp);
  const identityProviders = getList(byKey.identityProviders?.data).map(sanitizeIdentityProvider);
  const policies = getList(byKey.policies?.data).map(sanitizePolicy);
  const devices = getList(byKey.devices?.data).map(sanitizeDevice);
  const deviceRegistrations = getList(byKey.deviceRegistrations?.data).map(sanitizeRegistration);
  const devicePosture = getList(byKey.devicePosture?.data).map(item => ({
    id: item.id || null,
    name: item.name || item.type || 'Posture check',
    type: item.type || null,
    enabled: item.enabled !== false
  }));
  const gatewayRules = getList(byKey.gatewayRules?.data).map(sanitizeGatewayRule);
  const gatewayConfig = maskSensitiveObject(byKey.gatewayConfig?.data?.result || byKey.gatewayConfig?.data || {});
  const warpProfiles = getList(byKey.warpProfiles?.data).map(sanitizeWarpProfile);
  const gatewayAppTypes = getList(byKey.gatewayAppTypes?.data).map(item => ({
    id: item.id || item.name || null,
    name: item.name || item.type || 'App category'
  }));
  const virtualNetworks = getList(byKey.virtualNetworks?.data).map(network => ({
    id: network.id || null,
    name: network.name || 'Virtual network',
    isDefault: Boolean(network.is_default || network.default)
  }));
  const accessLogs = getList(byKey.accessLogs?.data)
    .map(sanitizeAccessLog)
    .sort((a, b) => getTimeValue(b.timestamp) - getTimeValue(a.timestamp));
  const dlpProfiles = getList(byKey.dlpProfiles?.data).map(sanitizeDlpProfile);
  const zones = getList(byKey.zones?.data).map(zone => ({ id: zone.id || null, name: zone.name || 'Zone' }));
  const account = byKey.account?.status === 'ok' ? sanitizeAccount(byKey.account.data) : {};

  const activeGatewayPolicies = countEnabled(gatewayRules);
  const latestAccessEvent = accessLogs[0]?.timestamp || null;
  const identityProvider = identityProviders.find(provider => /azure/i.test(provider.name || provider.type || '')) || identityProviders[0] || null;
  const gatewayProxyEnabled = Boolean(gatewayConfig.gateway_proxy_enabled);
  const udpProxyEnabled = Boolean(gatewayConfig.gateway_udp_proxy_enabled);
  const certificateEnabled = Boolean(gatewayConfig.root_certificate_installation_enabled);

  const overview = {
    securityStatus: apps.length || devices.length || activeGatewayPolicies ? 'Active' : 'No data configured',
    protectedApps: apps.length,
    enrolledDevices: devices.length,
    registeredWarpDevices: deviceRegistrations.length,
    gatewayPolicies: gatewayRules.length,
    activeGatewayPolicies,
    identityProviders: identityProviders.length,
    identityProvider: identityProvider?.name || 'Not configured',
    recentAccessEvents: accessLogs.length,
    lastAccessEvent: latestAccessEvent,
    dlpProfiles: dlpProfiles.length,
    warpProfiles: warpProfiles.length,
    virtualNetworks: virtualNetworks.length,
    appCategories: gatewayAppTypes.length,
    gatewayProxyEnabled,
    udpProxyEnabled,
    certificateEnabled,
    tlsDecryptEnabled: certificateEnabled,
    zonesAvailable: zones.length
  };

  const sectionResults = raw.map(item => ({
    key: item.key,
    label: item.label,
    status: item.status,
    message: item.message,
    count: Array.isArray(getList(item.data)) ? getList(item.data).length : null
  }));

  return {
    success: true,
    fetchedAt: new Date().toISOString(),
    account,
    overview,
    apps,
    identityProviders,
    policies,
    devices,
    deviceRegistrations,
    devicePosture,
    gatewayRules,
    gatewayConfig,
    warpProfiles,
    accessLogs,
    virtualNetworks,
    gatewayAppTypes,
    dlpProfiles,
    zones,
    sections: buildSectionStatuses(sectionResults)
  };
}

async function resolveCloudflareSecret(secretName, getSecret) {
  if (typeof getSecret === 'function') {
    const value = await getSecret(secretName);
    if (value) return value;
  }
  return process.env[secretName] || null;
}

async function getCloudflareNetworkSecuritySummary(options = {}) {
  const accountId = options.accountId || await resolveCloudflareSecret('CLOUDFLARE_ACCOUNT_ID', options.getSecret);
  const apiToken = options.apiToken || await resolveCloudflareSecret('CLOUDFLARE_API_TOKEN', options.getSecret);

  if (!accountId || !apiToken) {
    const missing = [
      !accountId ? 'CLOUDFLARE_ACCOUNT_ID' : null,
      !apiToken ? 'CLOUDFLARE_API_TOKEN' : null
    ].filter(Boolean);

    const error = new Error(`Missing Cloudflare environment variable(s): ${missing.join(', ')}`);
    error.statusCode = 503;
    throw error;
  }

  const client = axios.create({
    baseURL: CLOUDFLARE_BASE_URL,
    timeout: 15000,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json'
    }
  });

  const settled = await Promise.allSettled(
    CLOUDFLARE_ENDPOINTS.map(endpoint => fetchCloudflareEndpoint(client, endpoint, accountId))
  );

  const raw = CLOUDFLARE_ENDPOINTS.map((endpoint, index) => {
    const result = settled[index];
    if (result.status === 'fulfilled') {
      const count = getList(result.value).length;
      return {
        key: endpoint.key,
        label: endpoint.label,
        status: count === 0 && endpoint.key !== 'account' && endpoint.key !== 'gatewayConfig' ? 'empty' : 'ok',
        message: count === 0 && endpoint.key !== 'account' && endpoint.key !== 'gatewayConfig' ? 'No data configured' : null,
        data: result.value
      };
    }

    return {
      key: endpoint.key,
      label: endpoint.label,
      ...summarizeSectionError(result.reason),
      data: null
    };
  });

  return normalizeCloudflarePayload(raw);
}

module.exports = {
  getCloudflareNetworkSecuritySummary
};

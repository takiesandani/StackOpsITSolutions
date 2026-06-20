const buildIdentityDashboardContext = require('./identityDashboardContext');
const buildDevicesDashboardContext = require('./devicesDashboardContext');
const buildSecurityAlertsDashboardContext = require('./securityAlertsDashboardContext');
const buildEmailSecurityDashboardContext = require('./emailSecurityDashboardContext');
const buildApplicationsDashboardContext = require('./applicationsDashboardContext');
const buildBackupDashboardContext = require('./backupDashboardContext');
const buildGovernanceDashboardContext = require('./governanceDashboardContext');
const buildComplianceDashboardContext = require('./complianceDashboardContext');
const buildCloudflareDashboardContext = require('./cloudflareDashboardContext');
const buildOperationsDashboardContext = require('./operationsDashboardContext');
const { buildContext } = require('./common');

const BUILDERS = {
    identity: buildIdentityDashboardContext,
    devices: buildDevicesDashboardContext,
    security_alerts: buildSecurityAlertsDashboardContext,
    email_security: buildEmailSecurityDashboardContext,
    applications: buildApplicationsDashboardContext,
    backup: buildBackupDashboardContext,
    governance: buildGovernanceDashboardContext,
    compliance: buildComplianceDashboardContext,
    cloudflare_network_security: buildCloudflareDashboardContext,
    operations: buildOperationsDashboardContext
};

function buildDashboardIntelligenceContext(source) {
    const builder = BUILDERS[source.sourceKey];
    return builder ? builder(source) : buildContext(source, { dashboardMetrics: source.metrics });
}

function buildDashboardIntelligenceContexts(sources) {
    return sources.map(buildDashboardIntelligenceContext);
}

module.exports = {
    BUILDERS,
    buildDashboardIntelligenceContext,
    buildDashboardIntelligenceContexts
};

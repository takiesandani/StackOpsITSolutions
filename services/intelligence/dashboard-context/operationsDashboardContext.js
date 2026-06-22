const { asArray, buildContext, numberFrom, payloadFromSource } = require('./common');

function normalizedStatus(value) {
    return String(value || '').trim().toLowerCase();
}

function buildOperationsDashboardContext(source) {
    const payload = payloadFromSource(source);
    const tasks = asArray(payload.tasks || payload.items);
    const summary = payload.summary || source.metrics || {};
    const highPriorityTasks = tasks.filter(task => ['critical', 'high'].includes(normalizedStatus(task.priority || task.severity))).length;
    const mediumPriorityTasks = tasks.filter(task => normalizedStatus(task.priority || task.severity) === 'medium').length;
    const failedTasks = tasks.filter(task => ['failed', 'error', 'blocked'].includes(normalizedStatus(task.status))).length;
    const completedTasks = tasks.filter(task => ['completed', 'complete', 'resolved', 'closed', 'done'].includes(normalizedStatus(task.status))).length;
    const activeIncidents = asArray(payload.incidents).filter(incident =>
        !['resolved', 'closed', 'completed'].includes(normalizedStatus(incident.status))
    ).length;
    const totalTasks = tasks.length || numberFrom(summary, ['totalTasks', 'taskCount', 'openTasks']);
    const explicitHealth = numberFrom(summary, [
        'operationsHealthScore', 'operationsHealth', 'operationalHealth', 'healthScore',
        'availabilityScore', 'successRate', 'uptimePercentage'
    ], null);
    const taskPenalty = totalTasks > 0
        ? ((highPriorityTasks / totalTasks) * 35) + ((failedTasks / totalTasks) * 40)
        : 0;
    const operationsHealthScore = explicitHealth == null
        ? Math.max(0, Math.round(100 - Math.min(80, taskPenalty + Math.min(25, activeIncidents * 5))))
        : Math.max(0, Math.min(100, explicitHealth));

    return buildContext(source, {
        dashboardMetrics: {
            ...summary,
            totalTasks,
            highPriorityTasks,
            mediumPriorityTasks,
            failedTasks,
            completedTasks,
            activeIncidents
        },
        calculatedIndicators: {
            ...(payload.calculatedIndicators || payload.scores || {}),
            operationsHealthScore,
            operationsAttentionRequired: highPriorityTasks > 0 || failedTasks > 0 || activeIncidents > 0
        },
        evidenceLists: {
            operationalEvidence: asArray(payload.evidence || payload.items || payload.tasks),
            actions: asArray(payload.actions),
            issues: asArray(payload.issues),
            recommendations: asArray(payload.recommendations)
        },
        chartsData: payload.chartsData || payload.charts || payload.distribution || {}
    });
}

module.exports = buildOperationsDashboardContext;

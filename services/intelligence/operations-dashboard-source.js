const { isApiSourcedOperationsTask } = require('./api-evidence-filters');

function numberValue(value, fallback = 0) {
    if (value === null || value === undefined || value === '') return fallback;
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function normalizedPriority(value) {
    return String(value || '').trim().toLowerCase();
}

function buildOperationsRecommendations(metrics) {
    const recs = [];
    if (numberValue(metrics.highPriorityTasks) > 0) {
        recs.push({
            priority: 'critical',
            title: 'Address high priority operational tasks',
            detail: `${metrics.highPriorityTasks} API-sourced task(s) are marked high priority.`
        });
    }
    if (numberValue(metrics.manualTasksExcluded) > 0) {
        recs.push({
            priority: 'medium',
            title: 'Track manual configuration tasks separately',
            detail: `${metrics.manualTasksExcluded} manual task(s) such as 1Password or DNS filtering are excluded from Azure analysis.`
        });
    }
    if (!recs.length) {
        recs.push({
            priority: 'low',
            title: 'Maintain operational remediation baseline',
            detail: 'No urgent API-sourced operational recommendations from current evidence.'
        });
    }
    return recs;
}

function buildOperationsDashboardSource({ tasks = [], summary = {} } = {}) {
    const allTasks = Array.isArray(tasks) ? tasks : [];
    const apiTasks = allTasks.filter(isApiSourcedOperationsTask);
    const manualTasksExcluded = allTasks.length - apiTasks.length;
    const highPriorityTasks = apiTasks.filter(task => normalizedPriority(task.priority) === 'high').length;
    const mediumPriorityTasks = apiTasks.filter(task => normalizedPriority(task.priority) === 'medium').length;
    const lowPriorityTasks = apiTasks.filter(task => normalizedPriority(task.priority) === 'low').length;
    const explicitHealth = numberValue(summary.operationsHealthScore ?? summary.healthScore, null);
    const taskPenalty = apiTasks.length
        ? ((highPriorityTasks / apiTasks.length) * 35) + ((mediumPriorityTasks / apiTasks.length) * 15)
        : 0;
    const operationsHealthScore = explicitHealth == null
        ? Math.max(0, Math.round(100 - Math.min(80, taskPenalty)))
        : Math.max(0, Math.min(100, explicitHealth));
    const recommendations = buildOperationsRecommendations({
        highPriorityTasks,
        manualTasksExcluded
    });
    const dashboardMetrics = {
        totalTasks: allTasks.length,
        apiTasks: apiTasks.length,
        manualTasksExcluded,
        highPriorityTasks,
        mediumPriorityTasks,
        lowPriorityTasks,
        operationsHealthScore,
        healthScore: operationsHealthScore,
        recommendationsCount: recommendations.length
    };
    return {
        tasks: apiTasks,
        allTasks,
        recommendations,
        dashboardMetrics
    };
}

module.exports = {
    buildOperationsDashboardSource,
    buildOperationsRecommendations
};

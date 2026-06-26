const { isApiConnectedGovernanceRow } = require('./api-evidence-filters');

function numberValue(value, fallback = 0) {
    if (value === null || value === undefined || value === '') return fallback;
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function buildGovernanceRecommendations(metrics) {
    const recs = [];

    if (numberValue(metrics.attentionRequiredRows) > 0) {
        recs.push({
            priority: 'high',
            title: 'Review governance evidence requiring attention',
            detail: `${metrics.attentionRequiredRows} API-connected governance row(s) require management review, ownership, or escalation.`
        });
    }

    if (numberValue(metrics.ownerMissingCount) > 0) {
        recs.push({
            priority: 'high',
            title: 'Assign missing governance owners',
            detail: `${metrics.ownerMissingCount} governance item(s) do not show a responsible owner in the available evidence.`
        });
    }

    if (numberValue(metrics.manualRowsExcluded) > 0) {
        recs.push({
            priority: 'medium',
            title: 'Complete manual governance attestations separately',
            detail: `${metrics.manualRowsExcluded} manual governance item(s) are excluded from Azure analysis and remain dashboard-only.`
        });
    }

    if (!recs.length) {
        recs.push({
            priority: 'low',
            title: 'Maintain governance evidence baseline',
            detail: 'No urgent API-connected governance recommendations from current evidence.'
        });
    }

    return recs;
}

function buildGovernanceDashboardSource({ rows = [], summary = {} } = {}) {
    const allRows = Array.isArray(rows) ? rows : [];

    const normalizedRows = allRows.map((row, index) => {
        const area = row.area || row.controlArea || row.category || row.domain || 'Governance';
        const activity = row.activity || row.title || row.name || row.controlName || 'Governance review item';
        const status = row.status || row.state || row.result || 'unknown';
        const owner = row.owner || row.assignedTo || row.responsibleOwner || row.ownerName || row.ownerEmail || null;
        const dataSource = row.dataSource || row.source || row.sourceSystem || 'StackCTRL';
        const entityName = row.entityName || row.displayName || row.name || row.userPrincipalName || row.deviceName || row.appName || activity;
        const entityId = row.entityId || row.id || row.sourceId || row.controlId || row.policyId || row.userPrincipalName || entityName || `governance-row-${index + 1}`;

        return {
            ...row,
            area,
            activity,
            status,
            owner,
            dataSource,
            entityId,
            entityName,
            entityType: row.entityType || row.type || 'GovernanceItem',
            ownerStatus: owner ? 'assigned' : 'missing_or_not_supplied',
            evidenceReference: row.evidenceReference || row.sourceId || entityId,
            governanceIssue: row.governanceIssue || (/attention required|failed|missing|overdue|blocked/i.test(String(status))
                ? `${area} requires management review.`
                : `${area} governance evidence is available.`),
            managementAction: row.managementAction || (/attention required|failed|missing|overdue|blocked/i.test(String(status))
                ? 'Assign an owner, review evidence, document the decision, and track remediation.'
                : 'Maintain governance evidence and include it in the next review cycle.')
        };
    });

    const apiRows = normalizedRows.filter(isApiConnectedGovernanceRow);
    const manualRowsExcluded = normalizedRows.length - apiRows.length;

    const attentionRequiredRows = apiRows.filter(row =>
        /attention required|failed|fail|missing|overdue|blocked|partial|review/i.test(String(row.status || ''))
    ).length;

    const connectedRows = apiRows.filter(row =>
        /connected|complete|passed|pass|healthy|ok/i.test(String(row.status || ''))
    ).length;

    const ownerMissingCount = apiRows.filter(row =>
        !row.owner || /missing_or_not_supplied/i.test(String(row.ownerStatus || ''))
    ).length;

    const governanceScore = numberValue(
        summary.score ?? summary.governanceScore,
        apiRows.length
            ? Math.max(
                0,
                Math.min(
                    100,
                    Math.round((Math.max(connectedRows, apiRows.length - attentionRequiredRows) / apiRows.length) * 100)
                        - (attentionRequiredRows * 6)
                        - (ownerMissingCount * 2)
                )
            )
            : 0
    );

    const recommendations = buildGovernanceRecommendations({
        attentionRequiredRows,
        manualRowsExcluded,
        ownerMissingCount
    });

    const dashboardMetrics = {
        totalRows: normalizedRows.length,
        apiConnectedRows: apiRows.length,
        manualRowsExcluded,
        attentionRequiredRows,
        connectedRows,
        ownerMissingCount,
        governanceScore,
        recommendationsCount: recommendations.length
    };

    return {
        rows: apiRows,
        allRows: normalizedRows,
        recommendations,
        dashboardMetrics
    };
}

module.exports = {
    buildGovernanceDashboardSource,
    buildGovernanceRecommendations
};

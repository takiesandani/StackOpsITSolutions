const { isApiSourcedComplianceControl } = require('./api-evidence-filters');

function numberValue(value, fallback = 0) {
    if (value === null || value === undefined || value === '') return fallback;
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function firstValue(...values) {
    for (const value of values) {
        if (value !== null && value !== undefined && value !== '') return value;
    }
    return null;
}

function insightTone(insight, status = null) {
    const text = `${insight || ''} ${status || ''}`.toLowerCase();

    if (/🔴|critical|failed|fail|failing|non.?compliant|not met|attention|required|blocked|overdue|open/.test(text)) {
        return 'failing';
    }

    if (/🟡|partial|warning|review|needs follow.?up|needs review|in progress|unknown|insufficient|manual/.test(text)) {
        return 'partial';
    }

    if (/🟢|passing|passed|pass|compliant|met|healthy|ok|complete|connected/.test(text)) {
        return 'passing';
    }

    return 'manual_review_required';
}

function complianceStatusForTone(tone) {
    if (tone === 'failing') return 'failed';
    if (tone === 'partial') return 'partial';
    if (tone === 'passing') return 'passed';
    return 'manual_review_required';
}

function buildComplianceRecommendations(metrics) {
    const recs = [];

    if (numberValue(metrics.failingControls) > 0) {
        recs.push({
            priority: 'critical',
            title: 'Remediate failing compliance controls',
            detail: `${metrics.failingControls} API-sourced control(s) are in a failing state.`
        });
    }

    if (numberValue(metrics.partialControls) > 0) {
        recs.push({
            priority: 'medium',
            title: 'Review partial compliance controls',
            detail: `${metrics.partialControls} API-sourced control(s) need follow-up.`
        });
    }

    if (numberValue(metrics.manualReviewControls) > 0) {
        recs.push({
            priority: 'medium',
            title: 'Complete manual-review compliance validation',
            detail: `${metrics.manualReviewControls} API-sourced control(s) require manual validation because the evidence is incomplete, unknown, or not fully conclusive.`
        });
    }

    if (numberValue(metrics.manualControlsExcluded) > 0) {
        recs.push({
            priority: 'low',
            title: 'Track manual attestation controls outside Azure input',
            detail: `${metrics.manualControlsExcluded} manual control(s) remain dashboard-only and are intentionally excluded from Azure analysis.`
        });
    }

    if (!recs.length) {
        recs.push({
            priority: 'low',
            title: 'Maintain compliance validation baseline',
            detail: 'No urgent API-sourced compliance recommendations from current evidence.'
        });
    }

    return recs;
}

function buildComplianceDashboardSource({ controls = [], summary = {} } = {}) {
    const allControls = Array.isArray(controls) ? controls : [];

    const normalizedControls = allControls.map((control, index) => {
        const area = firstValue(control.area, control.controlCategory, control.category, control.domain, 'Compliance');
        const name = firstValue(control.name, control.controlName, control.title, control.requirement, `Compliance control ${index + 1}`);
        const rawStatus = firstValue(control.status, control.insight, control.result, control.validationStatus, 'unknown');
        const tone = insightTone(control.insight, rawStatus);
        const complianceStatus = firstValue(control.complianceStatus, complianceStatusForTone(tone));
        const controlId = String(firstValue(control.controlId, control.id, control.sourceId, `${area}:${name}`)).slice(0, 255);

        return {
            ...control,
            controlId,
            name,
            controlName: name,
            area,
            controlCategory: area,
            status: rawStatus,
            complianceStatus,
            insightTone: tone,
            severity: firstValue(control.severity, tone === 'failing' ? 'high' : tone === 'partial' ? 'medium' : 'low'),
            entityId: controlId,
            entityName: name,
            entityType: 'ComplianceControl',
            evidenceSource: firstValue(control.evidenceSource, control.dataSource, control.source, control.sourceSystem, 'StackCTRL compliance evidence'),
            validationReason: firstValue(
                control.validationReason,
                control.reason,
                control.description,
                tone === 'failing'
                    ? `${name} is failing based on API-sourced compliance evidence.`
                    : tone === 'partial'
                    ? `${name} partially satisfies the compliance validation and needs follow-up.`
                    : tone === 'passing'
                    ? `${name} has API-sourced evidence supporting a passing status.`
                    : `${name} requires manual review because the available evidence is incomplete or unknown.`
            ),
            remediationAction: firstValue(
                control.remediationAction,
                control.recommendation,
                control.recommendedAction,
                tone === 'failing'
                    ? 'Remediate the failed control and collect closure evidence.'
                    : tone === 'partial'
                    ? 'Review the partial control and close evidence gaps.'
                    : tone === 'passing'
                    ? 'Maintain evidence for the next review cycle.'
                    : 'Assign an owner and complete manual validation.'
            ),
            auditImpact: firstValue(
                control.auditImpact,
                control.businessImpact,
                tone === 'failing'
                    ? 'Failed controls reduce audit readiness.'
                    : tone === 'partial'
                    ? 'Partial controls may require auditor explanation and remediation evidence.'
                    : tone === 'passing'
                    ? 'Passing controls support audit readiness.'
                    : 'Manual-review controls require evidence before audit reliance.'
            )
        };
    });

    const apiControls = normalizedControls.filter(isApiSourcedComplianceControl);
    const manualControlsExcluded = normalizedControls.length - apiControls.length;

    const failingControls = apiControls.filter(control => control.insightTone === 'failing').length;
    const partialControls = apiControls.filter(control => control.insightTone === 'partial').length;
    const passingControls = apiControls.filter(control => control.insightTone === 'passing').length;
    const manualReviewControls = apiControls.filter(control => control.insightTone === 'manual_review_required').length;

    const complianceScore = numberValue(
        summary.score ?? summary.complianceScore,
        apiControls.length
            ? Math.max(
                0,
                Math.min(
                    100,
                    Math.round((passingControls / apiControls.length) * 100)
                        - (failingControls * 10)
                        - (partialControls * 4)
                        - (manualReviewControls * 3)
                )
            )
            : 0
    );

    const auditReadinessStatus = failingControls > 0
        ? 'not_ready'
        : partialControls > 0 || manualReviewControls > 0
        ? 'partially_ready'
        : apiControls.length > 0
        ? 'ready'
        : 'no_api_evidence';

    const recommendations = buildComplianceRecommendations({
        failingControls,
        partialControls,
        manualReviewControls,
        manualControlsExcluded
    });

    const dashboardMetrics = {
        totalControls: normalizedControls.length,
        apiControls: apiControls.length,
        manualControlsExcluded,
        failingControls,
        partialControls,
        passingControls,
        manualReviewControls,
        complianceScore,
        auditReadinessStatus,
        recommendationsCount: recommendations.length
    };

    return {
        controls: apiControls,
        allControls: normalizedControls,
        recommendations,
        dashboardMetrics
    };
}

module.exports = {
    buildComplianceDashboardSource,
    buildComplianceRecommendations
};
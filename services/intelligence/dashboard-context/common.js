function asArray(value) {
    return Array.isArray(value) ? value : [];
}

function asObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function numberFrom(object, keys, fallback = 0) {
    for (const key of keys) {
        const value = object?.[key];
        if (value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))) {
            return Number(value);
        }
    }
    return fallback;
}

function booleanFrom(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value === 1;
    return ['true', 'yes', 'enabled', 'registered', '1'].includes(String(value || '').toLowerCase());
}

function payloadFromSource(source) {
    for (const item of asArray(source?.evidence)) {
        if (!item || typeof item !== 'object') continue;
        if (item.evidenceType && Object.prototype.hasOwnProperty.call(item, 'data')) continue;
        if (item.Payload && typeof item.Payload === 'object') return item.Payload;
        return item;
    }
    return {};
}

function sourceReferences(source) {
    const reference = asObject(source?.rawReference);
    if (!reference.table && !reference.recordId) return [];
    return [{
        sourceKey: source.sourceKey,
        table: reference.table || null,
        recordId: reference.recordId || null
    }];
}

function hasEvidenceValue(value) {
    if (Array.isArray(value)) return value.length > 0;
    if (value && typeof value === 'object') return Object.keys(value).length > 0;
    return value !== null && value !== undefined && value !== '';
}

function evidencePackage(source, evidenceLists = {}) {
    const evidence = [...asArray(source?.evidence)];
    const sourceHasData = ['available', 'stale'].includes(source?.status);
    if (sourceHasData && Object.values(evidenceLists).some(hasEvidenceValue)) {
        evidence.push({
            evidenceType: 'dashboard_evidence_lists',
            data: evidenceLists
        });
    }
    return evidence;
}

function buildContext(source, values = {}) {
    const dashboardMetrics = asObject(values.dashboardMetrics);
    const calculatedIndicators = asObject(values.calculatedIndicators);
    const warnings = [...new Set([
        ...asArray(source?.warnings),
        ...asArray(values.warnings)
    ])];

    return {
        sourceKey: source.sourceKey,
        displayName: source.displayName,
        status: values.status || source.status,
        isExpected: source.isExpected,
        dashboardMetrics,
        calculatedIndicators,
        evidence: evidencePackage(source, values.evidenceLists),
        chartsData: asObject(values.chartsData),
        warnings,
        freshness: asObject(source.freshness),
        sourceReferences: sourceReferences(source),
        rawReference: source.rawReference,
        errorMessage: source.errorMessage || null,
        metrics: {
            ...asObject(source.metrics),
            ...dashboardMetrics,
            ...calculatedIndicators
        }
    };
}

function daysSince(value) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return 999;
    return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
}

module.exports = {
    asArray,
    asObject,
    booleanFrom,
    buildContext,
    daysSince,
    numberFrom,
    payloadFromSource
};

function isApiConnectedGovernanceRow(row) {
    if (!row || typeof row !== 'object') return false;
    if (row.connected === false) return false;
    const dataSource = String(row.dataSource || row.source || '').trim().toLowerCase();
    return dataSource !== 'manual attestation';
}

function isApiSourcedComplianceControl(control) {
    if (!control || typeof control !== 'object') return false;
    const dataSource = String(control.evidenceData?.data_source || '').trim();
    return dataSource !== 'Manual Attestation / Configuration';
}

function isApiSourcedOperationsTask(task) {
    if (!task || typeof task !== 'object') return false;
    return String(task.dataSource || '').trim() !== 'Manual configuration review';
}

module.exports = {
    isApiConnectedGovernanceRow,
    isApiSourcedComplianceControl,
    isApiSourcedOperationsTask
};

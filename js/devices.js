/* 
 * DEVICES DASHBOARD
 * Real-time Device Security Intelligence powered by Microsoft Graph
 * Fully API-driven - no mock data
 */

// Global state for devices dashboard
const devicesState = {
    summary: null,
    list: [],
    highRisk: [],
    distributions: null,
    alerts: [],
    configurations: [],
    charts: {},
    isInitialized: false,
    loadingState: {
        summary: false,
        list: false,
        highRisk: false,
        distributions: false,
        alerts: false
    }
};

/**
 * Initialize Devices Dashboard
 * Called when Devices tab is activated
 */
async function initializeDevicesDashboard() {
    try {
        // Don't reinitialize if already loaded
        if (devicesState.isInitialized) {
            console.log('[Devices] Dashboard already initialized');
            return;
        }

        console.log('[Devices] Initializing dashboard...');
        showDevicesLoading(true);

        // Fetch all device data in parallel
        const [summaryData, distributionsData, highRiskData, alertsData] = await Promise.all([
            fetchDevicesSummary(),
            fetchDevicesDistributions(),
            fetchDevicesHighRisk(),
            fetchDevicesAlerts()
        ]);

        if (summaryData && distributionsData && highRiskData) {
            devicesState.summary = summaryData;
            devicesState.distributions = distributionsData;
            devicesState.highRisk = highRiskData;
            devicesState.alerts = alertsData || [];

            // Render all dashboard sections
            renderDeviceMetricCards(summaryData);
            renderDeviceCharts(distributionsData);
            renderDeviceHealthScore(summaryData);
            renderHighRiskDevicesTable(highRiskData);
            renderAlertsPanel(alertsData);

            devicesState.isInitialized = true;
            showDevicesLoading(false);
            console.log('[Devices] Dashboard initialized successfully');
        }
    } catch (error) {
        console.error('[Devices] Initialization failed:', error);
        showDevicesLoading(false);
        showDevicesError('Failed to load devices dashboard');
    }
}

/**
 * Fetch Devices Summary
 */
async function fetchDevicesSummary() {
    try {
        devicesState.loadingState.summary = true;
        const authToken = localStorage.getItem('authToken');

        const response = await fetch('/api/devices/summary', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch devices summary: ${response.statusText}`);
        }

        const data = await response.json();
        devicesState.loadingState.summary = false;
        console.log('[Devices] Summary data loaded:', data);
        return data;
    } catch (error) {
        console.error('[Devices] Error fetching summary:', error);
        devicesState.loadingState.summary = false;
        return null;
    }
}

/**
 * Fetch Devices Distributions (for charts)
 */
async function fetchDevicesDistributions() {
    try {
        devicesState.loadingState.distributions = true;
        const authToken = localStorage.getItem('authToken');

        const response = await fetch('/api/devices/distributions', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch distributions: ${response.statusText}`);
        }

        const data = await response.json();
        devicesState.loadingState.distributions = false;
        console.log('[Devices] Distributions data loaded:', data);
        return data;
    } catch (error) {
        console.error('[Devices] Error fetching distributions:', error);
        devicesState.loadingState.distributions = false;
        return null;
    }
}

/**
 * Fetch High Risk Devices
 */
async function fetchDevicesHighRisk() {
    try {
        devicesState.loadingState.highRisk = true;
        const authToken = localStorage.getItem('authToken');

        const response = await fetch('/api/devices/high-risk', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch high risk devices: ${response.statusText}`);
        }

        const data = await response.json();
        devicesState.loadingState.highRisk = false;
        console.log('[Devices] High risk devices loaded:', data);
        return data;
    } catch (error) {
        console.error('[Devices] Error fetching high risk devices:', error);
        devicesState.loadingState.highRisk = false;
        return null;
    }
}

/**
 * Fetch Security Alerts
 */
async function fetchDevicesAlerts() {
    try {
        devicesState.loadingState.alerts = true;
        const authToken = localStorage.getItem('authToken');

        const response = await fetch('/api/devices/alerts', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch alerts: ${response.statusText}`);
        }

        const data = await response.json();
        devicesState.loadingState.alerts = false;
        console.log('[Devices] Alerts loaded:', data);
        return data || { alerts: [] };
    } catch (error) {
        console.error('[Devices] Error fetching alerts:', error);
        devicesState.loadingState.alerts = false;
        return { alerts: [] };
    }
}

/**
 * Render Device Metric Cards
 */
function renderDeviceMetricCards(summary) {
    try {
        const totalEl = document.getElementById('device-total');
        const complianceEl = document.getElementById('device-compliance');
        const encryptionEl = document.getElementById('device-encryption');
        const activeEl = document.getElementById('device-active');

        if (totalEl) totalEl.textContent = summary.totalDevices || 0;
        if (complianceEl) complianceEl.textContent = (summary.compliancePercentage || 0) + '%';
        if (encryptionEl) encryptionEl.textContent = (summary.encryptionPercentage || 0) + '%';
        if (activeEl) activeEl.textContent = summary.activeDevices || 0;

        console.log('[Devices] Metric cards rendered');
    } catch (error) {
        console.error('[Devices] Error rendering metric cards:', error);
    }
}

/**
 * Render Device Charts (OS, Compliance, Management)
 */
function renderDeviceCharts(distributions) {
    if (!distributions) {
        console.error('[Devices] No distributions data for charts');
        return;
    }

    // OS Distribution Chart
    renderOSDistributionChart(distributions);

    // Compliance Breakdown Chart
    renderComplianceChart(distributions);

    // Management Status Chart
    renderManagementChart(distributions);
}

/**
 * Render OS Distribution Pie Chart
 */
function renderOSDistributionChart(distributions) {
    try {
        const canvas = document.getElementById('os-distribution-chart');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');

        // Destroy existing chart if exists
        if (devicesState.charts.osChart) {
            devicesState.charts.osChart.destroy();
        }

        const osData = distributions.osDistribution || {
            windows: 0,
            ios: 0,
            android: 0,
            macos: 0,
            unknown: 0
        };

        devicesState.charts.osChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Windows', 'iOS', 'Android', 'macOS', 'Unknown'],
                datasets: [{
                    data: [
                        osData.windows,
                        osData.ios,
                        osData.android,
                        osData.macos,
                        osData.unknown
                    ],
                    backgroundColor: [
                        'rgba(59, 130, 246, 0.7)',
                        'rgba(14, 165, 233, 0.7)',
                        'rgba(34, 197, 94, 0.7)',
                        'rgba(168, 85, 247, 0.7)',
                        'rgba(148, 163, 184, 0.7)'
                    ],
                    borderColor: [
                        'rgba(59, 130, 246, 1)',
                        'rgba(14, 165, 233, 1)',
                        'rgba(34, 197, 94, 1)',
                        'rgba(168, 85, 247, 1)',
                        'rgba(148, 163, 184, 1)'
                    ],
                    borderWidth: 2,
                    borderSkipped: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: '#e2e8f0',
                            font: { size: 12, weight: '200' },
                            padding: 15,
                            boxWidth: 12
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.9)',
                        titleColor: '#e2e8f0',
                        bodyColor: '#e2e8f0',
                        borderColor: 'rgba(0, 110, 255, 0.5)',
                        borderWidth: 1,
                        padding: 10,
                        titleFont: { size: 12, weight: '500' },
                        bodyFont: { size: 11, weight: '200' }
                    }
                }
            }
        });
    } catch (error) {
        console.error('[Devices] Error rendering OS chart:', error);
    }
}

/**
 * Render Compliance Status Chart
 */
function renderComplianceChart(distributions) {
    try {
        const canvas = document.getElementById('compliance-chart');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');

        // Destroy existing chart if exists
        if (devicesState.charts.complianceChart) {
            devicesState.charts.complianceChart.destroy();
        }

        const complianceData = distributions.complianceBreakdown || {
            compliant: 0,
            nonCompliant: 0,
            unknown: 0
        };

        devicesState.charts.complianceChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Compliant', 'Non-Compliant', 'Unknown'],
                datasets: [{
                    data: [
                        complianceData.compliant,
                        complianceData.nonCompliant,
                        complianceData.unknown
                    ],
                    backgroundColor: [
                        'rgba(34, 197, 94, 0.7)',
                        'rgba(239, 68, 68, 0.7)',
                        'rgba(148, 163, 184, 0.7)'
                    ],
                    borderColor: [
                        'rgba(34, 197, 94, 1)',
                        'rgba(239, 68, 68, 1)',
                        'rgba(148, 163, 184, 1)'
                    ],
                    borderWidth: 2,
                    borderSkipped: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: '#e2e8f0',
                            font: { size: 12, weight: '200' },
                            padding: 15,
                            boxWidth: 12
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.9)',
                        titleColor: '#e2e8f0',
                        bodyColor: '#e2e8f0',
                        borderColor: 'rgba(0, 110, 255, 0.5)',
                        borderWidth: 1,
                        padding: 10,
                        titleFont: { size: 12, weight: '500' },
                        bodyFont: { size: 11, weight: '200' }
                    }
                }
            }
        });
    } catch (error) {
        console.error('[Devices] Error rendering compliance chart:', error);
    }
}

/**
 * Render Management Status Chart
 */
function renderManagementChart(distributions) {
    try {
        const canvas = document.getElementById('management-chart');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');

        // Destroy existing chart if exists
        if (devicesState.charts.managementChart) {
            devicesState.charts.managementChart.destroy();
        }

        const mgmtData = distributions.managementStatus || {
            intuneManaged: 0,
            azureADRegistered: 0,
            unmanaged: 0
        };

        devicesState.charts.managementChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Intune Managed', 'Azure AD Registered', 'Unmanaged'],
                datasets: [{
                    data: [
                        mgmtData.intuneManaged,
                        mgmtData.azureADRegistered,
                        mgmtData.unmanaged
                    ],
                    backgroundColor: [
                        'rgba(59, 130, 246, 0.7)',
                        'rgba(168, 85, 247, 0.7)',
                        'rgba(249, 115, 22, 0.7)'
                    ],
                    borderColor: [
                        'rgba(59, 130, 246, 1)',
                        'rgba(168, 85, 247, 1)',
                        'rgba(249, 115, 22, 1)'
                    ],
                    borderWidth: 2,
                    borderSkipped: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: '#e2e8f0',
                            font: { size: 12, weight: '200' },
                            padding: 15,
                            boxWidth: 12
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.9)',
                        titleColor: '#e2e8f0',
                        bodyColor: '#e2e8f0',
                        borderColor: 'rgba(0, 110, 255, 0.5)',
                        borderWidth: 1,
                        padding: 10,
                        titleFont: { size: 12, weight: '500' },
                        bodyFont: { size: 11, weight: '200' }
                    }
                }
            }
        });
    } catch (error) {
        console.error('[Devices] Error rendering management chart:', error);
    }
}

/**
 * Render Device Health Score
 */
function renderDeviceHealthScore(summary) {
    try {
        if (!summary.healthScores) {
            console.error('[Devices] No health scores data');
            return;
        }

        const healthScoreValue = document.getElementById('health-score-value');
        const healthScoreLabel = document.getElementById('health-score-label');

        if (healthScoreValue) {
            healthScoreValue.textContent = summary.overallHealthScore || 0;
            healthScoreValue.style.color = getHealthScoreColor(summary.overallHealthScore || 0);
        }

        if (healthScoreLabel) {
            healthScoreLabel.textContent = `Overall Health (${getHealthScoreStatus(summary.overallHealthScore || 0)})`;
        }

        console.log('[Devices] Health score rendered');
    } catch (error) {
        console.error('[Devices] Error rendering health score:', error);
    }
}

/**
 * Get color based on health score
 */
function getHealthScoreColor(score) {
    if (score >= 80) return '#10b981'; // Green
    if (score >= 60) return '#f59e0b'; // Amber
    return '#ef4444'; // Red
}

/**
 * Get health score status text
 */
function getHealthScoreStatus(score) {
    if (score >= 80) return 'Good';
    if (score >= 60) return 'Fair';
    return 'Poor';
}

/**
 * Render High Risk Devices Table
 */
function renderHighRiskDevicesTable(highRiskData) {
    try {
        const tbody = document.getElementById('high-risk-body');
        if (!tbody) {
            console.error('[Devices] High risk table body not found');
            return;
        }

        tbody.innerHTML = '';

        if (!highRiskData || highRiskData.length === 0) {
            tbody.innerHTML = `
                <tr style="color: #10b981;">
                    <td colspan="7" style="padding: 20px; text-align: center;">
                        <i class="fas fa-check-circle"></i> No high risk devices detected
                    </td>
                </tr>
            `;
            return;
        }

        highRiskData.forEach(device => {
            const row = document.createElement('tr');
            row.style.borderBottom = '1px solid rgba(0, 110, 255, 0.1)';
            row.style.color = '#e2e8f0';

            const riskColor = getRiskLevelColor(device.riskLevel);
            const riskIcon = getRiskLevelIcon(device.riskLevel);

            const lastSync = device.lastSyncDateTime
                ? new Date(device.lastSyncDateTime).toLocaleDateString()
                : 'Unknown';

            const complianceStatus = device.complianceState === 'compliant'
                ? '<span style="color: #10b981;">✓ Compliant</span>'
                : '<span style="color: #ef4444;">✗ Non-Compliant</span>';

            const encryptionStatus = device.isEncrypted
                ? '<span style="color: #10b981;">✓ Encrypted</span>'
                : '<span style="color: #ef4444;">✗ Not Encrypted</span>';

            row.innerHTML = `
                <td style="padding: 12px; font-size: 12px;">${device.deviceName || 'Unknown'}</td>
                <td style="padding: 12px; font-size: 12px;">${device.userPrincipalName || 'Unknown'}</td>
                <td style="padding: 12px; font-size: 12px;">${device.operatingSystem || 'Unknown'}</td>
                <td style="padding: 12px; font-size: 12px;">${complianceStatus}</td>
                <td style="padding: 12px; font-size: 12px;">${encryptionStatus}</td>
                <td style="padding: 12px; font-size: 12px;">${lastSync}</td>
                <td style="padding: 12px; font-size: 12px;">
                    <span style="color: ${riskColor}; font-weight: 500;">
                        ${riskIcon} ${device.riskLevel || 'UNKNOWN'}
                    </span>
                </td>
            `;

            tbody.appendChild(row);
        });

        console.log('[Devices] High risk table rendered');
    } catch (error) {
        console.error('[Devices] Error rendering high risk table:', error);
    }
}

/**
 * Get risk level color
 */
function getRiskLevelColor(riskLevel) {
    switch (riskLevel) {
        case 'HIGH':
            return '#ef4444';
        case 'MEDIUM':
            return '#f59e0b';
        case 'SAFE':
            return '#10b981';
        default:
            return '#94a3b8';
    }
}

/**
 * Get risk level icon
 */
function getRiskLevelIcon(riskLevel) {
    switch (riskLevel) {
        case 'HIGH':
            return '🔴';
        case 'MEDIUM':
            return '🟡';
        case 'SAFE':
            return '🟢';
        default:
            return '⚪';
    }
}

/**
 * Render Alerts Panel
 */
function renderAlertsPanel(alertsData) {
    try {
        const container = document.getElementById('alerts-container');
        if (!container) {
            console.error('[Devices] Alerts container not found');
            return;
        }

        container.innerHTML = '';

        const alerts = alertsData?.alerts || [];

        if (alerts.length === 0) {
            container.innerHTML = `
                <div style="color: #94a3b8; padding: 20px; text-align: center;">
                    <i class="fas fa-check-circle" style="color: #10b981; font-size: 24px; margin-bottom: 8px;"></i>
                    <p>No active security alerts</p>
                </div>
            `;
            return;
        }

        alerts.slice(0, 10).forEach(alert => {
            const alertElement = document.createElement('div');
            alertElement.style.cssText = `
                padding: 14px;
                margin-bottom: 8px;
                border-radius: 8px;
                border-left: 4px solid ${getSeverityColor(alert.severity)};
                background: rgba(${getSeverityRGB(alert.severity)}, 0.1);
                font-size: 12px;
                color: #e2e8f0;
            `;

            const severityIcon = getSeverityIcon(alert.severity);
            const timestamp = alert.createdDateTime
                ? formatAlertTime(new Date(alert.createdDateTime))
                : 'Unknown';

            alertElement.innerHTML = `
                <div style="display: flex; align-items: flex-start; gap: 8px;">
                    <span style="color: ${getSeverityColor(alert.severity)}; font-size: 14px;">${severityIcon}</span>
                    <div style="flex: 1;">
                        <div style="font-weight: 500; color: ${getSeverityColor(alert.severity)};">
                            ${alert.title || alert.displayName || 'Security Alert'}
                        </div>
                        <div style="color: #cbd5e1; margin-top: 4px; font-size: 11px;">
                            ${alert.description || alert.statusMessage || ''}
                        </div>
                        <div style="color: #94a3b8; margin-top: 4px; font-size: 10px;">
                            ${timestamp}
                        </div>
                    </div>
                </div>
            `;

            container.appendChild(alertElement);
        });

        console.log('[Devices] Alerts panel rendered');
    } catch (error) {
        console.error('[Devices] Error rendering alerts panel:', error);
    }
}

/**
 * Get severity color
 */
function getSeverityColor(severity) {
    switch ((severity || '').toLowerCase()) {
        case 'high':
            return '#ef4444';
        case 'medium':
            return '#f59e0b';
        case 'low':
            return '#3b82f6';
        default:
            return '#94a3b8';
    }
}

/**
 * Get severity RGB for background
 */
function getSeverityRGB(severity) {
    switch ((severity || '').toLowerCase()) {
        case 'high':
            return '239, 68, 68';
        case 'medium':
            return '245, 158, 11';
        case 'low':
            return '59, 130, 246';
        default:
            return '148, 163, 184';
    }
}

/**
 * Get severity icon
 */
function getSeverityIcon(severity) {
    switch ((severity || '').toLowerCase()) {
        case 'high':
            return '🔴';
        case 'medium':
            return '🟡';
        case 'low':
            return '🔵';
        default:
            return '⚪';
    }
}

/**
 * Format alert timestamp
 */
function formatAlertTime(date) {
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);

    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return date.toLocaleDateString();
}

/**
 * Show devices loading state
 */
function showDevicesLoading(show) {
    const tab = document.getElementById('devices-tab');
    if (!tab) return;

    const loader = tab.querySelector('.devices-loader');
    if (show) {
        if (!loader) {
            const loaderDiv = document.createElement('div');
            loaderDiv.className = 'devices-loader';
            loaderDiv.style.cssText = `
                display: flex;
                align-items: center;
                justify-content: center;
                height: 400px;
                color: #94a3b8;
                font-size: 14px;
            `;
            loaderDiv.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right: 12px;"></i> Loading devices data...';
            tab.appendChild(loaderDiv);
        }
    } else {
        if (loader) loader.remove();
    }
}

/**
 * Show devices error
 */
function showDevicesError(message) {
    const container = document.getElementById('devices-tab');
    if (!container) return;

    // Show notification
    showNotification(message, false);
}

/**
 * Refresh devices dashboard
 */
async function refreshDevicesDashboard() {
    console.log('[Devices] Refreshing dashboard...');
    devicesState.isInitialized = false;
    await initializeDevicesDashboard();
}

// Setup event listeners for devices tab
function setupDevicesTabListener() {
    const devicesBtn = document.querySelector('button[data-tab="devices-tab"]');
    if (devicesBtn) {
        devicesBtn.addEventListener('click', function() {
            // Initialize devices dashboard when tab is clicked
            setTimeout(() => {
                if (!devicesState.isInitialized) {
                    initializeDevicesDashboard();
                }
            }, 100);
        });
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    setupDevicesTabListener();
});

// Export for external use
window.devicesModule = {
    initialize: initializeDevicesDashboard,
    refresh: refreshDevicesDashboard
};

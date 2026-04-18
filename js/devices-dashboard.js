/* ============================================
   DEVICES & SECURITY COMPLIANCE DASHBOARD
   ============================================ */

let devicesData = [];
let allDevicesData = [];

// Fetch Devices data from API
async function fetchDevicesData(project) {
    try {
        console.log('[Devices Dashboard] Fetching device data...');
        showDevicesLoadingState();
        
        const authToken = localStorage.getItem('authToken');
        
        const response = await fetch('/api/microsoft-devices', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (!response.ok || !data.success) {
            throw new Error(data.message || 'Failed to fetch devices');
        }
        
        allDevicesData = data.devices || [];
        devicesData = allDevicesData;
        
        // Update project metrics
        project.cardMetrics = [
            { label: "Total Devices", value: `: ${data.summary.totalDevices}`, icon: "fas fa-desktop" },
            { label: "Compliant", value: `: ${data.summary.compliantDevices}`, icon: "fas fa-check-circle" }
        ];
        project.lastUpdate = new Date().toLocaleTimeString();
        project.cardFooter = `${data.summary.totalDevices} devices | ${data.summary.compliancePercentage}% compliant`;
        
        console.log(`[Devices Dashboard] Loaded ${allDevicesData.length} devices`);
        
        // Initialize the dashboard
        initializeDevicesDashboard(data);
        
    } catch (error) {
        console.error('[Devices Dashboard] Error fetching devices:', error.message);
        showNotification('Failed to load devices data: ' + error.message, false);
    }
}

// Initialize the complete devices dashboard
function initializeDevicesDashboard(data) {
    console.log('[Devices Dashboard] Initializing dashboard...');
    
    // Update summary cards
    updateDevicesSummaryCards(data.summary);
    
    // Initialize charts
    initializeDevicesCharts(data);
    
    // Populate high risk devices
    populateHighRiskDevices(data.highRiskDevices);
    
    // Populate security alerts
    populateSecurityAlerts(data.alerts);
    
    // Update analytics
    updateDevicesAnalytics(data);
    
    // Generate and populate insights
    generateDeviceInsights(data);
    
    // Populate devices table
    populateDevicesTable(data.devices);
    
    // Setup back button
    setupDevicesBackButton();
    
    // Setup search and filters
    setupDevicesSearchAndFilters();
    
    console.log('[Devices Dashboard] Dashboard initialized successfully');
}

// Update summary cards with device metrics
function updateDevicesSummaryCards(summary) {
    document.getElementById('devices-total').textContent = summary.totalDevices;
    document.getElementById('devices-compliant-pct').textContent = summary.compliancePercentage + '%';
    document.getElementById('devices-encrypted-pct').textContent = summary.encryptionPercentage + '%';
    document.getElementById('devices-active-24h').textContent = summary.activityBreakdown?.active24h || 0;
}

// Initialize all device charts
function initializeDevicesCharts(data) {
    initializeComplianceChart(data.compliance);
    initializeOsDistributionChart(data.osDistribution);
    initializeManagementStatusChart(data.managementStatus);
    initializeDeviceSecurityRadarChart(data.summary);
}

// Compliance Breakdown Pie Chart
function initializeComplianceChart(compliance) {
    const ctx = document.getElementById('deviceComplianceChart').getContext('2d');
    
    if (charts.deviceCompliance) {
        charts.deviceCompliance.destroy();
    }
    
    charts.deviceCompliance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Compliant', 'Non-Compliant', 'Unknown'],
            datasets: [{
                data: [compliance.compliant, compliance.nonCompliant, compliance.unknown],
                backgroundColor: [
                    'rgba(16, 185, 129, 0.8)',  // Green
                    'rgba(239, 68, 68, 0.8)',    // Red
                    'rgba(148, 163, 184, 0.8)'   // Gray
                ],
                borderColor: [
                    'rgba(16, 185, 129, 1)',
                    'rgba(239, 68, 68, 1)',
                    'rgba(148, 163, 184, 1)'
                ],
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#94a3b8',
                        font: { weight: '200', size: 12 },
                        padding: 12
                    }
                }
            }
        }
    });
}

// OS Distribution Bar Chart
function initializeOsDistributionChart(osDistribution) {
    const ctx = document.getElementById('deviceOsChart').getContext('2d');
    
    if (charts.deviceOs) {
        charts.deviceOs.destroy();
    }
    
    const labels = Object.keys(osDistribution).slice(0, 8);
    const data = labels.map(os => osDistribution[os]);
    
    charts.deviceOs = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Device Count',
                data: data,
                backgroundColor: 'rgba(0, 110, 255, 0.6)',
                borderColor: 'rgba(0, 110, 255, 1)',
                borderWidth: 1
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    labels: {
                        color: '#94a3b8',
                        font: { weight: '200' }
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: '#94a3b8', font: { weight: '200' } },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' }
                },
                y: {
                    ticks: { color: '#94a3b8', font: { weight: '200' } },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' }
                }
            }
        }
    });
}

// Management Status Chart
function initializeManagementStatusChart(managementStatus) {
    const ctx = document.getElementById('deviceManagementChart').getContext('2d');
    
    if (charts.deviceManagement) {
        charts.deviceManagement.destroy();
    }
    
    charts.deviceManagement = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Managed', 'Unmanaged', 'AAD Registered'],
            datasets: [{
                data: [managementStatus.managed, managementStatus.unmanaged, managementStatus.aadRegistered],
                backgroundColor: [
                    'rgba(34, 197, 94, 0.8)',    // Green
                    'rgba(239, 68, 68, 0.8)',    // Red
                    'rgba(0, 110, 255, 0.8)'     // Blue
                ],
                borderColor: [
                    'rgba(34, 197, 94, 1)',
                    'rgba(239, 68, 68, 1)',
                    'rgba(0, 110, 255, 1)'
                ],
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#94a3b8',
                        font: { weight: '200', size: 12 },
                        padding: 12
                    }
                }
            }
        }
    });
}

// Device Security Score Radar Chart
function initializeDeviceSecurityRadarChart(summary) {
    const ctx = document.getElementById('deviceSecurityRadarChart').getContext('2d');
    
    if (charts.deviceSecurityRadar) {
        charts.deviceSecurityRadar.destroy();
    }
    
    // Calculate individual metrics (0-100)
    const compliance = summary.compliancePercentage;
    const encryption = summary.encryptionPercentage;
    const policyScale = (summary.totalDevices - summary.highRiskDevices) / (summary.totalDevices || 1) * 100;
    const threatExposure = 100 - ((summary.highRiskDevices / (summary.totalDevices || 1)) * 100);
    
    charts.deviceSecurityRadar = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: ['Compliance', 'Encryption', 'Activity', 'Policy Coverage', 'Threat Exposure'],
            datasets: [{
                label: 'Security Score',
                data: [compliance, encryption, summary.deviceSecurityScore, policyScale, threatExposure],
                borderColor: 'rgba(0, 110, 255, 1)',
                backgroundColor: 'rgba(0, 110, 255, 0.2)',
                borderWidth: 2,
                pointBackgroundColor: 'rgba(0, 110, 255, 1)',
                pointBorderColor: 'rgba(0, 110, 255, 0.5)',
                pointRadius: 5,
                pointHoverRadius: 7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: '#94a3b8',
                        font: { weight: '200' },
                        padding: 15
                    }
                }
            },
            scales: {
                r: {
                    beginAtZero: true,
                    max: 100,
                    ticks: {
                        color: '#94a3b8',
                        font: { weight: '200' },
                        stepSize: 20
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)'
                    },
                    pointLabels: {
                        color: '#e2e8f0',
                        font: { weight: '200', size: 12 }
                    }
                }
            }
        }
    });
}

// Populate high risk devices list
function populateHighRiskDevices(highRiskDevices) {
    const container = document.getElementById('high-risk-devices-list');
    
    if (!highRiskDevices || highRiskDevices.length === 0) {
        container.innerHTML = '<p style="color: #10b981; padding: 20px; text-align: center;">✓ No high-risk devices detected</p>';
        return;
    }
    
    const html = highRiskDevices.map(device => `
        <div class="high-risk-device">
            <div class="device-name">${device.deviceName || 'Unknown'}</div>
            <div class="device-issue">
                ${!device.isEncrypted ? '🔓 Not Encrypted' : ''}
                ${device.complianceState === 'noncompliant' ? ' | ⚠️ Non-Compliant' : ''}
            </div>
            <div class="device-user">${device.userPrincipalName || 'N/A'}</div>
        </div>
    `).join('');
    
    container.innerHTML = html;
}

// Populate security alerts feed
function populateSecurityAlerts(alerts) {
    const container = document.getElementById('security-alerts-feed');
    
    if (!alerts || alerts.length === 0) {
        container.innerHTML = '<p style="color: #10b981; padding: 20px; text-align: center;">✓ No active security alerts</p>';
        return;
    }
    
    const html = alerts.map(alert => `
        <div class="alert-item-device ${alert.severity}">
            <span class="alert-severity-badge ${alert.severity}">${alert.severity.toUpperCase()}</span>
            <div class="alert-title">${alert.title || 'Unknown Alert'}</div>
            <div class="alert-time">${formatDate(alert.createdDateTime)}</div>
        </div>
    `).join('');
    
    container.innerHTML = html;
}

// Update devices analytics
function updateDevicesAnalytics(data) {
    const activity = data.activityBreakdown || {};
    document.getElementById('activity-active-24h').textContent = activity.active24h || 0;
    document.getElementById('activity-stale-7d').textContent = activity.stale7days || 0;
    document.getElementById('activity-dead-30d').textContent = activity.dead30days || 0;
    
    // Policy coverage
    const policyCoverage = document.getElementById('policy-coverage-content');
    const totalDevices = data.summary.totalDevices;
    const policies = data.policies || [];
    
    // Estimate device coverage based on policies (assume each policy covers ~80% of managed devices if it exists)
    const devicesWithPolicies = policies.length > 0 ? Math.ceil(totalDevices * 0.85) : 0;
    const devicesWithoutPolicies = totalDevices - devicesWithPolicies;
    const coveragePercentage = totalDevices > 0 ? Math.round((devicesWithPolicies / totalDevices) * 100) : 0;
    
    // Determine coverage status
    let coverageStatus = 'Low Coverage';
    let statusColor = '#ff6b6b';
    if (coveragePercentage >= 90) {
        coverageStatus = 'Full Coverage';
        statusColor = '#10b981';
    } else if (coveragePercentage >= 70) {
        coverageStatus = 'Good Coverage';
        statusColor = '#3b82f6';
    } else if (coveragePercentage >= 50) {
        coverageStatus = 'Partial Coverage';
        statusColor = '#f59e0b';
    }
    
    const policyListHTML = policies.length > 0 
        ? policies.slice(0, 5).map(policy => {
            const policyName = policy.displayName || policy.id || 'Unknown Policy';
            return `<div style="display: flex; align-items: center; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
                <div style="width: 8px; height: 8px; background: #0066FF; border-radius: 50%; margin-right: 8px;"></div>
                <span style="color: #cbd5e1; font-size: 12px; font-weight: 200; flex: 1; word-break: break-word;">${policyName}</span>
            </div>`;
          }).join('')
        : '<div style="color: #94a3b8; font-size: 12px; font-weight: 200; padding: 8px 0;">No policies configured</div>';
    
    const showMorePolicies = policies.length > 5 ? `<div style="color: #0066FF; font-size: 12px; font-weight: 200; padding: 8px 0; cursor: pointer;">+${policies.length - 5} more policies</div>` : '';
    
    policyCoverage.innerHTML = `
        <div style="padding: 12px 0;">
            <!-- Coverage Metric -->
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <div>
                    <div style="color: #94a3b8; font-weight: 200; font-size: 12px; margin-bottom: 4px;">Coverage Status</div>
                    <div style="color: ${statusColor}; font-weight: 200; font-size: 14px;">${coverageStatus}</div>
                </div>
                <div style="text-align: right;">
                    <div style="color: #0066FF; font-weight: 200; font-size: 28px; line-height: 1;">${coveragePercentage}%</div>
                    <div style="color: #94a3b8; font-weight: 200; font-size: 11px; margin-top: 2px;">of devices</div>
                </div>
            </div>
            
            <!-- Coverage Bar -->
            <div style="height: 8px; background: rgba(255,255,255,0.08); border-radius: 4px; margin-bottom: 12px; overflow: hidden;">
                <div style="height: 100%; width: ${coveragePercentage}%; background: linear-gradient(90deg, #0066FF, #00d4ff); border-radius: 4px;"></div>
            </div>
            
            <!-- Device Breakdown -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px;">
                <div style="background: rgba(16, 185, 129, 0.1); border-radius: 6px; padding: 8px;">
                    <div style="color: #94a3b8; font-weight: 200; font-size: 11px;">With Policies</div>
                    <div style="color: #10b981; font-weight: 200; font-size: 18px;">${devicesWithPolicies}</div>
                </div>
                <div style="background: rgba(255, 107, 107, 0.1); border-radius: 6px; padding: 8px;">
                    <div style="color: #94a3b8; font-weight: 200; font-size: 11px;">Without Policies</div>
                    <div style="color: #ff6b6b; font-weight: 200; font-size: 18px;">${devicesWithoutPolicies}</div>
                </div>
            </div>
            
            <!-- Active Policies Count -->
            <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
                <span style="color: #94a3b8; font-weight: 200; font-size: 12px;">Active Policies</span>
                <span style="color: #0066FF; font-weight: 200; font-size: 14px;">${policies.length}</span>
            </div>
            
            <!-- Policy List -->
            <div style="background: rgba(0, 110, 255, 0.05); border-radius: 6px; padding: 8px; max-height: 160px; overflow-y: auto;">
                ${policyListHTML}
                ${showMorePolicies}
            </div>
        </div>
    `;
}

// Generate device security insights
function generateDeviceInsights(data) {
    const insights = [];
    const summary = data.summary;
    const totalDevices = summary.totalDevices;
    
    // Insight 1: Non-encrypted devices
    if (summary.totalDevices > summary.encryptedDevices) {
        const notEncrypted = totalDevices - summary.encryptedDevices;
        const percentage = Math.round((notEncrypted / totalDevices) * 100);
        insights.push({
            title: `${percentage}% Not Encrypted`,
            value: notEncrypted,
            description: `${notEncrypted} device(s) missing encryption`,
            filter: 'not-encrypted'
        });
    }
    
    // Insight 2: Non-compliant devices
    if (summary.totalDevices > summary.compliantDevices) {
        const nonCompliant = totalDevices - summary.compliantDevices;
        const percentage = Math.round((nonCompliant / totalDevices) * 100);
        insights.push({
            title: `${percentage}% Non-Compliant`,
            value: nonCompliant,
            description: `${nonCompliant} device(s) not meeting compliance`,
            filter: 'non-compliant'
        });
    }
    
    // Insight 3: Stale devices
    if (data.activityBreakdown.stale7days > 0) {
        insights.push({
            title: 'Stale Devices',
            value: data.activityBreakdown.stale7days,
            description: `${data.activityBreakdown.stale7days} device(s) without recent sync`,
            filter: 'stale'
        });
    }
    
    // Insight 4: High-risk devices
    if (summary.highRiskDevices > 0) {
        insights.push({
            title: 'High Risk',
            value: summary.highRiskDevices,
            description: `${summary.highRiskDevices} device(s) require immediate attention`,
            filter: 'high-risk'
        });
    }
    
    // Insight 5: Security score
    insights.push({
        title: 'Security Score',
        value: summary.deviceSecurityScore,
        description: `Overall device security posture: ${summary.deviceSecurityScore}/100`,
        filter: null
    });
    
    // Render insights
    const container = document.getElementById('devices-insights-container');
    const html = insights.map((insight, idx) => `
        <div class="insight-card" ${insight.filter ? `onclick="applyInsightFilter('${insight.filter}')"` : ''} style="cursor: ${insight.filter ? 'pointer' : 'default'};">
            <div class="insight-title">${insight.title}</div>
            <div class="insight-value">${insight.value}</div>
            <div class="insight-description">${insight.description}</div>
        </div>
    `).join('');
    
    container.innerHTML = html;
}

// Apply insight filter
function applyInsightFilter(filterType) {
    if (filterType === 'non-compliant') {
        document.getElementById('filter-non-compliant').checked = true;
    } else if (filterType === 'not-encrypted') {
        document.getElementById('filter-not-encrypted').checked = true;
    } else if (filterType === 'stale') {
        document.getElementById('filter-stale').checked = true;
    }
    filterDevices();
}

// Populate devices table
function populateDevicesTable(devices) {
    const tbody = document.getElementById('devices-tbody');
    
    if (!devices || devices.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 20px; color: #bdbdbd;">No devices found</td></tr>';
        return;
    }
    
    const rows = devices.map(device => `
        <tr>
            <td>${device.deviceName || 'Unknown'}</td>
            <td>${device.userPrincipalName || 'N/A'}</td>
            <td>${device.operatingSystem || 'Unknown'}</td>
            <td>
                <span class="device-status-badge ${device.complianceState.toLowerCase()}">
                    ${device.complianceState.charAt(0).toUpperCase() + device.complianceState.slice(1)}
                </span>
            </td>
            <td>
                <span class="device-encryption-badge ${device.isEncrypted ? 'encrypted' : 'unencrypted'}">
                    ${device.isEncrypted ? '🔒 Encrypted' : '🔓 Not Encrypted'}
                </span>
            </td>
            <td>${device.managementAgent || 'Unknown'}</td>
            <td>${device.lastSyncDateTime ? formatDate(device.lastSyncDateTime) : 'Never'}</td>
            <td>
                <span class="device-risk-badge ${getDeviceRiskLevel(device)}">
                    ${getDeviceRiskLabel(device)}
                </span>
            </td>
        </tr>
    `).join('');
    
    tbody.innerHTML = rows;
    console.log('[Devices Dashboard] Table updated with ' + devices.length + ' devices');
}

// Get device risk level
function getDeviceRiskLevel(device) {
    if (!device.isEncrypted && device.complianceState === 'noncompliant') return 'high';
    if (!device.isEncrypted || device.complianceState === 'noncompliant') return 'medium';
    return 'low';
}

// Get device risk label
function getDeviceRiskLabel(device) {
    const level = getDeviceRiskLevel(device);
    return level.charAt(0).toUpperCase() + level.slice(1);
}

// Format date for display
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
}

// Setup devices back button
function setupDevicesBackButton() {
    const backBtn = document.getElementById('btn-back-devices');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            document.getElementById('devices-view').style.display = 'none';
            document.getElementById('projects-view').style.display = 'block';
            currentProject = null;
        });
    }
}

// Setup search and filters
function setupDevicesSearchAndFilters() {
    const searchInput = document.getElementById('devices-search');
    if (searchInput) {
        searchInput.addEventListener('input', filterDevices);
    }
}

// Filter devices based on search and checkboxes
function filterDevices() {
    const searchQuery = document.getElementById('devices-search')?.value?.toLowerCase() || '';
    const filterNonCompliant = document.getElementById('filter-non-compliant')?.checked || false;
    const filterNotEncrypted = document.getElementById('filter-not-encrypted')?.checked || false;
    const filterStale = document.getElementById('filter-stale')?.checked || false;
    
    const filtered = allDevicesData.filter(device => {
        // Search filter
        if (searchQuery) {
            const matchesSearch = (
                device.deviceName?.toLowerCase().includes(searchQuery) ||
                device.userPrincipalName?.toLowerCase().includes(searchQuery)
            );
            if (!matchesSearch) return false;
        }
        
        // Non-compliant filter
        if (filterNonCompliant && device.complianceState === 'compliant') {
            return false;
        }
        
        // Not encrypted filter
        if (filterNotEncrypted && device.isEncrypted) {
            return false;
        }
        
        // Stale filter
        if (filterStale) {
            if (!device.lastSyncDateTime) return true;
            const daysSinceSync = (Date.now() - new Date(device.lastSyncDateTime).getTime()) / (1000 * 60 * 60 * 24);
            if (daysSinceSync <= 7) return false;
        }
        
        return true;
    });
    
    populateDevicesTable(filtered);
    console.log(`[Devices] Showing ${filtered.length} of ${allDevicesData.length} devices`);
}

// Show loading state
function showDevicesLoadingState() {
    const containers = [
        'high-risk-devices-list',
        'security-alerts-feed',
        'devices-insights-container',
        'devices-tbody'
    ];
    
    containers.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.innerHTML = '<p style="color: #94a3b8; padding: 20px; text-align: center;"><i class="fas fa-spinner fa-spin"></i> Loading...</p>';
        }
    });
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('devices-search');
    if (searchInput) {
        searchInput.addEventListener('input', filterDevices);
    }
});

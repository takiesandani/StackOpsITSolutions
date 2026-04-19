// ================================================
// Backup and Recovery DASHBOARD - FRONTEND LOGIC
// Microsoft 365 Data Storage & Backup Intelligence
// ================================================

let dataProtectionData = null;
let dataProtectionChartInstances = {
    storageDistribution: null,
    userActivity: null,
    dataGrowth: null
};

/**
 * Main entry point: Fetch Backup and Recovery data from API
 */
async function fetchDataProtectionData(project) {
    try {
        console.log('[Backup and Recovery] Fetching dashboard metrics...');
        const authToken = localStorage.getItem('authToken');
        
        const response = await fetch('/api/data-protection', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch data protection data: ${response.statusText}`);
        }

        dataProtectionData = await response.json();
        console.log('[Data Protection] Data received:', dataProtectionData);

        if (dataProtectionData.success) {
            initializeDataProtectionDashboard(dataProtectionData);
            
            // Update project card with real data
            if (project) {
                updateDataProtectionProjectCard(project, dataProtectionData);
            }
        }
    } catch (error) {
        console.error('[Data Protection] Error fetching data:', error);
        document.getElementById('data-protection-view').innerHTML = 
            `<div class="container-fluid"><div class="monitor-card" style="text-align: center; padding: 40px;">
                <p style="color: #ff6b6b; margin: 0;"><i class="fas fa-exclamation-circle"></i> Error loading data protection metrics</p>
                <p style="color: #94a3b8; font-size: 12px; margin-top: 8px;">${error.message}</p>
            </div></div>`;
    }
}

/**
 * Update the Data Protection project card with live metrics
 */
function updateDataProtectionProjectCard(project, data) {
    console.log('[Data Protection] Updating project card...');
    
    if (!project) return;
    
    const summary = data.summary || {};
    
    project.status = 'Active';
    project.cardMetrics = [
        { 
            label: "Total Storage", 
            value: `: ${summary.totalStorageGB || 0} GB`, 
            icon: "fas fa-database" 
        },
        { 
            label: "Active Users", 
            value: `: ${summary.activeUsers || 0}`, 
            icon: "fas fa-users" 
        }
    ];
    
    project.cardFooter = `${summary.totalStorageGB || 0} GB of business data | Backup: ${summary.backupStatus || 'Not configured'}`;
    project.lastUpdate = data.fetchedAt ? new Date(data.fetchedAt).toLocaleTimeString() : 'Just now';
    project.securityScore = summary.dataProtectionScore || 0;
    
    // Update the currently displayed project card
    displayCurrentProject();
}

/**
 * Initialize the entire data protection dashboard
 */
function initializeDataProtectionDashboard(data) {
    console.log('[Data Protection] Initializing dashboard...');
    
    updateDataProtectionSummary(data.summary);
    updateDataProtectionRisksPanel(data);
    initializeDataProtectionCharts(data);
    populateStorageByServiceTable(data.storageByService);
    populateDataProtectionInsights(data.insights);
    setupDataProtectionBackButton();
    
    console.log('[Data Protection] Dashboard initialized successfully');
}

/**
 * Update summary cards with live data
 */
function updateDataProtectionSummary(summary) {
    console.log('[Data Protection] Updating summary cards...');

    const updates = [
        { id: 'dp-total-storage', value: summary.totalStorageGB || 0, suffix: ' GB', severity: 'info' },
        { id: 'dp-onedrive-storage', value: summary.oneDriveStorageGB || 0, suffix: ' GB', severity: 'info' },
        { id: 'dp-sharepoint-storage', value: summary.sharePointStorageGB || 0, suffix: ' GB', severity: 'info' },
        { id: 'dp-exchange-storage', value: summary.exchangeStorageGB || 0, suffix: ' GB', severity: 'info' },
        { id: 'dp-active-users', value: summary.activeUsers || 0, suffix: '', severity: 'success' }
    ];

    updates.forEach(item => {
        const element = document.getElementById(item.id);
        if (element) {
            const displayValue = item.suffix ? item.value + item.suffix : item.value;
            element.textContent = displayValue;
            const card = element.closest('.data-stat-card');
            if (card) {
                card.className = `data-stat-card ${item.severity}`;
            }
        }
    });

    // Update backup status
    const backupElement = document.getElementById('dp-backup-status');
    if (backupElement) {
        const status = summary.backupStatus || 'Not configured';
        const statusColor = status === 'No backup configured' ? '#ff6b6b' : '#ffc107';
        backupElement.textContent = status;
        backupElement.style.color = statusColor;
    }
}

/**
 * Build and display data protection risks panel
 */
function updateDataProtectionRisksPanel(data) {
    console.log('[Data Protection] Building risks panel...');
    const risksContainer = document.getElementById('dp-risks-container');
    
    if (!risksContainer) {
        console.warn('[Data Protection] Risks container not found');
        return;
    }

    const risks = [];
    const summary = data.summary || {};

    // No backup risk
    if (summary.backupStatus === 'No backup configured') {
        risks.push({
            title: '🔴 No Backup Solution',
            value: 'CRITICAL',
            severity: 'critical',
            description: 'No external backup system detected. Data cannot be fully recovered in a compromise scenario.',
            action: 'Configure Backup',
            filter: 'backup'
        });
    }

    // Limited recovery risk
    if (summary.backupStatus === 'Microsoft-native retention only') {
        risks.push({
            title: '⚠️ Limited Recovery',
            value: 'HIGH',
            severity: 'warning',
            description: 'Retention policies are not a backup solution. Data loss from deletion or compromise cannot be fully recovered.',
            action: 'Review Strategy',
            filter: 'recovery'
        });
    }

    // High storage concentration
    if (summary.largestService) {
        const percentage = Math.round(summary.largestServicePercent || 0);
        if (percentage > 50) {
            risks.push({
                title: '📊 High Storage Concentration',
                value: `${percentage}%`,
                severity: 'warning',
                description: `${summary.largestService} holds over 50% of company data. Single point of failure risk.`,
                action: 'Review Distribution',
                filter: 'concentration'
            });
        }
    }

    // Inactive users with data
    if (summary.inactiveUsersWithData && summary.inactiveUsersWithData > 0) {
        risks.push({
            title: '👥 Inactive Users',
            value: summary.inactiveUsersWithData,
            severity: 'info',
            description: `${summary.inactiveUsersWithData} inactive user(s) still store data. Consider archival or cleanup.`,
            action: 'Review Users',
            filter: 'inactive'
        });
    }

    // Render risks
    if (risks.length === 0) {
        risksContainer.innerHTML = '<p style="color: #10b981; padding: 20px; text-align: center;">✓ All key data protection metrics are healthy</p>';
    } else {
        risksContainer.innerHTML = risks.map(risk => `
            <div class="risk-item ${risk.severity}">
                <div class="risk-header">
                    <h4>${risk.title}</h4>
                    <span class="risk-count">${risk.value}</span>
                </div>
                <p class="risk-description">${risk.description}</p>
                <button class="risk-action-btn" onclick="filterDataProtectionData('${risk.filter}')">${risk.action} →</button>
            </div>
        `).join('');
    }

    console.log(`[Data Protection] Risks panel created with ${risks.length} items`);
}

/**
 * Initialize charts with data protection data
 */
function initializeDataProtectionCharts(data) {
    console.log('[Data Protection] Initializing charts...');

    // Storage Distribution Chart
    const storageCtx = document.getElementById('dpStorageDistributionChart');
    if (storageCtx && data.storageByService) {
        const services = data.storageByService.map(s => s.service);
        const storages = data.storageByService.map(s => s.storageGB);
        
        if (dataProtectionChartInstances.storageDistribution) {
            dataProtectionChartInstances.storageDistribution.destroy();
        }

        dataProtectionChartInstances.storageDistribution = new Chart(storageCtx, {
            type: 'doughnut',
            data: {
                labels: services,
                datasets: [{
                    data: storages,
                    backgroundColor: [
                        '#6366f1', // Exchange - Indigo
                        '#3b82f6', // OneDrive - Blue
                        '#06b6d4'  // SharePoint - Cyan
                    ],
                    borderColor: 'rgba(30, 41, 59, 1)',
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
                            color: '#e2e8f0',
                            font: { size: 12, weight: '200' },
                            padding: 16
                        }
                    }
                }
            }
        });
    }

    // User Activity Chart
    const userActivityCtx = document.getElementById('dpUserActivityChart');
    if (userActivityCtx && data.summary) {
        const activeUsers = data.summary.activeUsers || 0;
        const inactiveUsers = (data.summary.totalUsers || 0) - activeUsers;
        
        if (dataProtectionChartInstances.userActivity) {
            dataProtectionChartInstances.userActivity.destroy();
        }

        dataProtectionChartInstances.userActivity = new Chart(userActivityCtx, {
            type: 'doughnut',
            data: {
                labels: ['Active', 'Inactive'],
                datasets: [{
                    data: [activeUsers, inactiveUsers],
                    backgroundColor: [
                        '#10b981', // Green
                        '#94a3b8'  // Gray
                    ],
                    borderColor: 'rgba(30, 41, 59, 1)',
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
                            color: '#e2e8f0',
                            font: { size: 12, weight: '200' },
                            padding: 16
                        }
                    }
                }
            }
        });
    }

    console.log('[Data Protection] Charts initialized');
}

/**
 * Populate storage by service table
 */
function populateStorageByServiceTable(storageData) {
    console.log('[Data Protection] Populating storage table...');
    const tbody = document.getElementById('dp-storage-tbody');
    
    if (!tbody) return;

    if (!storageData || storageData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 20px; color: #94a3b8;">No storage data available</td></tr>';
        return;
    }

    const tableHTML = storageData.map(service => {
        const backupStatus = '⚠️ No backup';
        
        return `
            <tr class="storage-row">
                <td>
                    <div class="service-name">
                        <i class="fas ${service.icon || 'fa-database'}"></i>
                        ${service.service}
                    </div>
                </td>
                <td>${service.storageGB} GB</td>
                <td>
                    <span class="status-badge warning">
                        ${backupStatus}
                    </span>
                </td>
            </tr>
        `;
    }).join('');

    tbody.innerHTML = tableHTML;
    console.log(`[Data Protection] Storage table populated with ${storageData.length} services`);
}

/**
 * Populate actionable insights
 */
function populateDataProtectionInsights(insights) {
    console.log('[Data Protection] Populating insights...');
    const container = document.getElementById('dp-insights-container');
    
    if (!container) return;

    if (!insights || insights.length === 0) {
        container.innerHTML = '<p style="color: #94a3b8; text-align: center; padding: 20px;">No insights available</p>';
        return;
    }

    const insightsHTML = insights.map(insight => {
        const iconMap = {
            'critical': 'fa-fire',
            'warning': 'fa-exclamation-triangle',
            'info': 'fa-lightbulb'
        };
        
        return `
            <div class="insight-card ${insight.type}">
                <div class="insight-header">
                    <i class="fas ${iconMap[insight.type] || 'fa-lightbulb'}"></i>
                    <h4>${insight.message}</h4>
                </div>
                <p class="insight-detail">Count: <strong>${insight.count}</strong></p>
                <button class="insight-action-btn" onclick="handleDataProtectionInsightAction('${insight.action}')">
                    ${insight.action} →
                </button>
            </div>
        `;
    }).join('');

    container.innerHTML = insightsHTML;
    console.log(`[Data Protection] Insights populated: ${insights.length}`);
}

/**
 * Setup back button for data protection dashboard
 */
function setupDataProtectionBackButton() {
    const backBtn = document.getElementById('btn-back-data-protection');
    if (backBtn) {
        backBtn.onclick = function() {
            resetDataProtectionDashboard();
        };
    }
}

/**
 * Reset and return to projects view
 */
function resetDataProtectionDashboard() {
    console.log('[Data Protection] Resetting dashboard...');
    
    // Hide email security view
    document.getElementById('data-protection-view').style.display = 'none';
    
    // Show projects view
    document.getElementById('projects-view').style.display = 'block';
    
    // Restore site header
    const siteHeader = document.querySelector('.site-header');
    if (siteHeader) {
        siteHeader.classList.remove('header-hidden');
        siteHeader.classList.add('header-visible');
    }
    
    // Scroll to top
    window.scrollTo(0, 0);
    
    currentProject = null;
}

/**
 * Utility: Format time ago
 */
function getTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + ' years ago';
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + ' months ago';
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + ' days ago';
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + ' hours ago';
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + ' minutes ago';
    return Math.floor(seconds) + ' seconds ago';
}

/**
 * Helper: Filter data protection insights
 */
function filterDataProtectionData(filterType) {
    console.log(`[Data Protection] Filtering data by: ${filterType}`);
    // Scroll to storage table
    const storageTable = document.querySelector('.dp-table-container');
    if (storageTable) {
        storageTable.scrollIntoView({ behavior: 'smooth' });
    }
}

/**
 * Helper: Handle insight actions
 */
function handleDataProtectionInsightAction(action) {
    console.log(`[Data Protection] Handling action: ${action}`);
    const storageTable = document.querySelector('.dp-table-container');
    if (storageTable) {
        storageTable.scrollIntoView({ behavior: 'smooth' });
    }
}

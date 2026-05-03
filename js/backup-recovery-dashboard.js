// ================================================
// Backup & Recovery DASHBOARD - FRONTEND LOGIC
// Microsoft 365 data protection & disaster recovery
// ================================================

let backupRecoveryData = null;
let backupChartInstances = {
    storageDistribution: null,
    userActivity: null,
    serviceComparison: null
};

/**
 * Main entry point: Fetch backup recovery data from API
 */
async function fetchBackupRecoveryData(project) {
    try {
        console.log('[Backup Recovery] Fetching backup recovery data...');
        const authToken = localStorage.getItem('authToken');
        
        const response = await fetch('/api/db/backup-recovery', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch backup recovery data: ${response.statusText}`);
        }

        backupRecoveryData = await response.json();
        console.log('[Backup Recovery] Data received:', backupRecoveryData);

        if (backupRecoveryData.success) {
            initializeBackupRecoveryDashboard(backupRecoveryData);
            
            // Update project card with real data
            if (project) {
                updateBackupRecoveryProjectCard(project, backupRecoveryData);
            }
        }
    } catch (error) {
        console.error('[Backup Recovery] Error fetching data:', error);
        document.getElementById('backup-recovery-view').innerHTML = 
            `<div class="container-fluid"><div class="monitor-card" style="text-align: center; padding: 40px;">
                <p style="color: #ff6b6b; margin: 0;"><i class="fas fa-exclamation-circle"></i> Error loading backup recovery data</p>
                <p style="color: #94a3b8; font-size: 12px; margin-top: 8px;">${error.message}</p>
            </div></div>`;
    }
}

/**
 * Update the Backup Recovery project card with live metrics
 */
function updateBackupRecoveryProjectCard(project, data) {
    console.log('[Backup Recovery] Updating project card...');
    
    if (!project) return;
    
    const summary = data.summary || {};
    const totalStorageGB = (summary.totalStorageGB || 0).toFixed(1);
    
    project.status = 'Active';
    project.cardMetrics = [
        { 
            label: "Total Storage", 
            value: `: ${totalStorageGB}GB`, 
            icon: "fas fa-database" 
        },
        { 
            label: "Active Users", 
            value: `: ${summary.activeUsersCount || 0}`, 
            icon: "fas fa-users" 
        }
    ];
    
    const backupStatus = summary.backupConfigured ? 'Microsoft-native retention only' : 'No backup configured';
    project.cardFooter = `${totalStorageGB}GB of company data stored across Microsoft 365 | ${backupStatus}`;
    project.lastUpdate = data.fetchedAt ? new Date(data.fetchedAt).toLocaleTimeString() : 'Just now';
    
    // Update the currently displayed project card
    displayCurrentProject();
}

/**
 * Initialize the entire backup recovery dashboard
 */
function initializeBackupRecoveryDashboard(data) {
    console.log('[Backup Recovery] Initializing dashboard...');
    
    updateBackupRecoverySummary(data.summary);
    updateBackupRisksPanel(data);
    initializeBackupRecoveryCharts(data);
    populateStorageInsights(data);
    populateStorageTable(data.storage);
    populateAdvancedInsights(data.insights);
    setupBackupRecoveryBackButton();
    setupDashboardInteractivity(data);
    
    console.log('[Backup Recovery] Dashboard initialized successfully');
}

/**
 * Setup interactivity for the dashboard (clicks on metrics, insights, etc.)
 */
function setupDashboardInteractivity(data) {
    console.log('[Backup Recovery] Setting up interactivity...');

    // Clicking stat cards
    const statCards = document.querySelectorAll('.backup-stat-card');
    statCards.forEach(card => {
        card.addEventListener('click', () => {
            const title = card.querySelector('p').textContent;
            const value = card.querySelector('h3').textContent;
            showBackupDetailsModal(title, `Detailed breakdown for ${title}`, data);
        });
    });

    // Clicks on table rows
    const tableRows = document.querySelectorAll('.backup-storage-table tbody tr');
    tableRows.forEach(row => {
        row.style.cursor = 'pointer';
        row.addEventListener('click', () => {
            const area = row.cells[0].textContent.trim();
            showBackupDetailsModal(area, `Storage breakdown for ${area}`, data);
        });
    });

    // Clicks on insight cards
    const insightCards = document.querySelectorAll('.insight-card');
    insightCards.forEach(card => {
        card.style.cursor = 'pointer';
        card.addEventListener('click', () => {
            const title = card.querySelector('h4').textContent;
            showBackupDetailsModal(title, `Details: ${title}`, data);
        });
    });
}

/**
 * Show detailed modal with breakdown data
 */
function showBackupDetailsModal(title, subtitle, data) {
    const modal = document.getElementById('backup-recovery-modal');
    const modalTitle = document.getElementById('backup-modal-title');
    const modalBody = document.getElementById('backup-modal-body');
    
    if (!modal || !modalBody) return;

    modalTitle.innerHTML = `<span style="color: #3b82f6;">${title}</span> - ${subtitle}`;
    
    let contentHTML = '';
    const storage = data.storage || {};

    if (title.toLowerCase().includes('exchange')) {
        const users = storage.users.filter(u => u.items !== undefined);
        contentHTML = renderDetailsList(users, 'User', 'storage', 'items', 'Mail Items');
    } else if (title.toLowerCase().includes('onedrive')) {
        const users = storage.users.filter(u => u.files !== undefined && !u.url);
        contentHTML = renderDetailsList(users, 'User', 'storage', 'files', 'Files');
    } else if (title.toLowerCase().includes('sharepoint')) {
        const sites = storage.sites || [];
        contentHTML = renderDetailsList(sites, 'Site URL', 'storage', 'files', 'Files');
    } else if (title.toLowerCase().includes('inactive')) {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const inactiveUsers = storage.users.filter(u => {
            if (!u.lastActivity) return true;
            return new Date(u.lastActivity) < thirtyDaysAgo;
        });
        contentHTML = renderDetailsList(inactiveUsers, 'Inactive User', 'storage', 'lastActivity', 'Last Active');
    } else {
        // Default: show top consumers
        contentHTML = renderDetailsList(storage.users.slice(0, 15), 'Top Consumer', 'storage', 'lastActivity', 'Last Active');
    }

    modalBody.innerHTML = contentHTML;
    modal.style.display = 'flex';
}

/**
 * Helper: Render a list of detail items for the modal
 */
function renderDetailsList(items, nameLabel, valueKey, metaKey, metaLabel) {
    if (!items || items.length === 0) {
        return '<p style="text-align: center; color: #94a3b8; padding: 40px;">No detailed data available for this section.</p>';
    }

    return `<div class="details-list">
        ${items.map(item => {
            const name = item.user || item.url || item.name || 'Unknown';
            const value = (item[valueKey] / (1024 ** 3)).toFixed(2) + ' GB';
            let metaValue = item[metaKey];
            
            if (metaKey === 'lastActivity') {
                metaValue = metaValue ? new Date(metaValue).toLocaleDateString() : 'Never';
            }

            return `
                <div class="details-item">
                    <div class="details-item-header">
                        <span class="details-item-name">${name}</span>
                        <span class="details-item-value">${value}</span>
                    </div>
                    <div class="details-item-meta">
                        <span><strong>${metaLabel}:</strong> ${metaValue}</span>
                        ${item.status ? `<span><strong>Status:</strong> ${item.status}</span>` : ''}
                    </div>
                </div>
            `;
        }).join('')}
    </div>`;
}

/**
 * Close the backup detailed modal
 */
function closeBackupModal() {
    const modal = document.getElementById('backup-recovery-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

/**
 * Update summary cards with live data
 */
function updateBackupRecoverySummary(summary) {
    console.log('[Backup Recovery] Updating summary cards...');

    const updates = [
        { 
            id: 'backup-total-storage', 
            value: `${(summary.totalStorageGB || 0).toFixed(1)}GB`, 
            severity: summary.totalStorageGB > 500 ? 'warning' : 'info' 
        },
        { 
            id: 'backup-onedrive-storage', 
            value: `${(summary.oneDriveStorageGB || 0).toFixed(1)}GB`, 
            severity: 'info' 
        },
        { 
            id: 'backup-sharepoint-storage', 
            value: `${(summary.sharePointStorageGB || 0).toFixed(1)}GB`, 
            severity: 'info' 
        },
        { 
            id: 'backup-exchange-storage', 
            value: `${(summary.exchangeStorageGB || 0).toFixed(1)}GB`, 
            severity: 'info' 
        }
    ];

    updates.forEach(item => {
        const element = document.getElementById(item.id);
        if (element) {
            element.textContent = item.value;
            const card = element.closest('.backup-stat-card');
            if (card) {
                card.className = `backup-stat-card ${item.severity}`;
            }
        }
    });

    // Update active users
    const activeUsersElement = document.getElementById('backup-active-users');
    if (activeUsersElement) {
        activeUsersElement.textContent = summary.activeUsersCount || 0;
    }

    // Update services covered (always 3)
    const servicesCoveredElement = document.getElementById('backup-services-covered');
    if (servicesCoveredElement) {
        servicesCoveredElement.textContent = '3';
    }
}

/**
 * Build and display backup recovery risks panel
 */
function updateBackupRisksPanel(data) {
    console.log('[Backup Recovery] Building risks panel...');
    const risksContainer = document.getElementById('backup-risks-container');
    
    if (!risksContainer) {
        console.warn('[Backup Recovery] Risks container not found');
        return;
    }

    const risks = [];
    const summary = data.summary || {};
    const storage = data.storage || {};

    // No backup configured
    if (!summary.backupConfigured) {
        risks.push({
            title: '❌ No Backup Solution Configured',
            value: '❌',
            severity: 'critical',
            description: 'External backup solution is not configured',
            details: 'Data cannot be fully recovered in a compromise scenario',
            impact: `${(summary.totalStorageGB || 0).toFixed(1)}GB at risk`,
            action: 'Configure Backup'
        });
    } else {
        risks.push({
            title: '⚠️ Limited Recovery Capability',
            value: '⚠️',
            severity: 'warning',
            description: 'Retention policies are not full backups',
            details: 'Only Microsoft-native retention policies configured',
            impact: 'Limited ability to recover deleted or corrupted data',
            action: 'Review Retention'
        });
    }

    // Inactive users holding data
    if (summary.inactiveUsersCount > 0) {
        const inactiveStorageGB = (storage.inactiveUserStorageGB || 0).toFixed(1);
        risks.push({
            title: `👤 Inactive Users Holding Data`,
            value: summary.inactiveUsersCount,
            severity: summary.inactiveUsersCount > 5 ? 'warning' : 'info',
            description: `${summary.inactiveUsersCount} inactive user${summary.inactiveUsersCount > 1 ? 's' : ''} holding data`,
            details: `${inactiveStorageGB}GB stored by users with no recent activity`,
            impact: `${inactiveStorageGB}GB storage`,
            action: 'Review Inactive'
        });
    }

    // Storage concentration risk
    if (storage.byService) {
        const services = storage.byService;
        const totalStorage = summary.totalStorageGB || 1;
        
        let maxService = { name: '', size: 0, percent: 0 };
        for (const [service, size] of Object.entries(services)) {
            const percent = (size / totalStorage) * 100;
            if (percent > maxService.percent) {
                maxService = { name: service, size, percent };
            }
        }

        if (maxService.percent > 50) {
            const serviceName = maxService.name.charAt(0).toUpperCase() + maxService.name.slice(1);
            risks.push({
                title: `📊 Storage Concentration Risk`,
                value: `${maxService.percent.toFixed(0)}%`,
                severity: 'warning',
                description: `${serviceName} stores majority of company data`,
                details: `${maxService.percent.toFixed(1)}% of all data is in a single service`,
                impact: `${maxService.size.toFixed(1)}GB in ${serviceName}`,
                action: 'View Details'
            });
        }
    }

    // Data loss risk from no external backup
    if (!summary.backupConfigured) {
        risks.push({
            title: '🚨 High Risk of Permanent Data Loss',
            value: '🚨',
            severity: 'critical',
            description: 'No external backup reduces recovery options',
            details: 'Only Microsoft-native recovery features available; no third-party protection',
            impact: `All ${(summary.totalStorageGB || 0).toFixed(1)}GB is at risk`,
            action: 'Implement Backup'
        });
    }

    // Render risks
    if (risks.length === 0) {
        risksContainer.innerHTML = '<p style="color: #10b981; padding: 20px; text-align: center;">✓ No critical risks detected</p>';
    } else {
        risksContainer.innerHTML = risks.map(risk => `
            <div class="risk-item ${risk.severity}">
                <div class="risk-header">
                    <h4>${risk.title}</h4>
                    <span class="risk-value">${risk.value}</span>
                </div>
                <p class="risk-description">${risk.description}</p>
                <p class="risk-details"><strong>Detail:</strong> ${risk.details}</p>
                <p class="risk-impact"><strong>Impact:</strong> ${risk.impact}</p>
                <button class="risk-action-btn">${risk.action} →</button>
            </div>
        `).join('');
    }

    console.log(`[Backup Recovery] Risks panel created with ${risks.length} items`);
}

/**
 * Initialize charts with backup recovery data
 */
function initializeBackupRecoveryCharts(data) {
    console.log('[Backup Recovery] Initializing charts...');

    const summary = data.summary || {};
    const storage = data.storage || {};

    // Storage Distribution Pie Chart
    const storageCtx = document.getElementById('backupStorageChart');
    if (storageCtx && storage.byService) {
        if (backupChartInstances.storageDistribution) {
            backupChartInstances.storageDistribution.destroy();
        }

        backupChartInstances.storageDistribution = new Chart(storageCtx, {
            type: 'doughnut',
            data: {
                labels: ['OneDrive', 'SharePoint', 'Exchange'],
                datasets: [{
                    data: [
                        storage.byService.onedrive || 0,
                        storage.byService.sharepoint || 0,
                        storage.byService.exchange || 0
                    ],
                    backgroundColor: [
                        '#0078d4', // OneDrive - Blue
                        '#107c10', // SharePoint - Green
                        '#0060b3'  // Exchange - Dark Blue
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
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const value = context.parsed || 0;
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percent = ((value / total) * 100).toFixed(1);
                                return `${context.label}: ${value.toFixed(1)}GB (${percent}%)`;
                            }
                        }
                    }
                }
            }
        });
    }

    // User Activity Chart (Active vs Inactive)
    const activityCtx = document.getElementById('backupActivityChart');
    if (activityCtx) {
        if (backupChartInstances.userActivity) {
            backupChartInstances.userActivity.destroy();
        }

        backupChartInstances.userActivity = new Chart(activityCtx, {
            type: 'doughnut',
            data: {
                labels: ['Active Users', 'Inactive Users'],
                datasets: [{
                    data: [
                        summary.activeUsersCount || 0,
                        summary.inactiveUsersCount || 0
                    ],
                    backgroundColor: [
                        '#10b981', // Active - Green
                        '#fec54b'  // Inactive - Yellow
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

    // Service Comparison Bar Chart
    const comparisonCtx = document.getElementById('backupComparisonChart');
    if (comparisonCtx && storage.byService) {
        if (backupChartInstances.serviceComparison) {
            backupChartInstances.serviceComparison.destroy();
        }

        backupChartInstances.serviceComparison = new Chart(comparisonCtx, {
            type: 'bar',
            data: {
                labels: ['OneDrive', 'SharePoint', 'Exchange'],
                datasets: [{
                    label: 'Storage (GB)',
                    data: [
                        storage.byService.onedrive || 0,
                        storage.byService.sharepoint || 0,
                        storage.byService.exchange || 0
                    ],
                    backgroundColor: [
                        '#0078d4',
                        '#107c10',
                        '#0060b3'
                    ],
                    borderRadius: 6,
                    borderSkipped: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                indexAxis: 'y',
                plugins: {
                    legend: {
                        labels: {
                            color: '#e2e8f0',
                            font: { size: 12, weight: '200' }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#94a3b8', font: { size: 11, weight: '200' } },
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        title: { display: true, text: 'Storage (GB)', color: '#e2e8f0' }
                    },
                    y: {
                        ticks: { color: '#94a3b8', font: { size: 11, weight: '200' } },
                        grid: { display: false }
                    }
                }
            }
        });
    }

    console.log('[Backup Recovery] Charts initialized');
}

/**
 * Populate storage insights
 */
function populateStorageInsights(data) {
    console.log('[Backup Recovery] Populating storage insights...');
    const insightsContainer = document.getElementById('backup-insights-container');
    
    if (!insightsContainer) return;

    const storage = data.storage || {};
    const summary = data.summary || {};
    const insights = [];

    // Largest data source
    const services = storage.byService || {};
    let maxService = { name: '', size: 0 };
    for (const [service, size] of Object.entries(services)) {
        if (size > maxService.size) {
            maxService = { name: service.charAt(0).toUpperCase() + service.slice(1), size };
        }
    }
    if (maxService.size > 0) {
        const percent = ((maxService.size / summary.totalStorageGB) * 100).toFixed(0);
        insights.push({
            type: 'info',
            icon: 'fa-database',
            message: `${maxService.name} stores ${percent}% of company data`,
            detail: `${maxService.size.toFixed(1)}GB in ${maxService.name}`
        });
    }

    // Inactive users
    if (summary.inactiveUsersCount > 0) {
        const inactivePercent = ((summary.inactiveUsersCount / (summary.activeUsersCount + summary.inactiveUsersCount)) * 100).toFixed(0);
        insights.push({
            type: 'warning',
            icon: 'fa-user-slash',
            message: `${summary.inactiveUsersCount}GB stored by inactive users (${inactivePercent}% of users)`,
            detail: `${storage.inactiveUserStorageGB ? storage.inactiveUserStorageGB.toFixed(1) : 0}GB total`
        });
    }

    // Storage growth or concentration
    if (summary.totalStorageGB > 500) {
        insights.push({
            type: 'warning',
            icon: 'fa-chart-line',
            message: `Large data volume detected (${summary.totalStorageGB.toFixed(1)}GB)`,
            detail: 'Monitor storage growth trends and plan capacity'
        });
    }

    // Backup status recommendation
    insights.push({
        type: summary.backupConfigured ? 'success' : 'critical',
        icon: summary.backupConfigured ? 'fa-check-circle' : 'fa-exclamation-circle',
        message: summary.backupConfigured ? 
            'Microsoft-native retention policies active' : 
            'No external backup solution configured',
        detail: summary.backupConfigured ? 
            'Consider additional third-party backup for enhanced protection' : 
            'Implement external backup solution immediately'
    });

    // Render insights
    if (insights.length === 0) {
        insightsContainer.innerHTML = '<p style="color: #94a3b8; text-align: center; padding: 20px;">No additional insights available</p>';
    } else {
        insightsContainer.innerHTML = insights.map(insight => `
            <div class="insight-card ${insight.type}">
                <div class="insight-icon">
                    <i class="fas ${insight.icon}"></i>
                </div>
                <div class="insight-content">
                    <h4>${insight.message}</h4>
                    <p>${insight.detail}</p>
                </div>
            </div>
        `).join('');
    }

    console.log(`[Backup Recovery] Insights populated with ${insights.length} items`);
}

/**
 * Populate storage data table
 */
function populateStorageTable(storage) {
    console.log('[Backup Recovery] Populating storage table...');
    const tbody = document.getElementById('backup-storage-tbody');
    
    if (!tbody) return;

    const storageData = storage.byService || {};
    const tableRows = [
        {
            area: 'Exchange Online',
            storage: (storageData.exchange || 0).toFixed(1),
            status: '⚠️ No backup',
            icon: 'fa-envelope'
        },
        {
            area: 'OneDrive for Business',
            storage: (storageData.onedrive || 0).toFixed(1),
            status: '⚠️ No backup',
            icon: 'fa-cloud'
        },
        {
            area: 'SharePoint Online',
            storage: (storageData.sharepoint || 0).toFixed(1),
            status: '⚠️ No backup',
            icon: 'fa-sitemap'
        }
    ];

    if (tableRows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 20px; color: #94a3b8;">No storage data available</td></tr>';
        return;
    }

    const tableHTML = tableRows.map(row => `
        <tr>
            <td>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <i class="fas ${row.icon}" style="color: #0078d4;"></i>
                    ${row.area}
                </div>
            </td>
            <td>${row.storage}GB</td>
            <td>
                <span class="status-badge" style="background: rgba(255, 107, 107, 0.2); color: #ff6b6b; padding: 4px 8px; border-radius: 4px; font-size: 12px;">
                    ${row.status}
                </span>
            </td>
        </tr>
    `).join('');

    tbody.innerHTML = tableHTML;
    console.log(`[Backup Recovery] Storage table populated with ${tableRows.length} rows`);
}

/**
 * Populate advanced insights
 */
function populateAdvancedInsights(insights) {
    console.log('[Backup Recovery] Populating advanced insights...');
    const advancedContainer = document.getElementById('backup-advanced-insights-container');
    
    if (!advancedContainer) return;

    const actionableInsights = [
        {
            title: 'Implement External Backup Solution',
            icon: 'fa-shield-check',
            description: 'Deploy a third-party backup solution to protect data beyond Microsoft-native retention'
        },
        {
            title: 'Review Inactive User Data',
            icon: 'fa-users-slash',
            description: 'Audit and potentially remove data from inactive users to optimize storage'
        },
        {
            title: 'Monitor Storage Growth Trends',
            icon: 'fa-chart-line',
            description: 'Track storage consumption patterns to plan capacity and prevent overage'
        }
    ];

    const insightsHTML = actionableInsights.map(insight => `
        <div class="actionable-insight-item">
            <div class="insight-icon-bg">
                <i class="fas ${insight.icon}" style="font-size: 18px; color: #0078d4;"></i>
            </div>
            <div class="insight-text">
                <h4>${insight.title}</h4>
                <p>${insight.description}</p>
            </div>
        </div>
    `).join('');

    advancedContainer.innerHTML = insightsHTML;
    console.log(`[Backup Recovery] Advanced insights populated`);
}

/**
 * Setup backup recovery back button
 */
function setupBackupRecoveryBackButton() {
    const backButton = document.getElementById('btn-back-backup-recovery');
    if (backButton) {
        backButton.addEventListener('click', () => {
            console.log('[Backup Recovery] Back button clicked');
            resetBackupRecoveryDashboard();
        });
    }
}

/**
 * Reset backup recovery dashboard when returning to projects
 */
function resetBackupRecoveryDashboard() {
    console.log('[Backup Recovery] Resetting dashboard...');
    
    // Hide dashboard view
    const backupView = document.getElementById('backup-recovery-view');
    if (backupView) {
        backupView.style.display = 'none';
    }
    
    // Destroy charts
    Object.values(backupChartInstances).forEach(chart => {
        if (chart) chart.destroy();
    });
    backupChartInstances = {
        storageDistribution: null,
        userActivity: null,
        serviceComparison: null
    };
    
    // Reset data
    backupRecoveryData = null;
    currentProject = null;
    
    // Show projects view
    const projectsView = document.getElementById('projects-view');
    if (projectsView) {
        projectsView.style.display = 'block';
    }
    
    console.log('[Backup Recovery] Dashboard reset complete');
}

/**
 * Helper function: Get time ago string
 */
function getTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    const intervals = {
        year: 31536000,
        month: 2592000,
        week: 604800,
        day: 86400,
        hour: 3600,
        minute: 60
    };

    for (const [key, secondsInInterval] of Object.entries(intervals)) {
        const interval = Math.floor(seconds / secondsInInterval);
        if (interval >= 1) {
            return `${interval} ${key}${interval > 1 ? 's' : ''} ago`;
        }
    }
    return 'just now';
}

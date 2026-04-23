// ================================================
// Email Security DASHBOARD - FRONTEND LOGIC
// Real-time email threat intelligence interface
// ================================================

let emailSecurityData = null;
let emailChartInstances = {
    threatType: null,
    severity: null,
    timeline: null
};
let currentEmailAlertFilter = null; // Track active user filter

/**
 * Main entry point: Fetch email security data from API
 */
async function fetchEmailSecurityData(project) {
    try {
        console.log('[Email Security] Fetching email security data...');
        const authToken = localStorage.getItem('authToken');
        
        const response = await fetch('/api/email-security', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch email security data: ${response.statusText}`);
        }

        emailSecurityData = await response.json();
        console.log('[Email Security] Data received:', emailSecurityData);

        if (emailSecurityData.success) {
            initializeEmailSecurityDashboard(emailSecurityData);
            
            // Update project card with real data
            if (project) {
                updateEmailSecurityProjectCard(project, emailSecurityData);
            }
        }
    } catch (error) {
        console.error('[Email Security] Error fetching data:', error);
        document.getElementById('email-security-view').innerHTML = 
            `<div class="container-fluid"><div class="monitor-card" style="text-align: center; padding: 40px;">
                <p style="color: #ff6b6b; margin: 0;"><i class="fas fa-exclamation-circle"></i> Error loading email security data</p>
                <p style="color: #94a3b8; font-size: 12px; margin-top: 8px;">${error.message}</p>
            </div></div>`;
    }
}

/**
 * Update the Email Security project card with live metrics
 */
function updateEmailSecurityProjectCard(project, data) {
    console.log('[Email Security] Updating project card...');
    
    if (!project) return;
    
    const summary = data.summary || {};
    
    project.status = 'Active';
    project.cardMetrics = [
        { 
            label: "Active Threats", 
            value: `: ${summary.activeThreats || 0}`, 
            icon: "fas fa-exclamation-triangle" 
        },
        { 
            label: "High Severity", 
            value: `: ${summary.highSeverityAlerts || 0}`, 
            icon: "fas fa-circle-exclamation" 
        }
    ];
    
    project.cardFooter = `Users Affected: ${summary.affectedUsersCount || 0} | Resolution: ${summary.threatResolutionRate || 0}%`;
    project.lastUpdate = data.fetchedAt ? new Date(data.fetchedAt).toLocaleTimeString() : 'Just now';
    project.securityScore = summary.securityScore || 0;
    
    // Update the currently displayed project card
    displayCurrentProject();
}

/**
 * Initialize the entire email security dashboard
 */
function initializeEmailSecurityDashboard(data) {
    console.log('[Email Security] Initializing dashboard...');
    
    updateEmailSecuritySummary(data.summary);
    updateEmailRisksPanel(data);
    initializeEmailSecurityCharts(data);
    populateEmailSecurityFeed(data.alerts);
    populateEmailAlertsTable(data.alerts);
    populateAffectedUsers(data.affectedUsers);
    populateEmailInsights(data.insights);
    setupEmailSecurityBackButton();
    
    console.log('[Email Security] Dashboard initialized successfully');
}

/**
 * Update summary cards with live data
 */
function updateEmailSecuritySummary(summary) {
    console.log('[Email Security] Updating summary cards...');

    const updates = [
        { id: 'email-active-threats', value: summary.activeThreats || 0, severity: summary.activeThreats > 0 ? 'critical' : 'info' },
        { id: 'email-high-severity', value: summary.highSeverityAlerts || 0, severity: summary.highSeverityAlerts > 0 ? 'critical' : 'info' },
        { id: 'email-active-incidents', value: summary.activeIncidents || 0, severity: summary.activeIncidents > 0 ? 'warning' : 'info' },
        { id: 'email-resolution-rate', value: `${summary.threatResolutionRate || 0}%`, severity: summary.threatResolutionRate >= 75 ? 'success' : 'warning' }
    ];

    updates.forEach(item => {
        const element = document.getElementById(item.id);
        if (element) {
            element.textContent = item.value;
            const card = element.closest('.email-stat-card');
            if (card) {
                card.className = `email-stat-card ${item.severity}`;
            }
        }
    });

    // Update security score
    const scoreElement = document.getElementById('email-security-score');
    if (scoreElement) {
        const score = summary.securityScore || 0;
        scoreElement.textContent = score;
        const scoreColor = score >= 75 ? '#10b981' : score >= 50 ? '#ffc107' : '#ff6b6b';
        scoreElement.style.color = scoreColor;
    }
}

/**
 * Build and display email security risks panel
 */
function updateEmailRisksPanel(data) {
    console.log('[Email Security] Building email risks panel...');
    const risksContainer = document.getElementById('email-risks-container');
    
    if (!risksContainer) {
        console.warn('[Email Security] Risks container not found');
        return;
    }

    const risks = [];

    // Active incidents
    if (data.incidents && data.incidents.length > 0) {
        const activeIncidents = data.incidents.filter(i => i.status === 'active' || i.status === 'inprogress');
        if (activeIncidents.length > 0) {
            risks.push({
                title: '🔴 Active Incidents',
                value: activeIncidents.length,
                severity: 'critical',
                description: `${activeIncidents.length} unresolved email incident${activeIncidents.length > 1 ? 's' : ''} requiring immediate attention`,
                action: 'Review Incidents',
                filter: 'incidents'
            });
        }
    }

    // High severity alerts
    if (data.alerts && data.alerts.length > 0) {
        const highAlerts = data.alerts.filter(a => a.severity === 'high' || a.severity === 'critical');
        if (highAlerts.length > 0) {
            const alertDetails = highAlerts.slice(0, 3).map(alert => 
                `<div class="alert-detail-item">
                    <span class="alert-severity ${alert.severity}">${alert.severity.toUpperCase()}</span>
                    <p class="alert-title">${alert.title || 'Alert'}</p>
                </div>`
            ).join('');
            
            risks.push({
                title: '⚠️ High Severity Alerts',
                value: highAlerts.length,
                severity: 'critical',
                description: `${highAlerts.length} critical email threat${highAlerts.length > 1 ? 's' : ''} detected`,
                detailsHTML: alertDetails,
                action: 'View Alerts',
                filter: 'alerts'
            });
        }
    }

    // Affected users
    if (data.affectedUsers && data.affectedUsers.all && data.affectedUsers.all.length > 0) {
        risks.push({
            title: '👥 Users Affected',
            value: data.affectedUsers.all.length,
            severity: data.affectedUsers.all.length > 5 ? 'critical' : 'warning',
            description: `${data.affectedUsers.all.length} user${data.affectedUsers.all.length > 1 ? 's' : ''} targeted by email threats`,
            action: 'View Users',
            filter: 'users'
        });
    }

    // Spam and malware threats
    if (data.threats && data.threats.byType) {
        const spamCount = data.threats.byType['Spam'] || 0;
        const malwareCount = data.threats.byType['Malware'] || 0;
        
        if (spamCount + malwareCount > 0) {
            risks.push({
                title: '🚨 Malware & Spam',
                value: spamCount + malwareCount,
                severity: malwareCount > 0 ? 'critical' : 'warning',
                description: `${malwareCount} malware threat${malwareCount > 1 ? 's' : ''} and ${spamCount} spam email${spamCount > 1 ? 's' : ''} detected`,
                action: 'Quarantine',
                filter: 'malware'
            });
        }
    }

    // Render risks
    if (risks.length === 0) {
        risksContainer.innerHTML = '<p style="color: #10b981; padding: 20px; text-align: center;">✓ No critical risks detected</p>';
    } else {
        risksContainer.innerHTML = risks.map(risk => `
            <div class="risk-item ${risk.severity}">
                <div class="risk-header">
                    <h4>${risk.title}</h4>
                    <span class="risk-count">${risk.value}</span>
                </div>
                <p class="risk-description">${risk.description}</p>
                ${risk.detailsHTML ? `<div class="risk-details">${risk.detailsHTML}</div>` : ''}
                <button class="risk-action-btn" onclick="filterEmailAlerts('${risk.filter}')">${risk.action} →</button>
            </div>
        `).join('');
    }

    console.log(`[Email Security] Risks panel created with ${risks.length} items`);
}

/**
 * Initialize charts with email security data
 */
function initializeEmailSecurityCharts(data) {
    console.log('[Email Security] Initializing charts...');

    // Threat Types Chart
    const threatTypeCtx = document.getElementById('emailThreatTypeChart');
    if (threatTypeCtx && data.threats && data.threats.byType) {
        const threatTypes = data.threats.byType;
        
        if (emailChartInstances.threatType) {
            emailChartInstances.threatType.destroy();
        }

        emailChartInstances.threatType = new Chart(threatTypeCtx, {
            type: 'doughnut',
            data: {
                labels: Object.keys(threatTypes),
                datasets: [{
                    data: Object.values(threatTypes),
                    backgroundColor: [
                        '#ff6b6b', // Phishing - Red
                        '#ff9f40', // Malware - Orange
                        '#ffc107', // Spam - Yellow
                        '#9c27b0'  // Ransomware - Purple
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

    // Severity Distribution Chart
    const severityCtx = document.getElementById('emailSeverityChart');
    if (severityCtx && data.threats && data.threats.bySeverity) {
        const severity = data.threats.bySeverity;
        
        if (emailChartInstances.severity) {
            emailChartInstances.severity.destroy();
        }

        emailChartInstances.severity = new Chart(severityCtx, {
            type: 'doughnut',
            data: {
                labels: ['High', 'Medium', 'Low'],
                datasets: [{
                    data: [severity.high || 0, severity.medium || 0, severity.low || 0],
                    backgroundColor: [
                        '#ff6b6b', // High - Red
                        '#ffc107', // Medium - Yellow
                        '#10b981'  // Low - Green
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

    // Timeline Chart (alerts over the last 7 days)
    const timelineCtx = document.getElementById('emailTimelineChart');
    if (timelineCtx && data.alerts) {
        // Group alerts by date
        const alertsByDate = {};
        const now = new Date();
        
        // Initialize last 7 days
        for (let i = 6; i >= 0; i--) {
            const date = new Date(now);
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            alertsByDate[dateStr] = 0;
        }

        // Count alerts by date
        data.alerts.forEach(alert => {
            const dateStr = alert.created.split('T')[0];
            if (alertsByDate[dateStr] !== undefined) {
                alertsByDate[dateStr]++;
            }
        });

        if (emailChartInstances.timeline) {
            emailChartInstances.timeline.destroy();
        }

        emailChartInstances.timeline = new Chart(timelineCtx, {
            type: 'line',
            data: {
                labels: Object.keys(alertsByDate),
                datasets: [{
                    label: 'Email Threats Detected',
                    data: Object.values(alertsByDate),
                    borderColor: '#ff6b6b',
                    backgroundColor: 'rgba(255, 107, 107, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#ff6b6b',
                    pointBorderColor: '#1e293b',
                    pointBorderWidth: 2,
                    pointRadius: 5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
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
                        ticks: { color: '#94a3b8', font: { size: 12 } },
                        grid: { color: 'rgba(255, 255, 255, 0.05)' }
                    },
                    y: {
                        ticks: { color: '#94a3b8', font: { size: 12 } },
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        beginAtZero: true
                    }
                }
            }
        });
    }

    console.log('[Email Security] Charts initialized');
}

/**
 * Populate email security feed with latest threats
 */
function populateEmailSecurityFeed(alerts) {
    console.log('[Email Security] Populating feed...');
    const feedContainer = document.getElementById('email-feed');
    
    if (!feedContainer) return;

    if (!alerts || alerts.length === 0) {
        feedContainer.innerHTML = '<p style="color: #94a3b8; text-align: center; padding: 20px;">No threats detected</p>';
        return;
    }

    const sortedAlerts = [...alerts]
        .sort((a, b) => new Date(b.created) - new Date(a.created))
        .slice(0, 10);

    const feedHTML = sortedAlerts.map(alert => {
        const timeDiff = getTimeAgo(new Date(alert.created));
        const severityColor = alert.severity === 'high' || alert.severity === 'critical' ? '#ff6b6b' : 
                             alert.severity === 'medium' ? '#ffc107' : '#10b981';
        
        return `
            <div class="feed-item ${alert.severity}">
                <div class="feed-item-header">
                    <div class="feed-item-info">
                        <span class="feed-severity" style="background-color: ${severityColor}; color: white;">${alert.severity.toUpperCase()}</span>
                        <h4>${alert.title}</h4>
                    </div>
                    <span class="feed-timestamp">${timeDiff}</span>
                </div>
                <p class="feed-description">${alert.description || alert.category}</p>
                ${alert.userStates && alert.userStates.length > 0 ? 
                    `<p class="feed-users">👤 ${alert.userStates.map(u => u.accountName).join(', ')}</p>` : ''}
            </div>
        `;
    }).join('');

    feedContainer.innerHTML = feedHTML;
    console.log(`[Email Security] Feed populated with ${sortedAlerts.length} items`);
}

/**
 * Populate email alerts table
 */
function populateEmailAlertsTable(alerts, filterByUser = null) {
    console.log('[Email Security] Populating alerts table...');
    const tbody = document.getElementById('email-alerts-tbody');
    const tableContainer = document.querySelector('.email-table-container');
    
    if (!tbody) return;

    // Update filter state
    currentEmailAlertFilter = filterByUser;

    // Filter alerts if user filter is active
    let displayAlerts = alerts;
    if (filterByUser) {
        displayAlerts = alerts.filter(alert => {
            const alertUsers = alert.userStates && alert.userStates.length > 0
                ? alert.userStates.map(u => u.accountName)
                : ['Unknown'];
            return alertUsers.includes(filterByUser);
        });
    }

    // Update table header to show filter status
    if (tableContainer) {
        let headerHTML = '<h3><i class="fas fa-table"></i> Email Security Alerts';
        if (filterByUser) {
            headerHTML += ` - Filtered by: <strong>${filterByUser}</strong>
                <button class="clear-filter-btn" onclick="clearEmailAlertsFilter()">✕ Clear Filter</button>`;
        }
        headerHTML += '</h3>';
        
        const headerElement = tableContainer.querySelector('h3');
        if (headerElement) {
            headerElement.outerHTML = headerHTML;
        }
    }

    if (!displayAlerts || displayAlerts.length === 0) {
        const message = filterByUser 
            ? `No alerts found for user: ${filterByUser}`
            : 'No email alerts found';
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 20px; color: #94a3b8;">${message}</td></tr>`;
        return;
    }

    const tableHTML = displayAlerts.map(alert => {
        const user = alert.userStates && alert.userStates.length > 0 
            ? alert.userStates[0].accountName 
            : 'Unknown';
        const createdDate = new Date(alert.created).toLocaleDateString();
        const isFiltered = currentEmailAlertFilter && user === currentEmailAlertFilter;
        
        return `
            <tr class="alert-row ${alert.severity}${isFiltered ? ' filtered-highlight' : ''}">
                <td>
                    <div class="threat-title">
                        <i class="fas fa-exclamation-triangle"></i>
                        ${alert.title}
                    </div>
                </td>
                <td>
                    <span class="severity-badge ${alert.severity}">
                        ${alert.severity.toUpperCase()}
                    </span>
                </td>
                <td>
                    <span class="status-badge ${alert.status}">
                        ${alert.status.charAt(0).toUpperCase() + alert.status.slice(1)}
                    </span>
                </td>
                <td>${user}</td>
                <td>${createdDate}</td>
                <td>${alert.category}</td>
            </tr>
        `;
    }).join('');

    tbody.innerHTML = tableHTML;
    console.log(`[Email Security] Table populated with ${displayAlerts.length} alerts${filterByUser ? ` for user: ${filterByUser}` : ''}`);
}

/**
 * Populate affected users list
 */
function populateAffectedUsers(affectedUsers) {
    console.log('[Email Security] Populating affected users...');
    const container = document.getElementById('email-affected-users');
    
    if (!container) return;

    if (!affectedUsers || !affectedUsers.mostTargeted || affectedUsers.mostTargeted.length === 0) {
        container.innerHTML = '<p style="color: #94a3b8; text-align: center; padding: 20px;">No affected users</p>';
        return;
    }

    const usersHTML = affectedUsers.mostTargeted.map((user, index) => `
        <div class="user-item ${index === 0 ? 'critical' : index === 1 ? 'warning' : 'info'}">
            <div class="user-rank">
                <span class="rank-number">#${index + 1}</span>
            </div>
            <div class="user-info">
                <h4>${user.user}</h4>
                <p>${user.threatCount} threat${user.threatCount > 1 ? 's' : ''} detected</p>
            </div>
            <button class="user-action-btn" onclick="viewUserAlerts('${user.user}')">
                View Alerts →
            </button>
        </div>
    `).join('');

    container.innerHTML = usersHTML;
    console.log(`[Email Security] Affected users populated: ${affectedUsers.mostTargeted.length}`);
}

/**
 * Populate actionable insights
 */
function populateEmailInsights(insights) {
    console.log('[Email Security] Populating insights...');
    const container = document.getElementById('email-insights-container');
    
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
                <p class="insight-count">Count: <strong>${insight.count}</strong></p>
                <button class="insight-action-btn" onclick="handleInsightAction('${insight.action}')">
                    ${insight.action} →
                </button>
            </div>
        `;
    }).join('');

    container.innerHTML = insightsHTML;
    console.log(`[Email Security] Insights populated: ${insights.length}`);
}

/**
 * Setup back button for email security dashboard
 */
function setupEmailSecurityBackButton() {
    const backBtn = document.getElementById('btn-back-email') ||
        document.getElementById('btn-back-email-security') ||
        document.querySelector('#email-security-view [id="btn-back"]');
    if (backBtn) {
        backBtn.onclick = function() {
            resetEmailSecurityDashboard();
        };
    }
}

/**
 * Reset and return to projects view
 */
function resetEmailSecurityDashboard() {
    console.log('[Email Security] Resetting dashboard...');
    
    // Hide email security view
    document.getElementById('email-security-view').style.display = 'none';
    
    // Show projects view
    document.getElementById('projects-view').style.display = 'block';
    
    // Restore site header
    const siteHeader = document.querySelector('.site-header');
    if (siteHeader) {
        siteHeader.classList.remove('header-hidden');
        siteHeader.classList.add('header-visible');
    }
    
    // Remove scroll listener if exists
    if (window.removeEmailSecurityScroll) {
        window.removeEmailSecurityScroll();
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
 * Helper: Filter alerts
 */
function filterEmailAlerts(filterType) {
    console.log(`[Email Security] Filtering alerts by: ${filterType}`);
    // Scroll to alerts table
    const alertsTable = document.querySelector('.email-table-container');
    if (alertsTable) {
        alertsTable.scrollIntoView({ behavior: 'smooth' });
    }
}



/**
 * Helper: View user alerts (filters table to show only their alerts)
 */
function viewUserAlerts(userName) {
    console.log(`[Email Security] Viewing alerts for user: ${userName}`);
    
    // Re-populate table with filter applied
    if (emailSecurityData && emailSecurityData.alerts) {
        populateEmailAlertsTable(emailSecurityData.alerts, userName);
    }
    
    // Scroll to filtered table
    const alertsTable = document.querySelector('.email-table-container');
    if (alertsTable) {
        setTimeout(() => {
            alertsTable.scrollIntoView({ behavior: 'smooth' });
        }, 100);
    }
}

/**
 * Helper: Clear email alerts filter and show all alerts
 */
function clearEmailAlertsFilter() {
    console.log('[Email Security] Clearing alerts filter');
    
    if (emailSecurityData && emailSecurityData.alerts) {
        populateEmailAlertsTable(emailSecurityData.alerts, null);
    }
}

/**
 * Helper: Handle insight actions
 */
function handleInsightAction(action) {
    console.log(`[Email Security] Handling action: ${action}`);
    // Clear any existing filters and show all alerts
    if (emailSecurityData && emailSecurityData.alerts) {
        populateEmailAlertsTable(emailSecurityData.alerts, null);
    }
    const alertsTable = document.querySelector('.email-table-container');
    if (alertsTable) {
        alertsTable.scrollIntoView({ behavior: 'smooth' });
    }
}

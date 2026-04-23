// ================================================
// Threat & Activity DASHBOARD - FRONTEND LOGIC
// Real-time SOC threat intelligence interface
// ================================================

let securityData = null;
let currentSecurityFilters = {};
let chartInstances = {
    severity: null,
    status: null,
    threat: null,
    timeline: null
};

/**
 * Main entry point: Fetch security events data from API
 */
async function fetchSecurityEventsData(project, loadToken = window.dashboardLoadToken) {
    try {
        console.log('[Security] Fetching security events data...');
        showSecurityDashboardLoadingState();
        const authToken = localStorage.getItem('authToken');
        
        const response = await fetch('/api/security-events', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch security data: ${response.statusText}`);
        }

        securityData = await response.json();
        if (window.activeDashboardKey !== 'security' || loadToken !== window.dashboardLoadToken) return;
        console.log('[Security] Data received:', securityData);

        if (securityData.success) {
            initializeSecurityDashboard(securityData);
            updateProjectCardMetrics(project, securityData);
        }
    } catch (error) {
        if (window.activeDashboardKey !== 'security' || loadToken !== window.dashboardLoadToken) return;
        console.error('[Security] Error fetching data:', error);
        document.getElementById('security-events-view').innerHTML = 
            `<div class="container-fluid"><div class="monitor-card" style="text-align: center; padding: 40px;">
                <p style="color: #ff6b6b; margin: 0;"><i class="fas fa-exclamation-circle"></i> Error loading security data</p>
                <p style="color: #94a3b8; font-size: 12px; margin-top: 8px;">${error.message}</p>
            </div></div>`;
    }
}

function showSecurityDashboardLoadingState() {
    const riskContainer = document.getElementById('security-risks-container');
    const feed = document.getElementById('activity-feed');
    const incidents = document.getElementById('incidents-tbody');
    if (riskContainer) {
        riskContainer.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 24px; color: #5f6368;"><i class="fas fa-spinner fa-spin loading-spinner"></i> Loading threats...</div>';
    }
    if (feed) {
        feed.innerHTML = '<div style="text-align: center; padding: 24px; color: #5f6368;"><i class="fas fa-spinner fa-spin loading-spinner"></i> Loading activity...</div>';
    }
    if (incidents) {
        incidents.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 20px; color: #5f6368;"><i class="fas fa-spinner fa-spin loading-spinner"></i> Loading incidents...</td></tr>';
    }
}

function clearSecurityDashboardState() {
    securityData = null;
    currentSecurityFilters = {};
    showSecurityDashboardLoadingState();
}

/**
 * Initialize the entire security dashboard
 */
function initializeSecurityDashboard(data) {
    console.log('[Security] Initializing dashboard...');
    
    updateSecuritySummary(data.summary);
    updateRisksPanel(data);
    initializeSecurityCharts(data);
    populateActivityFeed(data.activityFeed);
    populateIncidentTable(data.incidents);
    setupSecurityBackButton();
    setupAutoRefresh();
    
    console.log('[Security] Dashboard initialized successfully');
}

/**
 * Update summary cards with live data
 */
function updateSecuritySummary(summary) {
    console.log('[Security] Updating summary cards...');

    const updates = [
        { id: 'sec-active-incidents', value: summary.activeIncidents || 0, severity: summary.activeIncidents > 0 ? 'critical' : 'info' },
        { id: 'sec-high-alerts', value: summary.highSeverityAlerts || 0, severity: summary.highSeverityAlerts > 0 ? 'critical' : 'info' },
        { id: 'sec-total-alerts', value: summary.totalAlerts || 0, severity: summary.totalAlerts > 5 ? 'warning' : 'info' },
        { id: 'sec-threat-indicators', value: summary.threatIndicators || 0, severity: summary.threatIndicators > 0 ? 'critical' : 'info' },
        { id: 'sec-users-under-attack', value: summary.usersUnderAttack || 0, severity: summary.usersUnderAttack > 0 ? 'critical' : 'info' }
    ];

    updates.forEach(item => {
        const element = document.getElementById(item.id);
        if (element) {
            element.textContent = item.value;
            const card = element.closest('.security-stat-card');
            if (card) {
                card.className = `security-stat-card ${item.severity}`;
            }
        }
    });

    // Update security score
    const scoreElement = document.getElementById('sec-security-score');
    if (scoreElement) {
        const score = summary.securityScore || 0;
        scoreElement.textContent = score;
        const scoreColor = score >= 75 ? '#10b981' : score >= 50 ? '#ffc107' : '#ff6b6b';
        scoreElement.style.color = scoreColor;
    }
}

/**
 * Build and display risk insights panel
 */
function updateRisksPanel(data) {
    console.log('[Security] Building risks panel...');
    const risksContainer = document.getElementById('security-risks-container');
    
    if (!risksContainer) {
        console.warn('[Security] Risks container not found');
        return;
    }

    const risks = [];

    // Active incidents
    if (data.incidents && data.incidents.length > 0) {
        const activeIncidents = data.incidents.filter(i => i.status === 'active' || i.status === 'inProgress');
        if (activeIncidents.length > 0) {
            risks.push({
                title: '🔴 Active Incidents',
                value: activeIncidents.length,
                severity: 'critical',
                description: 'Unresolved security incidents require immediate attention',
                action: 'Review Incidents',
                filter: 'incidents'
            });
        }
    }

    // High severity alerts
    if (data.alerts && data.alerts.length > 0) {
        const highAlerts = data.alerts.filter(a => a.severity === 'high' || a.severity === 'critical');
        if (highAlerts.length > 0) {
            // Create detailed alert list
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
                description: 'Critical security alerts detected in your environment',
                detailsHTML: alertDetails,
                action: highAlerts.length > 3 ? `View All ${highAlerts.length} Alerts` : 'Dismiss',
                filter: 'alerts',
                isExpandableAlert: true
            });
        }
    }

    // Users under attack
    if (data.signIns && data.signIns.usersUnderAttack && data.signIns.usersUnderAttack.length > 0) {
        const topUser = data.signIns.usersUnderAttack[0];
        risks.push({
            title: '👤 Users Under Attack',
            value: `${topUser.user}`,
            severity: 'critical',
            description: `${topUser.failedAttempts} failed login attempts detected`,
            action: 'Isolate User',
            filter: 'users-under-attack'
        });
    }

    // Threat indicators
    if (data.threats && data.threats.length > 0) {
        risks.push({
            title: '🚨 Threat Indicators',
            value: data.threats.length,
            severity: 'warning',
            description: 'Malicious IPs/domains detected in environment',
            action: 'Block Threats',
            filter: 'threats'
        });
    }

    // Suspicious sign-ins
    if (data.signIns && data.signIns.suspicious && data.signIns.suspicious.length > 0) {
        risks.push({
            title: '🔐 Suspicious Sign-ins',
            value: data.signIns.suspicious.length,
            severity: 'warning',
            description: 'High-risk login activities from unexpected locations',
            action: 'Enforce MFA',
            filter: 'suspicious-signins'
        });
    }

    // Render risks
    const risksHTML = risks.map(risk => `
        <div class="risk-card ${risk.severity}" onclick="filterByRisk('${risk.filter}')">
            <p class="risk-card-title">${risk.title}</p>
            <p class="risk-card-value">${risk.value}</p>
            <p class="risk-card-desc">${risk.description}</p>
            ${risk.detailsHTML ? `
                <div class="alert-details-container">
                    ${risk.detailsHTML}
                </div>
            ` : ''}
            <button class="risk-card-action">${risk.action}</button>
        </div>
    `).join('');

    risksContainer.innerHTML = risksHTML || '<p style="color: #10b981; padding: 20px; text-align: center;">✅ No active threats detected</p>';
}

/**
 * Initialize Chart.js visualizations
 */
function initializeSecurityCharts(data) {
    console.log('[Security] Initializing charts...');

    // Destroy existing chart instances before creating new ones
    Object.keys(chartInstances).forEach(key => {
        if (chartInstances[key]) {
            chartInstances[key].destroy();
            chartInstances[key] = null;
        }
    });

    // 1. Severity Distribution (Pie)
    const severityCtx = document.getElementById('severityChart');
    if (severityCtx && data.alerts && data.alerts.length > 0) {
        const severityCount = {
            critical: data.alerts.filter(a => a.severity === 'critical').length,
            high: data.alerts.filter(a => a.severity === 'high').length,
            medium: data.alerts.filter(a => a.severity === 'medium').length,
            low: data.alerts.filter(a => a.severity === 'low').length
        };

        chartInstances.severity = new Chart(severityCtx, {
            type: 'doughnut',
            data: {
                labels: ['Critical', 'High', 'Medium', 'Low'],
                datasets: [{
                    data: [severityCount.critical, severityCount.high, severityCount.medium, severityCount.low],
                    backgroundColor: ['#ff6b6b', '#ffc107', '#f59e0b', '#10b981'],
                    borderColor: '#0f172a',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: '#cbd5e1', font: { size: 11, weight: 200 } }
                    }
                }
            }
        });
    }

    // 2. Incidents by Status (Bar)
    const statusCtx = document.getElementById('statusChart');
    const statusContainer = statusCtx?.parentElement;
    
    if (statusCtx && data.incidents && data.incidents.length > 0) {
        const statuses = {
            active: data.incidents.filter(i => i.status === 'active').length,
            inProgress: data.incidents.filter(i => i.status === 'inProgress').length,
            resolved: data.incidents.filter(i => i.status === 'resolved').length
        };

        chartInstances.status = new Chart(statusCtx, {
            type: 'bar',
            data: {
                labels: ['Active', 'In Progress', 'Resolved'],
                datasets: [{
                    label: 'Incidents',
                    data: [statuses.active, statuses.inProgress, statuses.resolved],
                    backgroundColor: ['#ff6b6b', '#ffc107', '#10b981'],
                    borderColor: '#0f172a',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                indexAxis: 'y',
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } }
                }
            }
        });
    } else if (statusContainer) {
        // Show empty state
        statusContainer.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 250px; color: #94a3b8; font-size: 13px; text-align: center; padding: 20px;"><span>📊 No incidents detected yet</span></div>';
    }

    // 3. Alert Timeline (Line)
    const timelineCtx = document.getElementById('timelineChart');
    if (timelineCtx && data.alerts && data.alerts.length > 0) {
        // Group alerts by hour in last 24 hours
        const now = new Date();
        const last24h = new Date(now - 24 * 60 * 60 * 1000);
        const hourBuckets = {};
        
        for (let i = 0; i < 24; i++) {
            const hour = new Date(last24h.getTime() + i * 60 * 60 * 1000);
            hourBuckets[hour.getHours()] = 0;
        }

        data.alerts.forEach(alert => {
            const alertTime = new Date(alert.created);
            if (alertTime >= last24h) {
                const hour = alertTime.getHours();
                hourBuckets[hour]++;
            }
        });

        chartInstances.timeline = new Chart(timelineCtx, {
            type: 'line',
            data: {
                labels: Object.keys(hourBuckets).map(h => `${h}:00`),
                datasets: [{
                    label: 'Alerts per Hour',
                    data: Object.values(hourBuckets),
                    borderColor: '#0066FF',
                    backgroundColor: 'rgba(0, 102, 255, 0.1)',
                    tensions: 0.4,
                    fill: true,
                    pointBackgroundColor: '#0066FF',
                    pointBorderColor: '#0f172a',
                    pointRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                    x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } }
                }
            }
        });
    }

    // 4. Threat Indicators by Type (Pie)
    const threatCtx = document.getElementById('threatChart');
    const threatContainer = threatCtx?.parentElement;
    
    if (threatCtx && data.threats && data.threats.length > 0) {
        const threatTypes = {};
        data.threats.forEach(threat => {
            threatTypes[threat.type] = (threatTypes[threat.type] || 0) + 1;
        });

        chartInstances.threat = new Chart(threatCtx, {
            type: 'doughnut',
            data: {
                labels: Object.keys(threatTypes),
                datasets: [{
                    data: Object.values(threatTypes),
                    backgroundColor: ['#ff6b6b', '#ffc107', '#f59e0b', '#0066FF'],
                    borderColor: '#0f172a',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: '#cbd5e1', font: { size: 11, weight: 200 } }
                    }
                }
            }
        });
    } else if (threatContainer) {
        // Show empty state
        threatContainer.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 250px; color: #94a3b8; font-size: 13px; text-align: center; padding: 20px;"><span>🛡️ No threat indicators detected</span></div>';
    }
}

/**
 * Populate the activity feed
 */
function populateActivityFeed(activityFeed) {
    const feedContainer = document.getElementById('activity-feed');
    
    if (!feedContainer) return;

    if (!activityFeed || activityFeed.length === 0) {
        feedContainer.innerHTML = '<p style="color: #94a3b8; text-align: center; padding: 20px;">No activity detected</p>';
        return;
    }

    const itemsHTML = activityFeed.map(item => `
        <div class="activity-item ${item.severity}">
            <p class="activity-item-message">${item.message}</p>
            <p class="activity-item-time">${formatRelativeTime(item.timestamp)}</p>
        </div>
    `).join('');

    feedContainer.innerHTML = itemsHTML;
}

/**
 * Populate incidents table
 */
function populateIncidentTable(incidents) {
    const tbody = document.getElementById('incidents-tbody');
    
    if (!tbody) return;

    if (!incidents || incidents.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 20px; color: #94a3b8;">No incidents found</td></tr>';
        return;
    }

    const rows = incidents.slice(0, 20).map(incident => `
        <tr>
            <td>${incident.displayName}</td>
            <td><span class="severity-badge ${incident.severity}">${incident.severity}</span></td>
            <td><span class="status-badge ${incident.status}">${incident.status}</span></td>
            <td>${incident.assignedTo || 'Unassigned'}</td>
            <td>${formatRelativeTime(incident.created)}</td>
            <td>${formatRelativeTime(incident.updated)}</td>
            <td><a href="${incident.redirectUrl}" target="_blank" style="color: #0066FF; text-decoration: none;">View</a></td>
        </tr>
    `).join('');

    tbody.innerHTML = rows;
}

/**
 * Setup back button functionality
 */
function setupSecurityBackButton() {
    const backBtn = document.getElementById('btn-back-security');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            // Destroy all chart instances to prevent reuse errors
            Object.keys(chartInstances).forEach(key => {
                if (chartInstances[key]) {
                    chartInstances[key].destroy();
                    chartInstances[key] = null;
                }
            });
            
            document.getElementById('security-events-view').style.display = 'none';
            document.getElementById('projects-view').style.display = 'block';
            currentProject = null;
            securityData = null;
        });
    }
}

/**
 * Setup auto-refresh (every 5 minutes)
 */
function setupAutoRefresh() {
    setInterval(() => {
        if (currentProject && currentProject.isSecurityCard) {
            console.log('[Security] Auto-refreshing...');
            fetchSecurityEventsData(currentProject);
        }
    }, 300000); // 5 minutes
}

/**
 * Filter dashboard by risk type
 */
function filterByRisk(filterType) {
    console.log('[Security] Filtering by:', filterType);
    currentSecurityFilters.type = filterType;
    // Implementation can extend to filter tables, charts, etc.
}

/**
 * Update project card metrics
 */
function updateProjectCardMetrics(project, data) {
    project.cardMetrics = [
        { 
            label: "Active Incidents", 
            value: `: ${data.summary.activeIncidents}`, 
            icon: "fas fa-exclamation-triangle" 
        },
        { 
            label: "High Alerts", 
            value: `: ${data.summary.highSeverityAlerts}`, 
            icon: "fas fa-bell" 
        }
    ];
    
    project.cardFooter = `Security Score: ${data.summary.securityScore}/100`;
    project.lastUpdate = new Date().toLocaleTimeString();
}

/**
 * Utility: Format relative time
 */
function formatRelativeTime(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    
    return date.toLocaleDateString();
}

window.clearSecurityDashboardState = clearSecurityDashboardState;
window.showSecurityDashboardLoadingState = showSecurityDashboardLoadingState;

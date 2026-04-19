/* Client Portal JavaScript */

let currentProject = null;
let charts = {};
let currentProjectIndex = 0;
let selectedProjectId = null;
let previewLockedByClick = false;

// Sunbird client emails - only these users can see  Identity Protection, Devices, Applications
const SUNBIRD_EMAILS = [
    'sandanindivhuwo17@gmail.com',
    'ndamulelo@stackopsit.co.za'
];

// Sunbird-only card IDs that should be hidden from non-Sunbird clients
const SUNBIRD_ONLY_CARD_IDS = [2, 3, 4, 5, 7, 8]; // Identity Protection, Devices, Security & Events, Email Security, Backup & Recovery, Applications

// Cards to hide from Sunbird clients
const HIDDEN_FROM_SUNBIRD_IDS = []; // All Sunbird cards are visible to them

// Check if current user is a Sunbird client
function isSunbirdUser() {
    const userEmail = sessionStorage.getItem('userEmail');
    if (!userEmail) return false;
    return SUNBIRD_EMAILS.includes(userEmail.toLowerCase());
}

// Check if session is still valid
function isSessionValid() {
    const isLoggedIn = sessionStorage.getItem('isLoggedIn');
    const userEmail = sessionStorage.getItem('userEmail');
    const token = localStorage.getItem('authToken');
    
    return isLoggedIn === 'true' && userEmail && token;
}

// Get filtered projects based on user access level
function getFilteredProjects() {
    if (!isSessionValid()) {
        // Expired session - return only non-Sunbird cards
        return mockProjects.filter(project => !SUNBIRD_ONLY_CARD_IDS.includes(project.id));
    }
    
    if (isSunbirdUser()) {
        // Sunbird user - show all cards except those hidden from them
        return mockProjects.filter(project => !HIDDEN_FROM_SUNBIRD_IDS.includes(project.id));
    }
    
    // Other clients - hide Sunbird-only cards
    return mockProjects.filter(project => !SUNBIRD_ONLY_CARD_IDS.includes(project.id));
}

const mockProjects = [
    {
        id: 1,
        name: "Cisco Duo Licenses",
        type: "Enterprise  Identity Protection Management",
        status: "Syncing...", // Changed from Active
        risks: { critical: 0, high: 0, medium: 0 },
        securityScore: 100,
        uptime: 100,
        lastUpdate: "Checking database...",
        icon: "fas fa-shield-check",
        image: "Images/cisco-duo.png",
        cardMetrics: [
            { label: "Total Licences", value: ": ...", icon: "fas fa-id-card" },
            { label: "Active Usage", value: ": ...", icon: "fas fa-user-check" },
            { label: "Remaining Licences", value: ": ...", icon: "fas fa-user-plus" }
        ],
        cardFooter: "Verifying...",
        noDashboard: true
    },
    {
        id: 2,
        name: " Identity Protection",
        type: "User Management & Access Control",
        status: "active",
        risks: { critical: 0, high: 0, medium: 0 },
        securityScore: 0,
        uptime: 100,
        lastUpdate: "Loading...",
        icon: "fas fa-shield-alt",
        cardMetrics: [
            { label: "Total Users", value: ": ...", icon: "fas fa-users" },
            { label: "External", value: ": ...", icon: "fas fa-user-secret" }
        ],
        cardFooter: "Fetching from Microsoft Graph...",
        hasTabs: false,
        microsoftGraphEnabled: true,
        isIdentityCard: true
    },
    {
        id: 3,
        name: "Device Protection",
        type: "Device Management & Security Compliance",
        status: "active",
        risks: { critical: 0, high: 0, medium: 0 },
        securityScore: 0,
        uptime: 100,
        lastUpdate: "Loading...",
        icon: "fas fa-laptop",
        cardMetrics: [
            { label: "Total Devices", value: ": ...", icon: "fas fa-desktop" },
            { label: "Compliant", value: ": ...", icon: "fas fa-check-circle" }
        ],
        cardFooter: "Fetching from Microsoft Intune...",
        hasTabs: false,
        microsoftGraphEnabled: true,
        isDevicesCard: true
    },
    {
        id: 5,
        name: "Email Security",
        type: "Email Threat Detection & Management",
        status: "active",
        risks: { critical: 0, high: 0, medium: 0 },
        securityScore: 0,
        uptime: 100,
        lastUpdate: "Loading...",
        icon: "fas fa-envelope-open-text",
        cardMetrics: [
            { label: "Active Threats", value: ": ...", icon: "fas fa-exclamation-triangle" },
            { label: "High Severity", value: ": ...", icon: "fas fa-circle-exclamation" }
        ],
        cardFooter: "Fetching from Microsoft Graph Security...",
        hasTabs: false,
        microsoftGraphEnabled: true,
        isEmailSecurityCard: true
    },
    {
        id: 4,
        name: "Security & Events",
        type: "Real-Time SOC Threat Intelligence & Response",
        status: "active",
        risks: { critical: 0, high: 0, medium: 0 },
        securityScore: 0,
        uptime: 100,
        lastUpdate: "Loading...",
        icon: "fas fa-bell-slash",
        cardMetrics: [
            { label: "Active Incidents", value: ": ...", icon: "fas fa-exclamation-triangle" },
            { label: "High Alerts", value: ": ...", icon: "fas fa-bell" }
        ],
        cardFooter: "Fetching from Microsoft Graph Security...",
        hasTabs: false,
        microsoftGraphEnabled: true,
        isSecurityCard: true
    },
    {
        id: 6,
        name: "Cloud data services",
        type: "Optomized cloud storage & Database health",
        status: "inactive",
        risks: { critical: 1, high: 1, medium: 1 },
        securityScore: 90,
        uptime: 99.7,
        lastUpdate: "30 minutes ago",
        icon: "fas fa-database",
        cardMetrics: [
            { label: "Storage Used", value: ": 2.3TB", icon: "fas fa-cloud" },
            { label: "Data Redundancy", value: ": 3x", icon: "fas fa-copy" }
        ],
        cardFooter: "Cloud Cost: R4,250/month"
    },
    {
        id: 7,
        name: "Backup and Recovery",
        type: "Data Protection & Disaster Recovery",
        status: "active",
        risks: { critical: 0, high: 0, medium: 0 },
        securityScore: 0,
        uptime: 100,
        lastUpdate: "Loading...",
        icon: "fas fa-shield-alt",
        cardMetrics: [
            { label: "Total Storage", value: ": ...", icon: "fas fa-database" },
            { label: "Services Covered", value: ": 3", icon: "fas fa-cloud" }
        ],
        cardFooter: "Fetching from Microsoft Graph...",
        hasTabs: false,
        microsoftGraphEnabled: true,
        isBackupRecoveryCard: true
    },
    {
        id: 8,
        name: "Applications",
        type: "Application Access & Risk Management",
        status: "active",
        risks: { critical: 0, high: 0, medium: 0 },
        securityScore: 0,
        uptime: 100,
        lastUpdate: "Loading...",
        icon: "fas fa-cubes",
        cardMetrics: [
            { label: "Total Applications", value: ": ...", icon: "fas fa-cubes" },
            { label: "External Apps", value: ": ...", icon: "fas fa-exclamation-circle" }
        ],
        cardFooter: "Fetching from Microsoft Graph...",
        hasTabs: false,
        microsoftGraphEnabled: true,
        isApplicationsCard: true
    }
];

/* INITIALIZATION */
let microsoftUsersData = [];
let microsoftRolesData = [];
let userRolesMap = {}; // Maps userId to array of role names
let applicationsData = []; // Applications from Microsoft Graph
let servicePrincipalsData = []; // Service Principals for app mapping
let groupsData = []; // Groups for access mapping

document.addEventListener('DOMContentLoaded', function() {
    setupEventListeners();
    setupSessionManagement();
    initializeProjectsList();
    initializeBillingCard();
    initializeGovernanceCard();
    initializeSupportCard();
    updateCopyrightYear();
});

// Setup project tabs event listeners
function setupProjectsTabs() {
    // Removed - no longer using tabs
}

// Switch project tab
function switchProjectTab(tabId) {
    // Removed - no longer using tabs
}

// ============================================
//  Identity Protection / MICROSOFT GRAPH APIs
// ============================================
// Handles user management, role assignments, and identity data
// from Microsoft Graph, including user lists and access control

// Fetch Microsoft users and populate  Identity Protection cards
async function fetchMicrosoftUsersForCard() {
    try {
        const authToken = localStorage.getItem('authToken');
        if (!authToken) {
            console.error('[Microsoft Users] No auth token found');
            return;
        }

        // Only fetch Microsoft users for Sunbird users
        if (!isSunbirdUser()) {
            console.log('[Microsoft Users] Non-Sunbird user. Skipping fetch.');
            return;
        }
        
        console.log('[Microsoft Users] Fetching users data...');
        
        const response = await fetch('/api/microsoft-users', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            console.error('[Microsoft Users] Error:', data.message);
            showNotification('Failed to load Microsoft Users data', false);
            return;
        }
        
        microsoftUsersData = data.users || [];
        console.log(`[Microsoft Users] Loaded ${microsoftUsersData.length} users`);
        
        // Populate  Identity Protection cards
        populateIdentityCards(data);
        
    } catch (error) {
        console.error('[Microsoft Users] Exception:', error);
        showNotification('Failed to load Microsoft Users data', false);
    }
}

// Populate  Identity Protection cards
function populateIdentityCards(apiData) {
    const container = document.getElementById('identity-cards-container');
    
    if (!container) {
        console.error('[Identity Cards] Container not found');
        return;
    }
    
    container.innerHTML = '';
    
    // Calculate statistics from API data
    const totalUsers = apiData.totalUsers || microsoftUsersData.length;
    const externalUsers = microsoftUsersData.filter(u => u.isExternal).length;
    const internalUsers = totalUsers - externalUsers;
    const missingData = microsoftUsersData.filter(u => !u.jobTitle || !u.mobilePhone).length;
    
    // Create main  Identity Protection card
    const card = document.createElement('div');
    card.className = 'identity-card';
    card.innerHTML = `
        <div class="identity-card-header">
            <i class="fas fa-users"></i>
            <div>
                <div class="identity-card-title"> Identity Protection</div>
                <div class="identity-card-type">User Management & Access Control</div>
            </div>
        </div>
        
        <p class="identity-card-description">
            Monitor and manage user identities, access permissions, and authentication across your organization.
        </p>
        
        <div class="identity-card-status">
            <span class="status-badge">
                <span class="status-badge-dot"></span>
                Active
            </span>
        </div>
        
        <div class="identity-card-stats">
            <div class="identity-stat">
                <span class="identity-stat-value">${totalUsers}</span>
                <span class="identity-stat-label">Total Users</span>
            </div>
            <div class="identity-stat">
                <span class="identity-stat-value">${externalUsers}</span>
                <span class="identity-stat-label">External</span>
            </div>
            <div class="identity-stat">
                <span class="identity-stat-value">${internalUsers}</span>
                <span class="identity-stat-label">Internal</span>
            </div>
            <div class="identity-stat">
                <span class="identity-stat-value">${missingData}</span>
                <span class="identity-stat-label">Missing Data</span>
            </div>
        </div>
        
        <button class="identity-card-button" onclick="openIdentityDashboard()">
            View Full Dashboard & Analytics →
        </button>
    `;
    
    container.appendChild(card);
    
    console.log(`[Identity Cards] Created card with ${totalUsers} users (${externalUsers} external, ${missingData} missing data)`);
}

// ============================================
// APPLICATIONS - FETCH DATA & CARD DISPLAY
// ============================================

// Fetch Applications data from API
async function fetchApplicationsData() {
    try {
        const authToken = localStorage.getItem('authToken');
        if (!authToken) {
            console.error('[Applications] No auth token found');
            return;
        }

        // Only fetch Applications for Sunbird users
        if (!isSunbirdUser()) {
            console.log('[Applications] Non-Sunbird user. Skipping fetch.');
            return;
        }
        
        console.log('[Applications] Fetching applications data...');
        
        const response = await fetch('/api/microsoft-applications', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            console.error('[Applications] Error:', data.message);
            showNotification('Failed to load Applications data', false);
            return;
        }
        
        applicationsData = data.applications || [];
        console.log(`[Applications] Loaded ${applicationsData.length} applications`);
        
        // Populate Applications card preview
        populateApplicationsCard(data);
        
    } catch (error) {
        console.error('[Applications] Exception:', error);
        showNotification('Failed to load Applications data', false);
    }
}

// Populate Applications card in projects view
function populateApplicationsCard(apiData) {
    const container = document.getElementById('applications-cards-container');
    
    // If container doesn't exist, create it dynamically in the grid
    // This is handled by the project card system, so we update the project card metrics
    const appProject = mockProjects.find(p => p.isApplicationsCard);
    if (!appProject) return;
    
    // Update project card metrics
    const totalApps = apiData.totalApplications || 0;
    const externalApps = apiData.externalApplications || 0;
    const highRiskApps = calculateHighRiskApplications(applicationsData);
    
    appProject.cardMetrics = [
        { label: "Total Applications", value: `: ${totalApps}`, icon: "fas fa-cubes" },
        { label: "External Apps", value: `: ${externalApps}`, icon: "fas fa-exclamation-circle" }
    ];
    appProject.cardFooter = `High Risk: ${highRiskApps}`;
    
    // Re-render project cards
    displayCurrentProject();
}

// Calculate risk level for an application
function calculateAppRisk(app) {
    let riskLevel = 'safe'; // safe, medium, high
    let riskReasons = [];
    
    // Check if external
    const isExternal = app.isExternal;
    if (isExternal) {
        riskLevel = 'high';
        riskReasons.push('External app connected');
    }
    
    // Check for high permissions (scopes or roles)
    const totalPermissions = (app.scopeCount || 0) + (app.roleCount || 0);
    if (totalPermissions > 10) {
        if (riskLevel === 'safe') riskLevel = 'medium';
        if (riskLevel !== 'high') riskLevel = 'medium';
        riskReasons.push('Excessive permissions detected');
    }
    
    // Check for high user count
    const userCount = app.userCount || 0;
    if (userCount > 50) {
        if (riskLevel !== 'high') riskLevel = 'high';
        riskReasons.push('App has high user access');
    } else if (userCount > 20 && riskLevel === 'safe') {
        riskLevel = 'medium';
        riskReasons.push('App has high user access');
    }
    
    // If internal and low permissions and low users, it's safe
    if (!isExternal && totalPermissions <= 5 && userCount <= 20) {
        riskLevel = 'safe';
    } else if (!isExternal && totalPermissions > 5 && !riskReasons.includes('Excessive permissions detected')) {
        riskLevel = 'medium';
        if (!riskReasons.includes('Moderate permissions')) {
            riskReasons.push('Moderate permissions');
        }
    }
    
    return {
        level: riskLevel,
        reasons: riskReasons
    };
}

// Calculate number of high-risk applications
function calculateHighRiskApplications(apps) {
    if (!apps) return 0;
    return apps.filter(app => calculateAppRisk(app).level === 'high').length;
}

// Open Applications full dashboard
function openApplicationsDashboard() {
    console.log('[Applications Dashboard] Opening full dashboard...');
    
    const dashboardView = document.getElementById('dashboard-view');
    if (!dashboardView) return;

    // Show dashboard view
    document.getElementById('projects-view').style.display = 'none';
    dashboardView.style.display = 'block';
    
    // Hide generic dashboard parts
    const statsGrid = dashboardView.querySelector('.stats-grid');
    const chartsSection = dashboardView.querySelector('.charts-section');
    const dashboardTabs = dashboardView.querySelector('.dashboard-tabs');
    
    if (statsGrid) statsGrid.style.display = 'none';
    if (chartsSection) chartsSection.style.display = 'none';
    if (dashboardTabs) dashboardTabs.style.display = 'none';

    // Update dashboard title
    const projectName = document.getElementById('project-name');
    const projectStatus = document.getElementById('project-status');
    if (projectName) projectName.textContent = 'Applications - Access & Risk Management';
    if (projectStatus) projectStatus.textContent = 'Active';
    
    // Hide site header initially
    const siteHeader = document.querySelector('.site-header');
    if (siteHeader) {
        siteHeader.classList.add('header-hidden');
        siteHeader.classList.remove('header-visible');
    }

    // Add scroll listener for header
    const handleDashboardScroll = () => {
        if (window.scrollY > 100) {
            siteHeader?.classList.add('header-visible');
            siteHeader?.classList.remove('header-hidden');
        } else {
            siteHeader?.classList.add('header-hidden');
            siteHeader?.classList.remove('header-visible');
        }
    };
    
    window.removeApplicationsDashboardScroll = () => {
        window.removeEventListener('scroll', handleDashboardScroll);
        delete window.removeApplicationsDashboardScroll;
    };
    
    window.addEventListener('scroll', handleDashboardScroll);

    // Update back button
    const backBtn = document.getElementById('btn-back');
    if (backBtn) {
        backBtn.onclick = function() {
            resetDashboard();
            
            // Restore generic parts
            if (statsGrid) statsGrid.style.display = 'grid';
            if (chartsSection) chartsSection.style.display = 'grid';
        };
    }
    
    // Initialize dashboard if data is ready
    if (applicationsData.length > 0) {
        console.log('[Applications Dashboard] Data already loaded, initializing immediately');
        initializeApplicationsDashboard();
    } else {
        // Fetch data first
        console.log('[Applications Dashboard] Waiting for data to load...');
        let waitTime = 0;
        const maxWait = 5000;
        const checkInterval = setInterval(() => {
            waitTime += 100;
            if (applicationsData.length > 0) {
                console.log('[Applications Dashboard] Data loaded successfully');
                clearInterval(checkInterval);
                initializeApplicationsDashboard();
            } else if (waitTime >= maxWait) {
                console.warn('[Applications Dashboard] Data load timeout');
                clearInterval(checkInterval);
                initializeApplicationsDashboard();
            }
        }, 100);
    }
}

// Initialize Applications dashboard
function initializeApplicationsDashboard() {
    console.log('[Applications Dashboard] Initializing...');
    console.log(`[Applications Dashboard] Applications data: ${applicationsData.length}`);
    
    const dashboardView = document.getElementById('dashboard-view');
    if (dashboardView) {
        dashboardView.innerHTML = generateApplicationsDashboardHTML();
    }
    
    // Populate dashboard content
    setTimeout(() => {
        console.log('[Applications Dashboard] Populating content...');
        populateApplicationsTable();
        initializeApplicationsCharts();
    }, 100);
}

// Generate Applications dashboard HTML
function generateApplicationsDashboardHTML() {
    return `
        <div class="applications-dashboard">
            <!-- Dashboard Header with Back Button and Title -->
            <div class="dashboard-header">
                <div class="dashboard-header-left">
                    <button class="btn-back-dashboard" id="btn-back-identity" onclick="resetDashboard()">
                        <i class="fas fa-arrow-left"></i> Back
                    </button>
                    <h2 class="dashboard-heading">Applications - Access & Risk Management</h2>
                </div>
            </div>

            <!-- Top Stats Cards -->
            <div class="apps-stats-cards">
                <div class="apps-stat-card">
                    <div class="stat-icon">
                        <i class="fas fa-cubes"></i>
                    </div>
                    <div class="stat-content">
                        <span class="stat-value" id="totalAppsValue">0</span>
                        <span class="stat-label">Total Applications</span>
                    </div>
                </div>
                
                <div class="apps-stat-card external">
                    <div class="stat-icon">
                        <i class="fas fa-exclamation-circle"></i>
                    </div>
                    <div class="stat-content">
                        <span class="stat-value" id="externalAppsValue">0</span>
                        <span class="stat-label">External Applications</span>
                    </div>
                </div>
                
                <div class="apps-stat-card risk">
                    <div class="stat-icon">
                        <i class="fas fa-exclamation-triangle"></i>
                    </div>
                    <div class="stat-content">
                        <span class="stat-value" id="highRiskAppsValue">0</span>
                        <span class="stat-label">High Risk Applications</span>
                    </div>
                </div>
                
                <div class="apps-stat-card users">
                    <div class="stat-icon">
                        <i class="fas fa-users"></i>
                    </div>
                    <div class="stat-content">
                        <span class="stat-value" id="avgUsersValue">0</span>
                        <span class="stat-label">Avg Users per App</span>
                    </div>
                </div>
            </div>

            <!-- Chart Section -->
            <div class="apps-chart-section">
                <div class="apps-chart-container">
                    <h3><i class="fas fa-chart-bar"></i> App Distribution</h3>
                    <canvas id="appDistributionChart"></canvas>
                </div>
                
                <div class="apps-chart-container">
                    <h3><i class="fas fa-chart-pie"></i> Top 5 Apps by Users</h3>
                    <canvas id="topAppsChart"></canvas>
                </div>
            </div>

            <!-- Applications Table -->
            <div class="apps-table-container">
                <h3><i class="fas fa-list"></i> Applications List</h3>
                <table class="apps-table">
                    <thead>
                        <tr>
                            <th>Application</th>
                            <th>Type</th>
                            <th>Users</th>
                            <th>Permissions</th>
                            <th>Risk Level</th>
                        </tr>
                    </thead>
                    <tbody id="apps-table-body">
                    </tbody>
                </table>
            </div>

            <!-- Access & Assignments Section -->
            <div class="apps-access-section">
                <h3><i class="fas fa-key"></i> Access Overview</h3>
                <div id="apps-access-content"></div>
            </div>

            <!-- Risk Insights Section -->
            <div class="apps-insights-section">
                <h3><i class="fas fa-lightbulb"></i> Risk Insights</h3>
                <div id="apps-insights-content"></div>
            </div>
        </div>
    `;
}

// Populate Applications table
function populateApplicationsTable() {
    const tableBody = document.getElementById('apps-table-body');
    if (!tableBody) return;
    
    tableBody.innerHTML = '';
    
    applicationsData.forEach(app => {
        const risk = calculateAppRisk(app);
        const riskBadgeClass = `risk-badge-${risk.level}`;
        const riskIcon = risk.level === 'high' ? '🔴' : risk.level === 'medium' ? '⚠️' : '✅';
        const permissionCount = (app.scopeCount || 0) + (app.roleCount || 0);
        const userCount = app.userCount || 0;
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="app-name">${app.name}</td>
            <td class="app-type">${app.isExternal ? 'External' : 'Internal'}</td>
            <td class="app-users"><strong>${userCount}</strong></td>
            <td class="app-permissions">${permissionCount}</td>
            <td class="app-risk"><span class="${riskBadgeClass}">${riskIcon} ${risk.level.charAt(0).toUpperCase() + risk.level.slice(1)}</span></td>
        `;
        tableBody.appendChild(row);
    });
    
    // Update stats
    const totalApps = applicationsData.length;
    const externalApps = applicationsData.filter(a => a.isExternal).length;
    const highRiskApps = applicationsData.filter(a => calculateAppRisk(a).level === 'high').length;
    const totalUsers = applicationsData.reduce((sum, a) => sum + (a.userCount || 0), 0);
    const avgUsers = totalApps > 0 ? Math.round(totalUsers / totalApps) : 0;
    
    document.getElementById('totalAppsValue').textContent = totalApps;
    document.getElementById('externalAppsValue').textContent = externalApps;
    document.getElementById('highRiskAppsValue').textContent = highRiskApps;
    document.getElementById('avgUsersValue').textContent = avgUsers;
    
    // Update access overview
    updateApplicationsAccessOverview(totalUsers, externalApps);
    
    // Update insights
    updateApplicationsInsights(totalApps, externalApps, highRiskApps);
}

// Update Applications access overview
function updateApplicationsAccessOverview(totalUsers, externalApps) {
    const accessContainer = document.getElementById('apps-access-content');
    if (!accessContainer) return;
    
    const appsWithUsers = applicationsData.filter(a => a.userCount > 0);
    const appsWithoutUsers = applicationsData.filter(a => a.userCount === 0);
    
    let accessHTML = '<div class="access-grid">';
    
    accessHTML += `
        <div class="access-card">
            <h4>User Assignments</h4>
            <p class="access-stat">${totalUsers} <span>total users assigned</span></p>
            <small>${appsWithUsers.length} apps have users assigned</small>
        </div>
        
        <div class="access-card">
            <h4>Apps Without Access</h4>
            <p class="access-stat">${appsWithoutUsers.length} <span>apps have no assigned users</span></p>
            <small>Consider removing or archiving unused apps</small>
        </div>
        
        <div class="access-card">
            <h4>Risk Summary</h4>
            <p class="access-stat">${externalApps} <span>external apps</span></p>
            <small>Require additional security review</small>
        </div>
    `;
    
    // Show top apps by user count
    const topApps = applicationsData
        .filter(a => a.userCount > 0)
        .sort((a, b) => b.userCount - a.userCount)
        .slice(0, 3);
    
    if (topApps.length > 0) {
        accessHTML += `
            <div class="access-card full-width">
                <h4>Top 3 Apps by User Count</h4>
                <div class="top-apps-list">
        `;
        
        topApps.forEach(app => {
            const risk = calculateAppRisk(app);
            const riskColor = risk.level === 'high' ? 'danger' : risk.level === 'medium' ? 'warning' : 'success';
            accessHTML += `
                <div class="top-app-item">
                    <div class="app-info">
                        <span class="app-name">${app.name}</span>
                        <span class="app-type">${app.isExternal ? 'External' : 'Internal'}</span>
                    </div>
                    <div class="user-badge ${riskColor}">${app.userCount} users</div>
                </div>
            `;
        });
        
        accessHTML += `
                </div>
            </div>
        `;
    }
    
    accessHTML += '</div>';
    accessContainer.innerHTML = accessHTML;
}


// Update Applications insights
function updateApplicationsInsights(totalApps, externalApps, highRiskApps) {
    const insightsContainer = document.getElementById('apps-insights-content');
    if (!insightsContainer) return;
    
    let insightsHTML = '<div class="insights-list">';
    
    if (externalApps > 0) {
        insightsHTML += `
            <div class="insight-item warning">
                <i class="fas fa-exclamation-circle"></i>
                <span><strong>${externalApps} external app(s)</strong> connected - review access regularly</span>
            </div>
        `;
    }
    
    if (highRiskApps > 0) {
        insightsHTML += `
            <div class="insight-item danger">
                <i class="fas fa-exclamation-triangle"></i>
                <span><strong>${highRiskApps} high-risk app(s)</strong> detected - requires attention</span>
            </div>
        `;
    }
    
    const internalApps = totalApps - externalApps;
    if (internalApps > 0) {
        insightsHTML += `
            <div class="insight-item success">
                <i class="fas fa-check-circle"></i>
                <span><strong>${internalApps} internal app(s)</strong> - managed by Microsoft</span>
            </div>
        `;
    }
    
    insightsHTML += '</div>';
    insightsContainer.innerHTML = insightsHTML;
}

// Initialize Applications charts
function initializeApplicationsCharts() {
    console.log('[Applications Charts] Initializing charts...');
    
    if (typeof Chart === 'undefined') {
        console.warn('[Applications Charts] Chart.js not loaded yet');
        setTimeout(initializeApplicationsCharts, 100);
        return;
    }
    
    setTimeout(() => {
        renderAppDistributionChart();
        renderTopAppsChart();
    }, 50);
}

// Render App Distribution Chart
function renderAppDistributionChart() {
    const canvasElement = document.getElementById('appDistributionChart');
    if (!canvasElement) return;
    
    const internalCount = applicationsData.filter(a => !a.isExternal).length;
    const externalCount = applicationsData.filter(a => a.isExternal).length;
    
    canvasElement.width = canvasElement.parentElement.clientWidth;
    canvasElement.height = 300;
    
    const ctx = canvasElement.getContext('2d');
    if (!ctx) return;
    
    if (window.appDistributionChartInstance && typeof window.appDistributionChartInstance.destroy === 'function') {
        window.appDistributionChartInstance.destroy();
    }
    
    window.appDistributionChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Internal', 'External'],
            datasets: [{
                label: 'Application Count',
                data: [internalCount, externalCount],
                backgroundColor: [
                    'rgba(34, 197, 94, 0.7)',
                    'rgba(248, 113, 113, 0.7)'
                ],
                borderColor: [
                    'rgba(34, 197, 94, 1)',
                    'rgba(248, 113, 113, 1)'
                ],
                borderWidth: 2,
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            indexAxis: 'y',
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: { color: '#999' },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' }
                },
                y: {
                    ticks: { color: '#999', font: { size: 12 } },
                    grid: { display: false }
                }
            }
        }
    });
}

// Render Top Apps by Users Chart
function renderTopAppsChart() {
    const canvasElement = document.getElementById('topAppsChart');
    if (!canvasElement) return;
    
    const topApps = applicationsData
        .sort((a, b) => b.userCount - a.userCount)
        .slice(0, 5);
    
    if (topApps.length === 0) return;
    
    const labels = topApps.map(a => a.name.substring(0, 15));
    const data = topApps.map(a => a.userCount || 0);
    
    canvasElement.width = canvasElement.parentElement.clientWidth;
    canvasElement.height = 300;
    
    const ctx = canvasElement.getContext('2d');
    if (!ctx) return;
    
    if (window.topAppsChartInstance && typeof window.topAppsChartInstance.destroy === 'function') {
        window.topAppsChartInstance.destroy();
    }
    
    const colors = [
        'rgba(0, 110, 255, 0.8)',
        'rgba(249, 115, 22, 0.8)',
        'rgba(34, 197, 94, 0.8)',
        'rgba(248, 113, 113, 0.8)',
        'rgba(168, 85, 247, 0.8)'
    ];
    
    window.topAppsChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'User Count',
                data: data,
                backgroundColor: colors.slice(0, labels.length),
                borderColor: colors.slice(0, labels.length).map(c => c.replace('0.8', '1')),
                borderWidth: 2,
                borderRadius: 6
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: { color: '#999' },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' }
                },
                y: {
                    ticks: { color: '#999', font: { size: 11 } },
                    grid: { display: false }
                }
            }
        }
    });
}

// Open Identity full dashboard
function openIdentityDashboard() {
    console.log('[Identity Dashboard] Opening full dashboard...');
    
    const dashboardView = document.getElementById('dashboard-view');
    if (!dashboardView) return;

    // Show dashboard view
    document.getElementById('projects-view').style.display = 'none';
    dashboardView.style.display = 'block';
    
    // Hide generic dashboard parts to prioritize Identity content
    const statsGrid = dashboardView.querySelector('.stats-grid');
    const chartsSection = dashboardView.querySelector('.charts-section');
    const dashboardTabs = dashboardView.querySelector('.dashboard-tabs');
    
    if (statsGrid) statsGrid.style.display = 'none';
    if (chartsSection) chartsSection.style.display = 'none';
    if (dashboardTabs) dashboardTabs.style.display = 'none';

    // Update dashboard title
    const projectName = document.getElementById('project-name');
    const projectStatus = document.getElementById('project-status');
    if (projectName) projectName.textContent = ' Identity Protection - Full Dashboard';
    if (projectStatus) projectStatus.textContent = 'Active';
    
    // Hide site header initially for full dashboard view
    const siteHeader = document.querySelector('.site-header');
    if (siteHeader) {
        siteHeader.classList.add('header-hidden');
        siteHeader.classList.remove('header-visible');
    }

    // Add scroll listener to show/hide header
    const handleDashboardScroll = () => {
        if (window.scrollY > 100) {
            siteHeader?.classList.add('header-visible');
            siteHeader?.classList.remove('header-hidden');
        } else {
            siteHeader?.classList.add('header-hidden');
            siteHeader?.classList.remove('header-visible');
        }
    };
    
    // Make it removable
    window.removeDashboardScroll = () => {
        window.removeEventListener('scroll', handleDashboardScroll);
        delete window.removeDashboardScroll;
    };
    
    window.addEventListener('scroll', handleDashboardScroll);

    // Update back button to go back to projects
    const backBtn = document.getElementById('btn-back');
    if (backBtn) {
        backBtn.onclick = function() {
            resetDashboard();
            
            // Restore generic parts for other projects
            if (statsGrid) statsGrid.style.display = 'grid';
            if (chartsSection) chartsSection.style.display = 'grid';
        };
    }
    
    // WAIT for data to load before initializing dashboard
    // If data is already loaded (isSunbirdDashboard = true), initialize immediately
    if (isSunbirdDashboard && microsoftUsersData.length > 0) {
        console.log('[Identity Dashboard] Data already loaded, initializing immediately');
        initializeIdentityDashboard();
    } else {
        // Otherwise wait for data to load with timeout
        console.log('[Identity Dashboard] Waiting for data to load...');
        let waitTime = 0;
        const maxWait = 5000; // Max 5 seconds
        const checkInterval = setInterval(() => {
            waitTime += 100;
            if (isSunbirdDashboard && microsoftUsersData.length > 0) {
                console.log('[Identity Dashboard] Data loaded successfully');
                clearInterval(checkInterval);
                initializeIdentityDashboard();
            } else if (waitTime >= maxWait) {
                console.warn('[Identity Dashboard] Data load timeout, initializing with available data');
                clearInterval(checkInterval);
                initializeIdentityDashboard();
            }
        }, 100);
    }
}

// Initialize  Identity Protection dashboard
function initializeIdentityDashboard() {
    console.log('[Identity Dashboard] Initializing dashboard...');
    console.log(`[Identity Dashboard] Users data available: ${microsoftUsersData.length}`);
    console.log(`[Identity Dashboard] Sunbird dashboard: ${isSunbirdDashboard}`);
    console.log('[Identity Dashboard] First user sample:', microsoftUsersData[0]);
    
    if (microsoftUsersData.length === 0) {
        console.warn('[Identity Dashboard] No user data available');
        return;
    }
    
    // Update dashboard content with Identity-specific layout
    const dashboardView = document.getElementById('dashboard-view');
    if (dashboardView) {
        dashboardView.innerHTML = generateIdentityDashboardHTML();
    }
    
    // Initialize table population, search, and insights
    setTimeout(() => {
        console.log('[Identity Dashboard] Initializing table, search, and insights');
        populateIdentityTable();
        setupIdentitySearch();
        initializeIdentityInsights();
    }, 100);
}

function setupIdentitySearch() {
    const searchInput = document.getElementById('user-search-input');
    const filterCheckboxes = document.querySelectorAll('.filter-checkbox input[type="checkbox"]');
    const clearFiltersBtn = document.getElementById('btn-clear-filters');
    const backBtn = document.getElementById('btn-back-identity');
    const tableContainer = document.querySelector('.identity-users-table-container');
    
    // Add horizontal scroll indicator when table can be scrolled
    if (tableContainer) {
        const updateScrollIndicator = () => {
            const isScrollable = tableContainer.scrollWidth > tableContainer.clientWidth;
            const isAtEnd = tableContainer.scrollLeft + tableContainer.clientWidth >= tableContainer.scrollWidth - 10;
            
            if (isScrollable && !isAtEnd) {
                tableContainer.classList.add('has-scroll');
            } else {
                tableContainer.classList.remove('has-scroll');
            }
        };

        // Check on load
        setTimeout(updateScrollIndicator, 300);
        
        // Update on scroll
        tableContainer.addEventListener('scroll', updateScrollIndicator);
        
        // Update as content changes or window resizes
        window.addEventListener('resize', updateScrollIndicator);
    }
    
    // Function to apply all filters and search
    const applyFilters = () => {
        const searchTerm = searchInput?.value.toLowerCase() || '';
        const selectedFilters = Array.from(filterCheckboxes)
            .filter(cb => cb.checked)
            .map(cb => cb.dataset.filter);
        
        const rows = document.querySelectorAll('#users-table-body tr');
        
        rows.forEach((row, rowIndex) => {
            const name = row.cells[0]?.textContent.toLowerCase() || '';
            const email = row.cells[1]?.textContent.toLowerCase() || '';
            
            // Get the actual user data
            const user = microsoftUsersData[rowIndex];
            if (!user) return;
            
            // Search filter
            const matchesSearch = !searchTerm || name.includes(searchTerm) || email.includes(searchTerm);
            
            // Type filters
            let matchesTypeFilter = true;
            
            if (selectedFilters.length > 0) {
                const isInternal = !user.isExternal;
                const isExternal = user.isExternal;
                const hasRoles = (userRolesMap[user.id] && userRolesMap[user.id].length > 0) ||
                                (isSunbirdDashboard && user.roles && user.roles.length > 0);
                const hasMissingJobTitle = !user.jobTitle || user.jobTitle === 'No Title' || user.jobTitle.trim() === '';
                const hasMissingPhone = !user.mobilePhone || user.mobilePhone === 'N/A' || (typeof user.mobilePhone === 'string' && user.mobilePhone.trim() === '');
                const hasMissingData = hasMissingJobTitle || hasMissingPhone;
                
                matchesTypeFilter = 
                    (selectedFilters.includes('internal') && isInternal) ||
                    (selectedFilters.includes('external') && isExternal) ||
                    (selectedFilters.includes('admins') && hasRoles) ||
                    (selectedFilters.includes('missing-data') && hasMissingData);
            }
            
            row.style.display = (matchesSearch && matchesTypeFilter) ? '' : 'none';
        });
    };
    
    // Add event listeners
    if (searchInput) {
        searchInput.addEventListener('input', applyFilters);
    }
    
    filterCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', applyFilters);
    });
    
    if (clearFiltersBtn) {
        clearFiltersBtn.addEventListener('click', () => {
            filterCheckboxes.forEach(cb => cb.checked = false);
            if (searchInput) searchInput.value = '';
            applyFilters();
        });
    }
    
    // Back button functionality
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            resetDashboard();
        });
    }
}

function initializeIdentityInsights() {
    console.log('[Identity Insights] Initializing insights and charts...');
    
    if (microsoftUsersData.length === 0) {
        console.warn('[Identity Insights] No user data available');
        return;
    }
    
    // Calculate data for insights
    const missingJobTitles = microsoftUsersData.filter(u => !u.jobTitle || u.jobTitle === 'No Title' || u.jobTitle.trim() === '').length;
    const missingPhones = microsoftUsersData.filter(u => !u.mobilePhone || u.mobilePhone === 'N/A' || (typeof u.mobilePhone === 'string' && u.mobilePhone.trim() === '')).length;
    const completeProfiles = microsoftUsersData.filter(u => (u.jobTitle && u.jobTitle !== 'No Title' && u.jobTitle.trim() !== '') && (u.mobilePhone && u.mobilePhone !== 'N/A' && typeof u.mobilePhone === 'string' && u.mobilePhone.trim() !== '')).length;
    
    // Update missing data display
    document.getElementById('missingJobTitles').textContent = missingJobTitles;
    document.getElementById('missingPhones').textContent = missingPhones;
    document.getElementById('completeProfiles').textContent = completeProfiles;
    
    // Calculate and update health score
    const healthScore = Math.round((completeProfiles / microsoftUsersData.length) * 100);
    document.getElementById('healthScoreValue').textContent = healthScore;
    document.getElementById('healthScoreProgress').style.width = healthScore + '%';
    
    // Update risk panel
    const hasBreakGlass = microsoftUsersData.some(u => u.mail?.toLowerCase().includes('break glass'));
    const riskCriticalDiv = document.getElementById('riskCritical');
    if (hasBreakGlass && riskCriticalDiv) {
        riskCriticalDiv.style.display = 'flex';
    }
    
    const riskMediumText = document.getElementById('riskMediumText');
    if (riskMediumText) {
        riskMediumText.textContent = `Medium Risk: ${missingJobTitles} users without job titles, ${missingPhones} users without phone`;
    }
    
    // Initialize charts
    initializeIdentityCharts();
    
    // Initialize Sunbird-specific analytics if available
    renderSunbirdAnalytics();
}

function initializeIdentityCharts() {
    console.log('[Identity Charts] Initializing all charts...');
    
    // Ensure Chart.js is loaded
    if (typeof Chart === 'undefined') {
        console.warn('[Identity Charts] Chart.js not loaded yet, retrying in 100ms...');
        setTimeout(initializeIdentityCharts, 100);
        return;
    }
    
    // Give DOM time to settle
    setTimeout(() => {
        // Job Title Distribution
        const jobTitleDistribution = {};
        microsoftUsersData.forEach(u => {
            const title = (u.jobTitle && u.jobTitle !== 'No Title') ? u.jobTitle : 'Missing';
            jobTitleDistribution[title] = (jobTitleDistribution[title] || 0) + 1;
        });
        
        // Get top 8 job titles
        const sortedTitles = Object.entries(jobTitleDistribution).sort((a, b) => b[1] - a[1]).slice(0, 8);
        const jobTitleLabels = sortedTitles.map(t => t[0].substring(0, 15));
        const jobTitleData = sortedTitles.map(t => t[1]);
        
        renderJobTitleChart(jobTitleLabels, jobTitleData);
        
        // Contact Completeness
        const hasPhone = microsoftUsersData.filter(u => u.mobilePhone && u.mobilePhone !== 'N/A' && typeof u.mobilePhone === 'string' && u.mobilePhone.trim() !== '').length;
        const noPhone = microsoftUsersData.length - hasPhone;
        renderContactChart(hasPhone, noPhone);
        
        // User Type Distribution
        const internalCount = microsoftUsersData.filter(u => !u.isExternal).length;
        const externalCount = microsoftUsersData.filter(u => u.isExternal).length;
        renderUserTypeChart(internalCount, externalCount);
        
        // Active Status
        const activeCount = microsoftUsersData.length;
        const inactiveCount = 0;
        renderActiveStatusChart(activeCount, inactiveCount);
        
        // Role Distribution  
        renderRoleDistributionChart();
        
        // Admin users list
        populateAdminUsersList();
        
        // Risk indicator
        populateRiskIndicator();
        
        // Security insights
        populateSecurityInsights();
    }, 50);
}

function renderJobTitleChart(labels, data) {
    const canvasElement = document.getElementById('jobTitleChart');
    if (!canvasElement) return;
    
    // Set canvas dimensions
    canvasElement.width = canvasElement.parentElement.clientWidth;
    canvasElement.height = 250;
    
    const ctx = canvasElement.getContext('2d');
    if (!ctx) return;
    
    if (window.jobTitleChartInstance && typeof window.jobTitleChartInstance.destroy === 'function') {
        window.jobTitleChartInstance.destroy();
    }
    
    window.jobTitleChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Count',
                data: data,
                backgroundColor: 'rgba(0, 110, 255, 0.6)',
                borderColor: 'rgba(0, 110, 255, 1)',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            indexAxis: 'y',
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: { color: '#999' },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' }
                },
                y: {
                    ticks: { color: '#999', font: { size: 11 } },
                    grid: { display: false }
                }
            }
        }
    });
}

function renderContactChart(hasPhone, noPhone) {
    const canvasElement = document.getElementById('contactChart');
    if (!canvasElement) return;
    
    // Set canvas dimensions
    canvasElement.width = canvasElement.parentElement.clientWidth;
    canvasElement.height = 250;
    
    const ctx = canvasElement.getContext('2d');
    if (!ctx) return;
    
    if (window.contactChartInstance && typeof window.contactChartInstance.destroy === 'function') {
        window.contactChartInstance.destroy();
    }
    
    window.contactChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Has Phone', 'Missing Phone'],
            datasets: [{
                data: [hasPhone, noPhone],
                backgroundColor: [
                    'rgba(34, 197, 94, 0.7)',
                    'rgba(220, 53, 69, 0.7)'
                ],
                borderColor: [
                    'rgba(34, 197, 94, 1)',
                    'rgba(220, 53, 69, 1)'
                ],
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    labels: { color: '#999', font: { size: 11 } }
                }
            }
        }
    });
}

function renderUserTypeChart(internal, external) {
    const canvasElement = document.getElementById('userTypeChart');
    if (!canvasElement) return;
    
    // Set canvas dimensions
    canvasElement.width = canvasElement.parentElement.clientWidth;
    canvasElement.height = 250;
    
    const ctx = canvasElement.getContext('2d');
    if (!ctx) return;
    
    if (window.userTypeChartInstance && typeof window.userTypeChartInstance.destroy === 'function') {
        window.userTypeChartInstance.destroy();
    }
    
    window.userTypeChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Internal', 'External'],
            datasets: [{
                data: [internal, external],
                backgroundColor: [
                    'rgba(34, 197, 94, 0.7)',
                    'rgba(249, 115, 22, 0.7)'
                ],
                borderColor: [
                    'rgba(34, 197, 94, 1)',
                    'rgba(249, 115, 22, 1)'
                ],
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    labels: { color: '#999', font: { size: 11 } }
                }
            }
        }
    });
}

function renderActiveStatusChart(active, inactive) {
    const canvasElement = document.getElementById('activeStatusChart');
    if (!canvasElement) return;
    
    // Set canvas dimensions
    canvasElement.width = canvasElement.parentElement.clientWidth;
    canvasElement.height = 250;
    
    const ctx = canvasElement.getContext('2d');
    if (!ctx) return;
    
    if (window.activeStatusChartInstance && typeof window.activeStatusChartInstance.destroy === 'function') {
        window.activeStatusChartInstance.destroy();
    }
    
    window.activeStatusChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Active', 'Inactive'],
            datasets: [{
                data: [active, inactive],
                backgroundColor: [
                    'rgba(34, 197, 94, 0.7)',
                    'rgba(107, 114, 128, 0.7)'
                ],
                borderColor: [
                    'rgba(34, 197, 94, 1)',
                    'rgba(107, 114, 128, 1)'
                ],
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    labels: { color: '#999', font: { size: 11 } }
                }
            }
        }
    });
}

// Render Role Distribution Chart
function renderRoleDistributionChart() {
    const canvasElement = document.getElementById('roleDistributionChart');
    if (!canvasElement) return;
    
    // Count roles distribution
    const roleDistribution = {};
    microsoftRolesData.forEach(assignment => {
        const roleName = assignment.roleName || 'Unknown';
        roleDistribution[roleName] = (roleDistribution[roleName] || 0) + 1;
    });
    
    const labels = Object.keys(roleDistribution).slice(0, 10); // Top 10 roles
    const data = labels.map(role => roleDistribution[role]);
    
    // Set canvas dimensions
    canvasElement.width = canvasElement.parentElement.clientWidth;
    canvasElement.height = 250;
    
    const ctx = canvasElement.getContext('2d');
    if (!ctx) return;
    
    if (window.roleDistributionChartInstance && typeof window.roleDistributionChartInstance.destroy === 'function') {
        window.roleDistributionChartInstance.destroy();
    }
    
    const colors = [
        'rgba(0, 110, 255, 0.8)',
        'rgba(249, 115, 22, 0.8)',
        'rgba(34, 197, 94, 0.8)',
        'rgba(248, 113, 113, 0.8)',
        'rgba(132, 204, 22, 0.8)',
        'rgba(168, 85, 247, 0.8)',
        'rgba(14, 165, 233, 0.8)',
        'rgba(236, 72, 153, 0.8)',
        'rgba(251, 146, 60, 0.8)',
        'rgba(59, 130, 246, 0.8)'
    ];
    
    window.roleDistributionChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Number of Assignments',
                data: data,
                backgroundColor: colors.slice(0, labels.length),
                borderColor: colors.slice(0, labels.length).map(c => c.replace('0.8', '1')),
                borderWidth: 1,
                borderRadius: 4,
                barThickness: 20
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: {
                        color: '#999',
                        font: { size: 11 }
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)'
                    }
                },
                y: {
                    ticks: {
                        color: '#999',
                        font: { size: 11 }
                    },
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}

// Populate Admin Users List
function populateAdminUsersList() {
    const adminListContainer = document.getElementById('admin-users-list');
    if (!adminListContainer) return;
    
    const usersWithRoles = Object.entries(userRolesMap)
        .map(([userId, roles]) => {
            const user = microsoftUsersData.find(u => u.id === userId);
            if (!user) return null;
            return {
                ...user,
                roles: roles,
                isGlobalAdmin: roles.some(role => role.toLowerCase().includes('global admin') || role.toLowerCase().includes('company administrator')),
                isSecurityAdmin: roles.some(role => role.toLowerCase().includes('security admin')),
                isPrivileged: roles.some(role => 
                    role.toLowerCase().includes('admin') || 
                    role.toLowerCase().includes('owner') || 
                    role.toLowerCase().includes('manager')
                )
            };
        })
        .filter(user => user && user.isPrivileged)
        .sort((a, b) => (b.isGlobalAdmin ? 1 : 0) - (a.isGlobalAdmin ? 1 : 0));
    
    if (usersWithRoles.length === 0) {
        adminListContainer.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">No admin users found</p>';
        return;
    }
    
    let html = '<div class="admin-stats">';
    
    const globalAdmins = usersWithRoles.filter(u => u.isGlobalAdmin).length;
    const securityAdmins = usersWithRoles.filter(u => u.isSecurityAdmin).length;
    const privilegedUsers = usersWithRoles.length;
    
    html += `
        <div class="admin-stat-item">
            <span class="stat-label">👑 Global Admins:</span>
            <span class="stat-value">${globalAdmins}</span>
        </div>
        <div class="admin-stat-item">
            <span class="stat-label">🔐 Security Admins:</span>
            <span class="stat-value">${securityAdmins}</span>
        </div>
        <div class="admin-stat-item">
            <span class="stat-label">⭐ Privileged Users:</span>
            <span class="stat-value">${privilegedUsers}</span>
        </div>
    </div>
    
    <div class="admin-users-table">
        <div class="admin-user-header">
            <span>User</span>
            <span>Roles</span>
        </div>
    `;
    
    usersWithRoles.slice(0, 10).forEach(user => {
        const rolesList = user.roles.map(role => {
            let badgeClass = 'role-badge-normal';
            if (role.toLowerCase().includes('global admin') || role.toLowerCase().includes('company administrator')) {
                badgeClass = 'role-badge-critical';
            } else if (role.toLowerCase().includes('security admin')) {
                badgeClass = 'role-badge-warning';
            }
            return `<span class="${badgeClass}">${role}</span>`;
        }).join('');
        
        html += `
            <div class="admin-user-item">
                <span class="user-name">${user.displayName || 'Unknown User'}</span>
                <span class="user-roles">${rolesList}</span>
            </div>
        `;
    });
    
    html += '</div>';
    
    if (usersWithRoles.length > 10) {
        html += `<p style="text-align: center; color: #999; font-size: 0.85em; margin-top: 10px;">+${usersWithRoles.length - 10} more admin users</p>`;
    }
    
    adminListContainer.innerHTML = html;
}

// ============================================
// SECURITY & RISK ASSESSMENT API
// ============================================
// Analyzes security risks including admin privileges,
// break glass accounts, and multi-role users

// Populate Risk Indicator
function populateRiskIndicator() {
    const riskContainer = document.getElementById('risk-summary');
    if (!riskContainer) return;
    
    const usersWithRoles = Object.keys(userRolesMap).length;
    const totalAdmins = Object.entries(userRolesMap)
        .filter(([_, roles]) => roles.some(role => role.toLowerCase().includes('admin')))
        .length;
    
    // Find break glass account
    const breakGlassUser = microsoftUsersData.find(u => 
        u.mail?.toLowerCase().includes('break glass') || 
        u.displayName?.toLowerCase().includes('break glass')
    );
    const hasBreakGlass = !!breakGlassUser;
    
    let riskLevel = 'LOW';
    let riskColor = '#22c55e'; // green
    let riskEmoji = '✅';
    
    if (hasBreakGlass) {
        riskLevel = 'CRITICAL';
        riskColor = '#dc2626'; // red
        riskEmoji = '🔥';
    } else if (totalAdmins > 5) {
        riskLevel = 'HIGH';
        riskColor = '#dc2626'; // red
        riskEmoji = '🔴';
    } else if (totalAdmins > 3) {
        riskLevel = 'MEDIUM';
        riskColor = '#f59e0b'; // orange
        riskEmoji = '🟡';
    }
    
    let html = `
        <div class="risk-indicator" style="border-left: 4px solid ${riskColor}; padding-left: 15px;">
            <!-- RISK LEVEL STATS (TOP) -->
            <div class="risk-level-display">
                <span class="risk-emoji">${riskEmoji}</span>
                <div class="risk-info">
                    <span class="risk-level" style="color: ${riskColor};">${riskLevel}</span>
                    <span class="risk-description">Risk Level</span>
                </div>
            </div>
            
            <!-- RISK STATS - Labels Left, Values Right -->
            <div class="risk-details" style="margin-top: 15px; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.1);">
                <div class="risk-detail-item" style="display: flex; width: 100%; font-size: 0.9rem;">
                    <span style="flex: 0 0 auto;">Total Admin Users:</span>
                    <span class="detail-value" style="flex: 1; text-align: right;">${totalAdmins}</span>
                </div>
    `;
    
    if (hasBreakGlass) {
        html += `
                <div class="risk-detail-item" style="display: flex; width: 100%; color: #dc2626; margin-top: 10px; font-size: 0.9rem;">
                    <span style="flex: 0 0 auto;">⚠️ Master Admin (Break Glass):</span>
                    <span class="detail-value" style="flex: 1; text-align: right; color: #0066ff;">${(breakGlassUser.displayName || breakGlassUser.mail || 'Unknown').substring(0, 50)}</span>
                </div>
        `;
    }
    
    if (totalAdmins > 5) {
        html += `
                <div class="risk-detail-item" style="display: flex; width: 100%; color: #dc2626; margin-top: 10px; font-size: 0.9rem;">
                    <span style="flex: 0 0 auto;">⚠️ Excessive Admin Privileges:</span>
                    <span class="detail-value" style="flex: 1; text-align: right;">${totalAdmins} users</span>
                </div>
        `;
    }
    
    html += `
            </div>
    `;
    
    // BELOW: Recommended Actions section (stacked vertically)
    if (hasBreakGlass || totalAdmins > 5) {
        html += `
            <div class="risk-todo-section" style="margin-top: 20px; padding: 15px; background: rgba(255,255,255,0.05); border-radius: 6px; border-left: 3px solid ${riskColor};">
                <h4 style="margin: 0 0 12px 0; font-size: 0.95rem; color: #e0e0e0; font-weight: 600;">📋 Recommended Actions:</h4>
                <ul style="margin: 0; padding-left: 20px; list-style: disc; display: flex; flex-direction: column; gap: 8px;">
        `;
        
        if (hasBreakGlass) {
            html += `
                    <li style="color: #d1d5db; font-size: 0.8rem;">
                        <strong>Secure Break Glass Account:</strong> Limit access, enable MFA, audit recent activities
                    </li>
                    <li style="color: #d1d5db; font-size: 0.8rem;">
                        <strong>Review Permissions:</strong> Ensure Break Glass is only used for emergencies
                    </li>
            `;
        }
        
        if (totalAdmins > 5) {
            html += `
                    <li style="color: #d1d5db; font-size: 0.8rem;">
                        <strong>Audit Admin Roles:</strong> Remove unnecessary admin privileges from users
                    </li>
                    <li style="color: #d1d5db; font-size: 0.8rem;">
                        <strong>Implement Principle of Least Privilege:</strong> Assign specific admin roles instead of global admin
                    </li>
                    <li style="color: #d1d5db; font-size: 0.8rem;">
                        <strong>Target Goal:</strong> Reduce admin count to 3-5 key administrators
                    </li>
            `;
        }
        
        html += `
                </ul>
            </div>
        `;
    }
    
    html += `
        </div>
    `;
    
    riskContainer.innerHTML = html;
}

// ============================================
// SECURITY INSIGHTS API
// ============================================
// Provides detailed security insights for multi-role users,
// admins without phone numbers, and privilege analysis

// Populate Security Insights
function populateSecurityInsights() {
    const insightsContainer = document.getElementById('security-insights-list');
    if (!insightsContainer) return;
    
    const insights = [];
    
    // Find users with multiple roles
    const multiRoleUsers = Object.entries(userRolesMap)
        .filter(([_, roles]) => roles.length > 2)
        .map(([userId, roles]) => {
            const user = microsoftUsersData.find(u => u.id === userId);
            return { user: user?.displayName || user?.mail || 'Unknown', roleCount: roles.length, roles };
        });
    
    if (multiRoleUsers.length > 0) {
        const usersList = multiRoleUsers
            .sort((a, b) => b.roleCount - a.roleCount)
            .map(u => `${u.user} (${u.roleCount} roles)`)
            .join(', ');
        
        insights.push({
            icon: '⚠️',
            title: 'Users with Multiple Admin Roles',
            description: `${multiRoleUsers.length} user(s) have multiple roles:<br><strong>${usersList}</strong>`,
            severity: 'warning'
        });
    }
    
    // Find external users (highest security concern)
    const externalAdmins = Object.entries(userRolesMap)
        .map(([userId, roles]) => {
            const user = microsoftUsersData.find(u => u.id === userId);
            return { user, roles };
        })
        .filter(({ user }) => user && user.isExternal);
    
    if (externalAdmins.length > 0) {
        insights.push({
            icon: '🔴',
            title: 'External Users with Roles',
            description: `${externalAdmins.length} external user(s) have administrative roles assigned.`,
            severity: 'critical'
        });
    }
    
    // Check for users with incomplete profiles
    const adminsWithoutPhoneList = Object.entries(userRolesMap)
        .map(([userId, _]) => {
            const user = microsoftUsersData.find(u => u.id === userId);
            return user;
        })
        .filter(user => user && (!user.mobilePhone || user.mobilePhone === 'N/A'));
    
    if (adminsWithoutPhoneList.length > 0) {
        const phonelessList = adminsWithoutPhoneList
            .map(u => u.displayName || u.mail || 'Unknown')
            .slice(0, 10)
            .join(', ');
        const moreText = adminsWithoutPhoneList.length > 10 ? `<br>... and ${adminsWithoutPhoneList.length - 10} more` : '';
        
        insights.push({
            icon: '📱',
            title: 'Admins Without Phone',
            description: `${adminsWithoutPhoneList.length} admin(s) don't have phone numbers on file:<br><strong>${phonelessList}</strong>${moreText}`,
            severity: 'medium'
        });
    }
    
    // High admin ratio
    const totalAdmins = Object.keys(userRolesMap).length;
    const adminRatio = (totalAdmins / microsoftUsersData.length * 100).toFixed(1);
    
    if (adminRatio > 20) {
        insights.push({
            icon: '📊',
            title: 'High Admin Ratio',
            description: `${adminRatio}% of users have administrative roles (recommended: <10%).`,
            severity: 'medium'
        });
    }
    
    if (insights.length === 0) {
        insightsContainer.innerHTML = '<p style="text-align: center; color: #22c55e; padding: 20px;">✅ No security concerns detected</p>';
        return;
    }
    
    let html = '<div class="insights-list">';
    
    insights.forEach(insight => {
        const severityClass = `insight-${insight.severity}`;
        html += `
            <div class="insight-item ${severityClass}">
                <span class="insight-icon">${insight.icon}</span>
                <div class="insight-content">
                    <div class="insight-title">${insight.title}</div>
                    <div class="insight-description">${insight.description}</div>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    insightsContainer.innerHTML = html;
}

/* ============================================================== */
/* SUNBIRD ANALYTICS RENDERING FUNCTIONS                          */
/* ============================================================== */

// Render Sunbird Summary Cards (Security Score, Risk, Activity)
function renderSunbirdSummaryCards() {
    const summaryCardsDiv = document.getElementById('sunbird-summary-cards');
    if (!summaryCardsDiv || !sunbirdDashboardData) return;

    const securityScore = Math.round(sunbirdDashboardData.summary.securityScore || 0);
    const identityRiskScore = Math.round(sunbirdDashboardData.summary.identityRiskScore || 0);
    const activeUsers = sunbirdDashboardData.summary.activeUsers24h || 0;
    const activeUsersPercentage = sunbirdDashboardData.summary.activeUsersPercentage || 0;
    const highRiskUsers = sunbirdDashboardData.summary.highRiskUsers || 0;
    const privilegedWithoutMFA = sunbirdDashboardData.summary.privilegedUsersWithoutMFA || 0;

    // Update summary card values with improved context
    document.getElementById('sunbird-security-score').textContent = securityScore;
    document.getElementById('sunbird-active-users').innerHTML = `<span style="font-size: 1.3rem;">${activeUsers}</span><span style="font-size: 0.75rem; opacity: 0.7; display: block;">${activeUsersPercentage}%</span>`;
    document.getElementById('sunbird-high-risk').textContent = highRiskUsers;
    document.getElementById('sunbird-privileged-without-mfa').textContent = privilegedWithoutMFA;
    document.getElementById('sunbird-identity-risk-score').textContent = identityRiskScore;

    // Update identity hygiene if the element exists
    const hygieneElement = document.getElementById('sunbird-identity-hygiene');
    if (hygieneElement) {
        const hygieneScore = sunbirdDashboardData.summary.identityHygieneScore || 0;
        hygieneElement.textContent = hygieneScore;
    }

    summaryCardsDiv.style.display = 'grid';
}

// Render System Health Radar Chart
function renderSystemHealthRadar() {
    const canvasElement = document.getElementById('systemHealthRadar');
    if (!canvasElement || !sunbirdDashboardData) return;

    const health = sunbirdDashboardData.systemHealth;
    
    // Set canvas dimensions
    canvasElement.width = 400;
    canvasElement.height = 300;
    
    const ctx = canvasElement.getContext('2d');
    if (!ctx) return;
    
    if (window.systemHealthRadarInstance && typeof window.systemHealthRadarInstance.destroy === 'function') {
        window.systemHealthRadarInstance.destroy();
    }

    window.systemHealthRadarInstance = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: ['Performance', 'Availability', 'Security', 'Compliance', 'Backup'],
            datasets: [{
                label: 'System Health',
                data: [
                    health.performance || 0,
                    health.availability || 0,
                    health.security || 0,
                    health.compliance || 0,
                    health.backup || 0
                ],
                borderColor: 'rgba(0, 110, 255, 0.8)',
                backgroundColor: 'rgba(0, 110, 255, 0.2)',
                borderWidth: 2,
                fill: true,
                pointRadius: 4,
                pointBackgroundColor: 'rgba(0, 110, 255, 0.9)',
                pointBorderColor: '#fff',
                pointBorderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: '#999', font: { size: 11, weight: 200 } },
                    display: true
                }
            },
            scales: {
                r: {
                    beginAtZero: true,
                    max: 100,
                    ticks: {
                        color: '#666',
                        font: { size: 10, weight: 200 }
                    },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' }
                }
            }
        }
    });
}

// Render Risk Distribution Pie Chart
function renderRiskDistributionPie() {
    const canvasElement = document.getElementById('riskDistributionPie');
    if (!canvasElement || !sunbirdDashboardData) return;

    const riskDist = sunbirdDashboardData.riskDistribution;
    const highRisk = riskDist.HIGH || 0;
    const mediumRisk = riskDist.MEDIUM || 0;
    const safeRisk = riskDist.SAFE || 0;

    // Set canvas dimensions
    canvasElement.width = 300;
    canvasElement.height = 250;
    
    const ctx = canvasElement.getContext('2d');
    if (!ctx) return;
    
    if (window.riskDistributionPieInstance && typeof window.riskDistributionPieInstance.destroy === 'function') {
        window.riskDistributionPieInstance.destroy();
    }

    window.riskDistributionPieInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['🔴 High Risk', '🟡 Medium Risk', '🟢 Safe'],
            datasets: [{
                data: [highRisk, mediumRisk, safeRisk],
                backgroundColor: [
                    'rgba(220, 53, 69, 0.7)',
                    'rgba(249, 115, 22, 0.7)',
                    'rgba(34, 197, 94, 0.7)'
                ],
                borderColor: [
                    'rgba(220, 53, 69, 1)',
                    'rgba(249, 115, 22, 1)',
                    'rgba(34, 197, 94, 1)'
                ],
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: '#999', font: { size: 11, weight: 200 } },
                    position: 'bottom'
                }
            }
        }
    });
}

// 🆕 Render Authentication Strength Chart
function renderAuthenticationStrengthChart() {
    const canvasElement = document.getElementById('authenticationStrengthChart');
    if (!canvasElement || !sunbirdDashboardData) return;

    const authStrength = sunbirdDashboardData.authenticationStrength || { passwordOnly: 0, basicMFA: 0, strongMFA: 0 };
    canvasElement.width = 300;
    canvasElement.height = 250;
    
    const ctx = canvasElement.getContext('2d');
    if (!ctx) return;
    
    if (window.authStrengthInstance && typeof window.authStrengthInstance.destroy === 'function') {
        window.authStrengthInstance.destroy();
    }

    window.authStrengthInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['❌ Password Only', '⚠️ Basic MFA', '✅ Strong MFA'],
            datasets: [{
                data: [authStrength.passwordOnly, authStrength.basicMFA, authStrength.strongMFA],
                backgroundColor: [
                    'rgba(220, 53, 69, 0.7)',
                    'rgba(249, 115, 22, 0.7)',
                    'rgba(34, 197, 94, 0.7)'
                ],
                borderColor: [
                    'rgba(220, 53, 69, 1)',
                    'rgba(249, 115, 22, 1)',
                    'rgba(34, 197, 94, 1)'
                ],
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#999', font: { size: 11, weight: 200 } }, position: 'bottom' }
            }
        }
    });
}

// 🆕 Render Device Trust Analysis Chart
function renderDeviceTrustChart() {
    const canvasElement = document.getElementById('deviceTrustChart');
    if (!canvasElement || !sunbirdDashboardData) return;

    const deviceTrust = sunbirdDashboardData.deviceTrustAnalysis || { managed: 0, unmanaged: 0, unknown: 0 };
    canvasElement.width = 300;
    canvasElement.height = 250;
    
    const ctx = canvasElement.getContext('2d');
    if (!ctx) return;
    
    if (window.deviceTrustInstance && typeof window.deviceTrustInstance.destroy === 'function') {
        window.deviceTrustInstance.destroy();
    }

    window.deviceTrustInstance = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: ['✅ Managed', '⚠️ Unmanaged', '❓ Unknown'],
            datasets: [{
                data: [deviceTrust.managed, deviceTrust.unmanaged, deviceTrust.unknown],
                backgroundColor: [
                    'rgba(34, 197, 94, 0.7)',
                    'rgba(249, 115, 22, 0.7)',
                    'rgba(107, 114, 128, 0.7)'
                ],
                borderColor: [
                    'rgba(34, 197, 94, 1)',
                    'rgba(249, 115, 22, 1)',
                    'rgba(107, 114, 128, 1)'
                ],
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#999', font: { size: 11, weight: 200 } }, position: 'bottom' }
            }
        }
    });
}

// 🆕 Render Role Distribution Chart
function renderRoleDistributionChart() {
    const canvasElement = document.getElementById('roleDistributionChart');
    if (!canvasElement || !sunbirdDashboardData) return;

    const roles = sunbirdDashboardData.topRoles || [];
    const labels = roles.map(r => r.role.substring(0, 20)).slice(0, 8);
    const data = roles.map(r => r.count).slice(0, 8);

    canvasElement.width = 400;
    canvasElement.height = 250;
    
    const ctx = canvasElement.getContext('2d');
    if (!ctx) return;
    
    if (window.roleDistributionInstance && typeof window.roleDistributionInstance.destroy === 'function') {
        window.roleDistributionInstance.destroy();
    }

    const colors = [
        'rgba(59, 130, 246, 0.7)',
        'rgba(34, 197, 94, 0.7)',
        'rgba(249, 115, 22, 0.7)',
        'rgba(139, 92, 246, 0.7)',
        'rgba(236, 72, 153, 0.7)',
        'rgba(14, 165, 233, 0.7)',
        'rgba(168, 85, 247, 0.7)',
        'rgba(59, 130, 246, 0.5)'
    ];

    window.roleDistributionInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Users',
                data: data,
                backgroundColor: colors.slice(0, labels.length),
                borderColor: colors.slice(0, labels.length).map(c => c.replace('0.7', '1')),
                borderWidth: 1
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: { ticks: { color: '#999' } },
                y: { ticks: { color: '#999', font: { size: 10 } } }
            }
        }
    });
}

// 🆕 Render Inactive Users Breakdown (Stacked Bar)
function renderInactiveBreakdownChart() {
    const canvasElement = document.getElementById('inactiveBreakdownChart');
    if (!canvasElement || !sunbirdDashboardData) return;

    const inactive = sunbirdDashboardData.inactiveBreakdown || { '0-7days': 0, '7-30days': 0, '30-90days': 0, '90+days': 0 };
    
    canvasElement.width = 500;
    canvasElement.height = 150;
    
    const ctx = canvasElement.getContext('2d');
    if (!ctx) return;
    
    if (window.inactiveBreakdownInstance && typeof window.inactiveBreakdownInstance.destroy === 'function') {
        window.inactiveBreakdownInstance.destroy();
    }

    window.inactiveBreakdownInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Inactive Users'],
            datasets: [
                {
                    label: '0–7 days',
                    data: [inactive['0-7days']],
                    backgroundColor: 'rgba(34, 197, 94, 0.7)',
                    borderColor: 'rgba(34, 197, 94, 1)',
                    borderWidth: 1
                },
                {
                    label: '7–30 days',
                    data: [inactive['7-30days']],
                    backgroundColor: 'rgba(59, 130, 246, 0.7)',
                    borderColor: 'rgba(59, 130, 246, 1)',
                    borderWidth: 1
                },
                {
                    label: '30–90 days',
                    data: [inactive['30-90days']],
                    backgroundColor: 'rgba(249, 115, 22, 0.7)',
                    borderColor: 'rgba(249, 115, 22, 1)',
                    borderWidth: 1
                },
                {
                    label: '90+ days',
                    data: [inactive['90+days']],
                    backgroundColor: 'rgba(220, 53, 69, 0.7)',
                    borderColor: 'rgba(220, 53, 69, 1)',
                    borderWidth: 1
                }
            ]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { stacked: true, ticks: { color: '#999' } },
                y: { stacked: true, ticks: { color: '#999' } }
            },
            plugins: {
                legend: { labels: { color: '#999', font: { size: 10, weight: 200 } }, position: 'bottom' }
            }
        }
    });
}

// 🆕 Render Identity Hygiene Score Breakdown
function renderIdentityHygieneBreakdown() {
    const hygieneDiv = document.getElementById('identity-hygiene-breakdown');
    if (!hygieneDiv || !sunbirdDashboardData) return;

    const hygiene = sunbirdDashboardData.hygieneLevels || { profileCompleteness: 0, authCompleteness: 0, activityCompleteness: 0 };
    
    hygieneDiv.innerHTML = `
        <div style="display: grid; gap: 12px;">
            <div>
                <div style="display: flex; justify-content: space-between; font-size: 0.9rem; margin-bottom: 4px;">
                    <span>👤 Profile Completeness</span>
                    <strong>${hygiene.profileCompleteness}%</strong>
                </div>
                <div style="width: 100%; height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; overflow: hidden;">
                    <div style="width: ${hygiene.profileCompleteness}%; height: 100%; background: linear-gradient(90deg, #3b82f6, #0ea5e9); transition: width 0.3s ease;"></div>
                </div>
            </div>
            <div>
                <div style="display: flex; justify-content: space-between; font-size: 0.9rem; margin-bottom: 4px;">
                    <span>🔐 Auth Completeness</span>
                    <strong>${hygiene.authCompleteness}%</strong>
                </div>
                <div style="width: 100%; height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; overflow: hidden;">
                    <div style="width: ${hygiene.authCompleteness}%; height: 100%; background: linear-gradient(90deg, #22c55e, #84cc16); transition: width 0.3s ease;"></div>
                </div>
            </div>
            <div>
                <div style="display: flex; justify-content: space-between; font-size: 0.9rem; margin-bottom: 4px;">
                    <span>📊 Activity Completeness</span>
                    <strong>${hygiene.activityCompleteness}%</strong>
                </div>
                <div style="width: 100%; height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; overflow: hidden;">
                    <div style="width: ${hygiene.activityCompleteness}%; height: 100%; background: linear-gradient(90deg, #f97316, #ef4444); transition: width 0.3s ease;"></div>
                </div>
            </div>
        </div>
    `;
}

// Render Sign-In Insights (Top Locations, Device Breakdown, Timeline)
function renderSignInInsights() {
    const insightsRowDiv = document.getElementById('sunbird-insights-row');
    if (!insightsRowDiv || !sunbirdDashboardData) return;

    // Render Top Locations Table
    const topLocationsBody = document.getElementById('top-locations-body');
    if (topLocationsBody && sunbirdDashboardData.signInPatterns) {
        const locations = sunbirdDashboardData.signInPatterns.topLocations || [];
        topLocationsBody.innerHTML = '';
        
        locations.slice(0, 5).forEach(location => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${location.location || 'Unknown'}</td>
                <td><strong>${location.count || 0}</strong></td>
            `;
            topLocationsBody.appendChild(row);
        });

        if (locations.length === 0) {
            topLocationsBody.innerHTML = '<tr><td colspan="2" style="text-align: center; color: #999;">No location data available</td></tr>';
        }
    }

    // Render Device Breakdown Chart
    renderDeviceBreakdownChart();

    // Render Sign-In Timeline
    renderSignInTimeline();

    // Show all analytics rows
    insightsRowDiv.style.display = 'grid';
    const analyticsRow2 = document.getElementById('sunbird-analytics-row-2');
    const analyticsRow3 = document.getElementById('sunbird-analytics-row-3');
    if (analyticsRow2) analyticsRow2.style.display = 'grid';
    if (analyticsRow3) analyticsRow3.style.display = 'grid';
}

// Render Device Breakdown Chart
function renderDeviceBreakdownChart() {
    const canvasElement = document.getElementById('deviceBreakdownChart');
    if (!canvasElement || !sunbirdDashboardData) return;

    const deviceData = sunbirdDashboardData.signInPatterns?.deviceBreakdown || {};
    const labels = Object.keys(deviceData);
    const data = Object.values(deviceData);

    // Set canvas dimensions
    canvasElement.width = 250;
    canvasElement.height = 200;
    
    const ctx = canvasElement.getContext('2d');
    if (!ctx) return;
    
    if (window.deviceBreakdownInstance && typeof window.deviceBreakdownInstance.destroy === 'function') {
        window.deviceBreakdownInstance.destroy();
    }

    const colors = [
        'rgba(59, 130, 246, 0.7)',
        'rgba(34, 197, 94, 0.7)',
        'rgba(249, 115, 22, 0.7)',
        'rgba(139, 92, 246, 0.7)',
        'rgba(236, 72, 153, 0.7)'
    ];

    window.deviceBreakdownInstance = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors.slice(0, labels.length),
                borderColor: colors.slice(0, labels.length).map(c => c.replace('0.7', '1')),
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: '#999', font: { size: 10, weight: 200 } },
                    position: 'bottom'
                }
            }
        }
    });
}

// Render Sign-In Timeline
function renderSignInTimeline() {
    const timelineContainer = document.getElementById('timeline-container');
    if (!timelineContainer || !sunbirdDashboardData) return;

    timelineContainer.innerHTML = '';

    const signIns = sunbirdDashboardData.users
        ?.filter(u => u.lastSignIn && u.lastSignIn.dateTime)
        .map(u => ({
            user: u.displayName,
            date: new Date(u.lastSignIn.dateTime),
            location: u.lastSignIn.location,
            app: u.lastSignIn.appDisplayName,
            clientAppUsed: u.lastSignIn.clientAppUsed
        }))
        .sort((a, b) => b.date - a.date)
        .slice(0, 10) || [];

    if (signIns.length === 0) {
        timelineContainer.innerHTML = '<p style="text-align: center; color: #999; font-size: 0.85rem;">No recent sign-ins</p>';
        return;
    }

    signIns.forEach(signin => {
        const timeAgo = getTimeAgoString(signin.date);
        const appName = signin.app || signin.clientAppUsed || 'Microsoft Portal';
        const timelineItem = document.createElement('div');
        timelineItem.className = 'timeline-item';
        timelineItem.innerHTML = `
            <div class="timeline-icon">📋</div>
            <div class="timeline-info">
                <div class="timeline-user">${signin.user}</div>
                <div class="timeline-action">Signed in via ${appName}</div>
                <div class="timeline-time">${signin.location || 'Unknown location'} • ${timeAgo}</div>
            </div>
        `;
        timelineContainer.appendChild(timelineItem);
    });
}

// Helper function: Convert timestamp to "X time ago" format
function getTimeAgoString(date) {
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
    
    return 'Just now';
}

// Master function to render all Sunbird analytics
function renderSunbirdAnalytics() {
    if (!isSunbirdDashboard || !sunbirdDashboardData) {
        console.log('[Sunbird Analytics] Not Sunbird dashboard, skipping analytics');
        return;
    }

    console.log('[Sunbird Analytics] Rendering all components...');
    
    try {
        renderSunbirdSummaryCards();
        renderSystemHealthRadar();
        renderRiskDistributionPie();
        renderAuthenticationStrengthChart();
        renderDeviceTrustChart();
        renderRoleDistributionChart();
        renderInactiveBreakdownChart();
        renderIdentityHygieneBreakdown();
        renderSignInInsights();
        
        console.log('[Sunbird Analytics] All components rendered successfully');
    } catch (error) {
        console.error('[Sunbird Analytics] Error rendering components:', error);
    }
}

function setupEventListeners() {
    const loginForm = document.getElementById('login-form');
    const logoutBtn = document.getElementById('btn-logout');
    const backBtn = document.getElementById('btn-back');
    const passwordToggle = document.getElementById('password-toggle');
    const navPrev = document.getElementById('nav-prev');
    const navNext = document.getElementById('nav-next');
    const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
    const mobileNavClose = document.getElementById('mobile-nav-close');
    const mobileNav = document.getElementById('mobile-nav');
    const btnLogoutMobile = document.getElementById('btn-logout-mobile');
    const verifyMfaBtn = document.getElementById('verify-mfa-btn');
    const resendCodeLink = document.getElementById('resend-code-link');
    const backToLoginLink = document.getElementById('back-to-login');

    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    if (verifyMfaBtn) {
        verifyMfaBtn.addEventListener('click', handleMfaVerification);
    }

    // Handle resend code (same as signin.html)
    if (resendCodeLink) {
        resendCodeLink.addEventListener('click', async function(e) {
            e.preventDefault();
            try {
                const response = await fetch('/api/auth/send-mfa', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ email: currentEmail })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    showNotification('New MFA code sent to your email', true);
                } else {
                    showNotification(data.message || 'Failed to resend code. Please try again.', false);
                }
            } catch (error) {
                console.error('Error:', error);
                showNotification('An error occurred. Please try again.', false);
            }
        });
    }

    // Add Enter key support for MFA code input
    const mfaCodeInput = document.getElementById('mfa-code');
    if (mfaCodeInput) {
        mfaCodeInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleMfaVerification();
            }
        });
        
        // Only allow numbers
        mfaCodeInput.addEventListener('input', function(e) {
            e.target.value = e.target.value.replace(/[^0-9]/g, '');
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }

    if (backBtn) {
        backBtn.addEventListener('click', goBackToProjects);
    }

    if (passwordToggle) {
        passwordToggle.addEventListener('click', togglePasswordVisibility);
    }

    if (navPrev) {
        navPrev.addEventListener('click', goToPreviousProject);
    }

    if (navNext) {
        navNext.addEventListener('click', goToNextProject);
    }

    // Mobile menu toggle
    if (mobileMenuToggle) {
        mobileMenuToggle.addEventListener('click', toggleMobileMenu);
    }

    if (mobileNavClose) {
        mobileNavClose.addEventListener('click', closeMobileMenu);
    }

    // Close mobile menu when clicking outside
    if (mobileNav) {
        document.addEventListener('click', (e) => {
            if (mobileNav.classList.contains('active') && 
                !mobileNav.contains(e.target) && 
                !mobileMenuToggle.contains(e.target)) {
                closeMobileMenu();
            }
        });
    }

    // Mobile logout button
    if (btnLogoutMobile) {
        btnLogoutMobile.addEventListener('click', () => {
            closeMobileMenu();
            handleLogout();
        });
    }

    // Sync user name in mobile nav
    if (document.getElementById('user-name-mobile')) {
        const userName = document.getElementById('user-name');
        const userNameMobile = document.getElementById('user-name-mobile');
        if (userName && userNameMobile) {
            userNameMobile.textContent = userName.textContent;
        }
    }
}

function toggleMobileMenu() {
    const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
    const mobileNav = document.getElementById('mobile-nav');
    const overlay = document.querySelector('.mobile-nav-overlay') || createMobileOverlay();

    if (mobileNav && mobileMenuToggle) {
        mobileNav.classList.toggle('active');
        mobileMenuToggle.classList.toggle('active');
        overlay.classList.toggle('active');
        document.body.style.overflow = mobileNav.classList.contains('active') ? 'hidden' : '';
    }
}

function closeMobileMenu() {
    const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
    const mobileNav = document.getElementById('mobile-nav');
    const overlay = document.querySelector('.mobile-nav-overlay');

    if (mobileNav && mobileMenuToggle) {
        mobileNav.classList.remove('active');
        mobileMenuToggle.classList.remove('active');
        if (overlay) {
            overlay.classList.remove('active');
        }
        document.body.style.overflow = '';
    }
}

function createMobileOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'mobile-nav-overlay';
    overlay.addEventListener('click', closeMobileMenu);
    document.body.appendChild(overlay);
    return overlay;
}

function togglePasswordVisibility() {
    const passwordInput = document.getElementById('login-password');
    const toggle = document.getElementById('password-toggle');
    
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        toggle.classList.remove('fa-eye');
        toggle.classList.add('fa-eye-slash');
    } else {
        passwordInput.type = 'password';
        toggle.classList.remove('fa-eye-slash');
        toggle.classList.add('fa-eye');
    }
}

// ============================================
// AUTHENTICATION APIs
// ============================================
// Handles user login, MFA verification, password management,
// and session management for secure access

/* AUTHENTICATION */
let currentEmail = '';

// Show notification (same as signin.html)
function showNotification(message, isSuccess = true) {
    const notification = document.getElementById('notification');
    if (!notification) return;
    
    notification.textContent = message;
    notification.className = 'notification ' + (isSuccess ? 'success' : 'error');
    notification.classList.add('show');
    
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const emailError = document.getElementById('login-email-error');
    const passwordError = document.getElementById('login-password-error');
    const loginForm = document.getElementById('login-form');
    const mfaSection = document.getElementById('mfa-section');
    const submitBtn = document.getElementById('login-submit-btn');
    const mfaError = document.getElementById('mfa-error');
    
    // Reset error messages
    emailError.style.display = 'none';
    passwordError.style.display = 'none';
    if (mfaError) mfaError.style.display = 'none';
    
    // Basic validation
    let isValid = true;
    if (!validateEmail(email)) {
        emailError.style.display = 'block';
        isValid = false;
    }
    
    if (password.length < 8) {
        passwordError.style.display = 'block';
        isValid = false;
    }
    
    if (!isValid) return;
    
    currentEmail = email;
    
    // Disable submit button
    submitBtn.disabled = true;
    const originalText = submitBtn.querySelector('span').textContent;
    submitBtn.querySelector('span').textContent = 'Signing in...';
    
    // Call signin API (same as signin.html)
    fetch('/api/auth/signin', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showNotification('MFA code sent to your email', true);
            mfaSection.style.display = 'block';
            loginForm.style.display = 'none';
        } else {
            // Display error message in email field for invalid credentials
            const errorMessage = data.message || 'Invalid email or password. Please check your credentials and try again.';
            emailError.textContent = errorMessage;
            emailError.style.display = 'block';
            passwordError.textContent = errorMessage;
            passwordError.style.display = 'block';
            showNotification(errorMessage, false);
        }
    })
    .catch(error => {
        console.error('Error:', error);
        const errorMessage = 'An error occurred. Please try again.';
        emailError.textContent = errorMessage;
        emailError.style.display = 'block';
        showNotification(errorMessage, false);
    })
    .finally(() => {
        submitBtn.disabled = false;
        submitBtn.querySelector('span').textContent = originalText;
    });
}

function handleMfaVerification() {
    const mfaCodeInput = document.getElementById('mfa-code');
    const mfaError = document.getElementById('mfa-error');
    const verifyBtn = document.getElementById('verify-mfa-btn');
    const loginForm = document.getElementById('login-form');
    const mfaSection = document.getElementById('mfa-section');
    const code = mfaCodeInput.value.trim();
    
    mfaError.style.display = 'none';
    
    if (code.length !== 6 || !/^\d+$/.test(code)) {
        mfaError.textContent = 'Please enter a valid 6-digit code.';
        mfaError.style.display = 'block';
        return;
    }
    
    verifyBtn.disabled = true;
    const originalText = verifyBtn.textContent;
    verifyBtn.textContent = 'Verifying...';
    
    // Call verify-mfa API (same as signin.html)
    fetch('/api/auth/verify-mfa', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email: currentEmail, code })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            if (data.accessToken) {
                localStorage.setItem('authToken', data.accessToken);
            }
            
            // Store user session
            sessionStorage.setItem('userEmail', currentEmail);
            sessionStorage.setItem('isLoggedIn', 'true');
            sessionStorage.setItem('loginTime', new Date().getTime());
            
            // Update UI with user's full name
            let displayName = 'Client';
            if (data.user && data.user.firstName && data.user.lastName) {
                displayName = `${data.user.firstName} ${data.user.lastName}`;
                sessionStorage.setItem('userFirstName', data.user.firstName);
                sessionStorage.setItem('userLastName', data.user.lastName);
            } else if (data.user && data.user.firstName) {
                displayName = data.user.firstName;
                sessionStorage.setItem('userFirstName', data.user.firstName);
            }
            
            document.getElementById('user-name').textContent = displayName;
            const userNameMobile = document.getElementById('user-name-mobile');
            if (userNameMobile) {
                userNameMobile.textContent = displayName;
            }
            
            showNotification('Authentication successful! Redirecting...', true);
            
            // Handle cross-portal redirection (Admin vs Client)
            if (data.redirect && !data.redirect.includes('ClientPortal.html')) {
                setTimeout(() => {
                    window.location.href = data.redirect;
                }, 1500);
                return;
            }
            
            // Switch to dashboard (for normal client login on this page)
            setTimeout(() => {
                document.getElementById('login-section').classList.remove('active');
                document.getElementById('dashboard-section').classList.add('active');
                
                fetchDuoStats()

                // Reset forms
                if (loginForm) loginForm.reset();
                mfaCodeInput.value = '';
                if (loginForm) loginForm.style.display = 'block';
                if (mfaSection) mfaSection.style.display = 'none';
                
                // Reload billing card with new token
                initializeBillingCard();
                initializeGovernanceCard();
                initializeSupportCard();
                
                // Initialize chatbot after login
                if (typeof window.initChatbot === 'function') {
                    window.initChatbot();
                }
            }, 1500);
        } else {
            mfaError.textContent = data.message || 'Invalid code. Please try again.';
            mfaError.style.display = 'block';
        }
    })
    .catch(error => {
        console.error('Error:', error);
        mfaError.textContent = 'An error occurred. Please try again.';
        mfaError.style.display = 'block';
    })
    .finally(() => {
        verifyBtn.disabled = false;
        verifyBtn.textContent = originalText;
    });
}

function handleLogout() {
    if (!confirm('Are you sure you want to logout?')) {
        return;
    }

    // Clear any local session state used by the client portal
    sessionStorage.removeItem('userEmail');
    sessionStorage.removeItem('isLoggedIn');
    sessionStorage.removeItem('loginTime');

    // Clear JWT auth token issued by the backend
    localStorage.removeItem('authToken');

    // Reset UI (for safety if we stay on the page)
    const dashboardSection = document.getElementById('dashboard-section');
    const loginSection = document.getElementById('login-section');
    if (dashboardSection && loginSection) {
        dashboardSection.classList.remove('active');
        loginSection.classList.add('active');
        resetDashboard();
    }

    // Hide chatbot
    const chatWidget = document.getElementById('chatbot-widget');
    if (chatWidget) {
        chatWidget.style.display = 'none';
    }

    // Redirect to public home page so protected views aren't visible
    window.location.href = 'Home.html';
}

function setupSessionManagement() {
    const isLoggedIn = sessionStorage.getItem('isLoggedIn');
    const userEmail = sessionStorage.getItem('userEmail');
    const userFirstName = sessionStorage.getItem('userFirstName');
    const userLastName = sessionStorage.getItem('userLastName');
    const token = localStorage.getItem('authToken');
    
    if (isLoggedIn === 'true' && userEmail && token) {
        document.getElementById('login-section').classList.remove('active');
        document.getElementById('dashboard-section').classList.add('active');
        
        // Display user's full name if available, otherwise fallback to email prefix
        let displayName = 'Client';
        if (userFirstName && userLastName) {
            displayName = `${userFirstName} ${userLastName}`;
        } else if (userFirstName) {
            displayName = userFirstName;
        } else {
            displayName = userEmail.split('@')[0];
        }
        
        document.getElementById('user-name').textContent = displayName;
        const userNameMobile = document.getElementById('user-name-mobile');
        if (userNameMobile) {
            userNameMobile.textContent = displayName;
        }
        
        // Load billing card if user is logged in
        initializeBillingCard();
        
        // Initialize chatbot if user is logged in
        if (typeof window.initChatbot === 'function') {
            window.initChatbot();
        }
    }
}

function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function showError(message) {
    showNotification(message, false);
}


// ============================================
// SUNBIRD IDENTITY DASHBOARD API
// ============================================
// Integrates with Sunbird for enhanced identity analytics,
// user enrichment, and advanced security insights

// Fetch  Identity Protection data and update card preview
// Global variables for Sunbird dashboard
let isSunbirdDashboard = false;
let sunbirdDashboardData = null;

async function fetchIdentityAccessData() {
    try {
        const token = localStorage.getItem('authToken');
        const isLoggedIn = sessionStorage.getItem('isLoggedIn') === 'true';
        
        if (!token || !isLoggedIn) {
            console.log('[Identity Access] User not logged in. Skipping fetch.');
            return;
        }

        // Only fetch  Identity Protection data for Sunbird users
        if (!isSunbirdUser()) {
            console.log('[Identity Access] Non-Sunbird user. Skipping fetch.');
            return;
        }

        console.log('[Identity Access] Attempting to fetch Sunbird dashboard data...');
        
        // Try to fetch Sunbird enhanced dashboard first
        try {
            const sunbirdResponse = await fetch('/api/sunbird/identity-dashboard', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (sunbirdResponse.ok) {
                const sunbirdData = await sunbirdResponse.json();
                if (sunbirdData.success) {
                    console.log('[Identity Access] Sunbird dashboard loaded successfully');
                    isSunbirdDashboard = true;
                    sunbirdDashboardData = sunbirdData;
                    
                    // Map Sunbird data to existing global variables
                    microsoftUsersData = sunbirdData.users || [];
                    
                    // Build role map from enriched users
                    userRolesMap = {};
                    sunbirdData.users.forEach(user => {
                        if (user.roles && user.roles.length > 0) {
                            userRolesMap[user.id] = user.roles.map(r => r.name);
                        }
                    });
                    
                    // Build mock roles data for compatibility
                    microsoftRolesData = [];
                    sunbirdData.users.forEach(user => {
                        if (user.roles) {
                            user.roles.forEach(role => {
                                microsoftRolesData.push({
                                    id: role.id,
                                    principalId: user.id,
                                    roleName: role.name
                                });
                            });
                        }
                    });
                    
                    console.log('[Identity Access] Sunbird data mapped to globals');
                    
                    // Update card with Sunbird metrics
                    const identityProject = mockProjects.find(p => p.id === 2);
                    if (identityProject) {
                        identityProject.cardMetrics = [
                            { label: "Total Users", value: `: ${sunbirdData.summary.totalUsers}`, icon: "fas fa-users" },
                            { label: "Active 24h", value: `: ${sunbirdData.summary.activeUsers24h}`, icon: "fas fa-check-circle" },
                            { label: "Admin Roles", value: `: ${sunbirdData.summary.adminUsers}`, icon: "fas fa-crown" },
                            { label: "Security Score", value: `: ${sunbirdData.summary.securityScore}/100`, icon: "fas fa-shield-alt" }
                        ];
                        identityProject.cardFooter = `MFA: ${sunbirdData.summary.mfaEnabledPercentage}% | Risk: ${sunbirdData.summary.highRiskUsers} High | Security: ${sunbirdData.summary.securityScore}/100`;
                        identityProject.lastUpdate = new Date().toLocaleTimeString();
                        displayCurrentProject();
                    }
                    
                    // If Identity dashboard is currently open, refresh the table
                    const identityDashboard = document.getElementById('identity-monitoring-section');
                    if (identityDashboard && identityDashboard.style.display !== 'none') {
                        console.log('[Identity Access] Dashboard is open, refreshing table with fresh data');
                        setTimeout(() => {
                            populateIdentityTable();
                            initializeIdentityInsights();
                        }, 100);
                    }
                    
                    return; // Skip to end - Sunbird data fully loaded
                }
            }
        } catch (sunbirdError) {
            console.log('[Identity Access] Sunbird endpoint not available, falling back to standard API');
        }

        // Fallback: Load standard Microsoft data
        console.log('[Identity Access] Fetching standard Microsoft users and roles...');
        
        const [usersResponse, rolesResponse] = await Promise.all([
            fetch('/api/microsoft-users', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }),
            fetch('/api/microsoft-roles', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            })
        ]);

        if (!usersResponse.ok) {
            throw new Error(`Users API responded with status ${usersResponse.status}`);
        }

        const usersData = await usersResponse.json();
        
        if (!usersData.success || !usersData.users) {
            throw new Error(usersData.message || 'Invalid users response format');
        }

        microsoftUsersData = usersData.users || [];
        console.log(`[Identity Access] Loaded ${microsoftUsersData.length} users`);

        // Process roles data if available
        if (rolesResponse.ok) {
            const rolesData = await rolesResponse.json();
            if (rolesData.success && rolesData.roleAssignments) {
                microsoftRolesData = rolesData.roleAssignments || [];
                console.log(`[Identity Access] Loaded ${microsoftRolesData.length} role assignments`);
                
                // Build user roles map (userId -> array of role names)
                buildUserRolesMap();
            }
        } else {
            console.warn('[Identity Access] Could not fetch roles');
        }

        // Update the  Identity Protection project card with real data
        const identityProject = mockProjects.find(p => p.id === 2);
        if (identityProject) {
            const externalUsers = microsoftUsersData.filter(u => u.isExternal).length;
            const internalUsers = microsoftUsersData.length - externalUsers;
            const adminsCount = Object.keys(userRolesMap).length;
            
            identityProject.cardMetrics = [
                { label: "Total Users", value: `: ${microsoftUsersData.length}`, icon: "fas fa-users" },
                { label: "External", value: `: ${externalUsers}`, icon: "fas fa-user-secret" },
                { label: "Admin Roles", value: `: ${adminsCount}`, icon: "fas fa-crown" }
            ];
            identityProject.cardFooter = `Internal: ${internalUsers} | External: ${externalUsers} | Admins: ${adminsCount}`;
            identityProject.lastUpdate = new Date().toLocaleTimeString();
            
            // Refresh the display to show updated data
            displayCurrentProject();
            console.log('[Identity Access] Card updated with real user data');
        }

    } catch (error) {
        console.error('[Identity Access] Error fetching data:', error.message);
        // Keep placeholder data if API fails
    }
}

// Build a map of users to their assigned roles
function buildUserRolesMap() {
    userRolesMap = {};
    
    if (!microsoftRolesData || microsoftRolesData.length === 0) {
        return;
    }
    
    microsoftRolesData.forEach(assignment => {
        const principalId = assignment.principalId;
        const roleName = assignment.roleName || 'Unknown Role';
        
        if (!userRolesMap[principalId]) {
            userRolesMap[principalId] = [];
        }
        
        if (!userRolesMap[principalId].includes(roleName)) {
            userRolesMap[principalId].push(roleName);
        }
    });
    
    console.log(`[User Roles Map] Built map for ${Object.keys(userRolesMap).length} users`);
}

// ============================================
// CISCO DUO INTEGRATION API
// ============================================
// Fetches Duo license information and usage statistics
// for multi-factor authentication tracking

// Updated: fetchDuoStats - Now with better error handling, loading states, and retries
async function fetchDuoStats(retryCount = 0) {
    const token = localStorage.getItem('authToken');
    const isLoggedIn = sessionStorage.getItem('isLoggedIn') === 'true';
    
    // Only fetch if user is logged in and has a token
    if (!token || !isLoggedIn) {
        console.log('[Duo Sync] User not logged in. Skipping fetch.');
        return;
    }

    const duoProject = mockProjects.find(p => p.name === "Cisco Duo Licenses");
    if (!duoProject) {
        console.error('[Duo Sync] Duo project not found in mockProjects.');
        return;
    }

    // Set loading state
    duoProject.status = "Loading...";
    duoProject.cardMetrics = [
        { label: "Total Licences", value: ": Loading...", icon: "fas fa-id-card" },
        { label: "Active Usage", value: ": Loading...", icon: "fas fa-user-check" },
        { label: "Remaining Licences", value: ": Loading...", icon: "fas fa-user-plus" }
    ];
    duoProject.cardFooter = "Fetching data...";
    displayCurrentProject(); // Re-render to show loading

    try {
        console.log('[Duo Sync] Fetching data from /api/duo-stats...');
        const response = await fetch('/api/duo-stats', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            throw new Error(`API responded with status ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        console.log('[Duo Sync] Received data:', data);

        // Validate data structure
        if (!data || typeof data.used_licenses !== 'number' || typeof data.total_licenses !== 'number') {
            throw new Error('Invalid data structure from API.');
        }

        // Update the project with real data
        if (data.total_licenses === 0) {
            console.log('[Duo Sync] No licenses found. Removing Duo project from list.');
            const index = mockProjects.findIndex(p => p.id === duoProject.id);
            if (index > -1) {
                mockProjects.splice(index, 1);
                initializeProjectsList(); // Re-initialize to update counter and display
                displayCurrentProject(); // Refresh the display
                return;
            }
        }

        duoProject.status = "Active";
        duoProject.cardMetrics = [
            { label: "Total Licences", value: `: ${data.total_licenses}`, icon: "fas fa-id-card" },
            { label: "Active Usage", value: `: ${data.used_licenses}`, icon: "fas fa-user-check" },
            { label: "Remaining Licences", value: `: ${data.remaining_licenses}`, icon: "fas fa-user-plus" }
        ];
        duoProject.cardFooter = `Tier: ${data.edition || 'Unknown'} | Last Sync: ${data.last_sync || 'N/A'}`;
        duoProject.lastUpdate = `Synced: ${data.last_sync || 'Unknown'}`;

        // Re-render the UI with updated data
        displayCurrentProject();
        console.log('[Duo Sync] UI updated with real data.');

    } catch (error) {
        console.error('[Duo Sync] Error fetching Duo stats:', error.message);

        // If error is 404 or unauthorized, assume no licenses and remove from list
        if (error.message.includes('404') || error.message.includes('401')) {
            console.log('[Duo Sync] No access to Duo. Removing from project list.');
            const index = mockProjects.findIndex(p => p.id === duoProject.id);
            if (index > -1) {
                mockProjects.splice(index, 1);
                initializeProjectsList();
                displayCurrentProject();
                return;
            }
        }

        // Fallback: Set error state
        duoProject.status = "Error";
        duoProject.cardMetrics = [
            { label: "Total Licences", value: ": Error", icon: "fas fa-id-card" },
            { label: "Active Usage", value: ": Error", icon: "fas fa-user-check" },
            { label: "Remaining Licences", value: ": Error", icon: "fas fa-user-plus" }
        ];
        duoProject.cardFooter = "Error loading Duo stats. Please try again later.";
        displayCurrentProject();

        // Optional: Retry up to 2 times with exponential backoff
        if (retryCount < 2) {
            const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
            console.log(`[Duo Sync] Retrying in ${delay}ms... (attempt ${retryCount + 1})`);
            setTimeout(() => fetchDuoStats(retryCount + 1), delay);
        }
    }
}

/*  Identity Protection DASHBOARD */
function generateIdentityDashboardHTML() {
    // Calculate stats
    const totalUsers = microsoftUsersData.length;
    const internalUsers = microsoftUsersData.filter(u => !u.isExternal).length;
    const externalUsers = microsoftUsersData.filter(u => u.isExternal).length;
    const activeUsers = totalUsers; // All users are active
    
    return `
        <div class="identity-dashboard" id="identity-monitoring-section">
            <!-- Dashboard Header with Back Button and Title -->
            <div class="identity-dashboard-header">
                <div class="identity-header-left">
                    <button id="btn-back-identity" class="btn-back-identity">
                        <i class="fas fa-arrow-left"></i> Back
                    </button>
                    <h2 class="identity-dashboard-title"> Identity Protection</h2>
                    <div class="powered-by-badge">
                        <img src="https://static.vecteezy.com/system/resources/thumbnails/018/911/406/small_2x/microsoft-logo-editorial-free-vector.jpg" alt="Microsoft" class="powered-by-logo">
                        <span>Powered by Microsoft Graph</span>
                    </div>
                </div>
            </div>

            <!-- Overview Stats (Key Metrics) -->
            <div class="identity-stats-cards">
                <div class="identity-stat-card">
                    <div class="stat-card-icon" style="background: rgba(0, 110, 255, 0.2); color: rgba(0, 110, 255, 0.9);">
                        <i class="fas fa-users"></i>
                    </div>
                    <div class="stat-card-content">
                        <div class="stat-card-label">Total Users</div>
                        <div class="stat-card-value">${totalUsers}</div>
                    </div>
                </div>

                <div class="identity-stat-card">
                    <div class="stat-card-icon" style="background: rgba(34, 197, 94, 0.2); color: rgba(34, 197, 94, 0.9);">
                        <i class="fas fa-user-tie"></i>
                    </div>
                    <div class="stat-card-content">
                        <div class="stat-card-label">Internal Users</div>
                        <div class="stat-card-value">${internalUsers}</div>
                    </div>
                </div>

                <div class="identity-stat-card">
                    <div class="stat-card-icon" style="background: rgba(249, 115, 22, 0.2); color: rgba(249, 115, 22, 0.9);">
                        <i class="fas fa-user-secret"></i>
                    </div>
                    <div class="stat-card-content">
                        <div class="stat-card-label">External Users</div>
                        <div class="stat-card-value">${externalUsers}</div>
                    </div>
                </div>

                <div class="identity-stat-card">
                    <div class="stat-card-icon" style="background: rgba(132, 204, 22, 0.2); color: rgba(132, 204, 22, 0.9);">
                        <i class="fas fa-check-circle"></i>
                    </div>
                    <div class="stat-card-content">
                        <div class="stat-card-label">Active Users</div>
                        <div class="stat-card-value">${activeUsers}</div>
                    </div>
                </div>
            </div>

            <!-- Search Bar and Filters -->
            <div class="identity-controls-section">
                <input type="text" id="user-search-input" class="identity-search-bar" placeholder="Search by name or email...">
                
                <div class="identity-filters">
                    <label class="filter-checkbox">
                        <input type="checkbox" id="filter-internal" data-filter="internal">
                        <span>Internal Users</span>
                    </label>
                    <label class="filter-checkbox">
                        <input type="checkbox" id="filter-external" data-filter="external">
                        <span>External Users</span>
                    </label>
                    <label class="filter-checkbox">
                        <input type="checkbox" id="filter-admins" data-filter="admins">
                        <span>👑 Admins</span>
                    </label>
                    <label class="filter-checkbox">
                        <input type="checkbox" id="filter-missing-data" data-filter="missing-data">
                        <span>Missing Data</span>
                    </label>
                    <button id="btn-clear-filters" class="btn-clear-filters">Clear Filters</button>
                </div>
            </div>

            <!-- Users Table (Full Width) -->
            <div class="identity-users-table-container">
                <table class="identity-users-table" id="users-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Email</th>
                            <th>Job Title</th>
                            <th>Roles</th>
                            <th>Type</th>
                            <th>MFA</th>
                            <th>Auth Methods</th>
                            <th>Risk</th>
                            <th>Status</th>
                            <th>Last Sign-In</th>
                            <th>Location</th>
                            <th>Device</th>
                            <th>Phone</th>
                        </tr>
                    </thead>
                    <tbody id="users-table-body">
                        <!-- Users will be populated here -->
                    </tbody>
                </table>
            </div>

            <!-- Charts & Insights Section Below Table -->
            <div class="identity-insights-section">
                <!-- Sunbird-Specific Analytics Components (Only visible for Sunbird) -->
                <!-- Row 0: Summary Cards (Security, Risk, Activity) -->
                <div class="sunbird-summary-cards-row" id="sunbird-summary-cards" style="display: none;">
                    <div class="sunbird-summary-card">
                        <div class="summary-card-icon" style="background: rgba(0, 110, 255, 0.2); color: rgba(0, 110, 255, 0.9);">
                            <i class="fas fa-shield-alt"></i>
                        </div>
                        <div class="summary-card-content">
                            <div class="summary-card-label">Security Score</div>
                            <div class="summary-card-value" id="sunbird-security-score">0</div>
                            <div class="summary-card-subtext">/100</div>
                        </div>
                    </div>

                    <div class="sunbird-summary-card">
                        <div class="summary-card-icon" style="background: rgba(34, 197, 94, 0.2); color: rgba(34, 197, 94, 0.9);">
                            <i class="fas fa-user-check"></i>
                        </div>
                        <div class="summary-card-content">
                            <div class="summary-card-label">Active Users (24h)</div>
                            <div class="summary-card-value" id="sunbird-active-users">0</div>
                        </div>
                    </div>

                    <div class="sunbird-summary-card">
                        <div class="summary-card-icon" style="background: rgba(220, 53, 69, 0.2); color: rgba(220, 53, 69, 0.9);">
                            <i class="fas fa-exclamation-circle"></i>
                        </div>
                        <div class="summary-card-content">
                            <div class="summary-card-label">High Risk Users</div>
                            <div class="summary-card-value" id="sunbird-high-risk">0</div>
                        </div>
                    </div>

                    <div class="sunbird-summary-card">
                        <div class="summary-card-icon" style="background: rgba(108, 92, 231, 0.2); color: rgba(108, 92, 231, 0.9);">
                            <i class="fas fa-user-clock"></i>
                        </div>
                        <div class="summary-card-content">
                            <div class="summary-card-label">Inactive (30+ days)</div>
                            <div class="summary-card-value" id="sunbird-inactive-users">0</div>
                        </div>
                    </div>

                    <div class="sunbird-summary-card">
                        <div class="summary-card-icon" style="background: rgba(220, 53, 69, 0.2); color: rgba(220, 53, 69, 0.9);">
                            <i class="fas fa-lock"></i>
                        </div>
                        <div class="summary-card-content">
                            <div class="summary-card-label">🚨 Privileged Without MFA</div>
                            <div class="summary-card-value" id="sunbird-privileged-without-mfa">0</div>
                        </div>
                    </div>

                    <div class="sunbird-summary-card">
                        <div class="summary-card-icon" style="background: rgba(249, 115, 22, 0.2); color: rgba(249, 115, 22, 0.9);">
                            <i class="fas fa-fire"></i>
                        </div>
                        <div class="summary-card-content">
                            <div class="summary-card-label">Identity Risk Score</div>
                            <div class="summary-card-value" id="sunbird-identity-risk-score">0</div>
                            <div class="summary-card-subtext">/100</div>
                        </div>
                    </div>
                </div>

                <!-- Row 1: System Health Radar & Risk Distribution Pie -->
                <div class="sunbird-analytics-row-1" id="sunbird-analytics-row-1" style="display: none;">
                    <div class="sunbird-analytics-card sunbird-analytics-card-wide">
                        <h4 class="chart-card-title">System Health Radar</h4>
                        <div class="chart-wrapper">
                            <canvas id="systemHealthRadar" width="400" height="300"></canvas>
                        </div>
                    </div>

                    <div class="sunbird-analytics-card">
                        <h4 class="chart-card-title">Risk Distribution</h4>
                        <div class="chart-wrapper">
                            <canvas id="riskDistributionPie" width="300" height="250"></canvas>
                        </div>
                    </div>
                </div>

                <!-- Row 2: Security & Identity Analytics -->
                <div class="sunbird-analytics-row-2" id="sunbird-analytics-row-2" style="display: none;">
                    <div class="sunbird-analytics-card">
                        <h4 class="chart-card-title">🔐 Authentication Strength</h4>
                        <div class="chart-wrapper">
                            <canvas id="authenticationStrengthChart" width="300" height="250"></canvas>
                        </div>
                    </div>

                    <div class="sunbird-analytics-card">
                        <h4 class="chart-card-title">📱 Device Trust Analysis</h4>
                        <div class="chart-wrapper">
                            <canvas id="deviceTrustChart" width="300" height="250"></canvas>
                        </div>
                    </div>

                    <div class="sunbird-analytics-card">
                        <h4 class="chart-card-title">👥 Role Distribution (Top 8)</h4>
                        <div class="chart-wrapper">
                            <canvas id="roleDistributionChart" width="400" height="250"></canvas>
                        </div>
                    </div>
                </div>

                <!-- Row 3: User Health & Activity -->
                <div class="sunbird-analytics-row-3" id="sunbird-analytics-row-3" style="display: none;">
                    <div class="sunbird-analytics-card sunbird-analytics-card-wide">
                        <h4 class="chart-card-title">⏱️ Inactive Users Breakdown (Days Since Last Sign-In)</h4>
                        <div class="chart-wrapper">
                            <canvas id="inactiveBreakdownChart" width="500" height="150"></canvas>
                        </div>
                    </div>

                    <div class="sunbird-analytics-card">
                        <h4 class="chart-card-title">🧼 Identity Hygiene Score</h4>
                        <div class="insights-content" id="identity-hygiene-breakdown">
                            <!-- Populated dynamically -->
                        </div>
                    </div>
                </div>

                <!-- Row 2: Sign-In Insights -->
                <div class="sunbird-insights-row" id="sunbird-insights-row" style="display: none;">
                    <div class="sunbird-insights-card">
                        <h4 class="chart-card-title">📍 Top Sign-In Locations</h4>
                        <div class="insights-content">
                            <table class="insights-table" id="top-locations-table">
                                <thead>
                                    <tr>
                                        <th>Location</th>
                                        <th>Sign-Ins</th>
                                    </tr>
                                </thead>
                                <tbody id="top-locations-body">
                                    <!-- Populated dynamically -->
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div class="sunbird-insights-card">
                        <h4 class="chart-card-title">📈 Sign-In Activity Timeline</h4>
                        <div class="insights-content">
                            <div id="timeline-container" class="timeline-container">
                                <!-- Populated dynamically -->
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Row 1: Charts -->
                <div class="identity-charts-grid">
                    <!-- Job Title Distribution -->
                    <div class="identity-chart-card">
                        <h4 class="chart-card-title">Job Title Distribution</h4>
                        <div class="chart-wrapper">
                            <canvas id="jobTitleChart" width="300" height="250"></canvas>
                        </div>
                    </div>

                    <!-- Contact Completeness -->
                    <div class="identity-chart-card">
                        <h4 class="chart-card-title">Contact Completeness</h4>
                        <div class="chart-wrapper">
                            <canvas id="contactChart" width="300" height="250"></canvas>
                        </div>
                    </div>

                    <!-- User Type Distribution -->
                    <div class="identity-chart-card">
                        <h4 class="chart-card-title">User Type Distribution</h4>
                        <div class="chart-wrapper">
                            <canvas id="userTypeChart" width="300" height="250"></canvas>
                        </div>
                    </div>

                    <!-- Active Status -->
                    <div class="identity-chart-card">
                        <h4 class="chart-card-title">Active Status</h4>
                        <div class="chart-wrapper">
                            <canvas id="activeStatusChart" width="300" height="250"></canvas>
                        </div>
                    </div>
                </div>

                <!-- Row 2: Health Score & Missing Data -->
                <div class="identity-health-section">
                    <!-- User Health Score -->
                    <div class="identity-health-card">
                        <h4 class="chart-card-title">User Data Health Score</h4>
                        <div class="health-score-display">
                            <div class="health-score-gauge">
                                <div class="health-score-value" id="healthScoreValue">0</div>
                                <div class="health-score-label">/ 100</div>
                            </div>
                            <div class="health-score-bar">
                                <div class="health-score-progress" id="healthScoreProgress" style="width: 0%"></div>
                            </div>
                        </div>
                    </div>

                    <!-- Missing Data Breakdown -->
                    <div class="identity-health-card">
                        <h4 class="chart-card-title">Missing Data Breakdown</h4>
                        <div class="missing-data-list">
                            <div class="missing-data-item">
                                <span class="missing-label">Missing Job Titles</span>
                                <span class="missing-count" id="missingJobTitles">0</span>
                            </div>
                            <div class="missing-data-item">
                                <span class="missing-label">Missing Phone Numbers</span>
                                <span class="missing-count" id="missingPhones">0</span>
                            </div>
                            <div class="missing-data-item">
                                <span class="missing-label">Complete Profiles</span>
                                <span class="missing-count" id="completeProfiles">0</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Row 3: Admin Users & Risk Indicator -->
                <div class="identity-admin-section">
                    <!-- Admin Users List -->
                    <div class="identity-admin-card">
                        <h4 class="chart-card-title">👑 Admin Users List</h4>
                        <div class="admin-users-container">
                            <div id="admin-users-list">
                                <p style="text-align: center; color: #999;">Loading admin users...</p>
                            </div>
                        </div>
                    </div>

                    <!-- Risk Indicator -->
                    <div class="identity-risk-card">
                        <h4 class="chart-card-title">🚨 Risk Indicator</h4>
                        <div class="risk-indicator-container">
                            <div id="risk-summary">
                                <p style="text-align: center; color: #999;">Analyzing risks...</p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Row 4: Security Insights -->
                <div class="identity-security-section">
                    <!-- Security Insights -->
                    <div class="identity-insights-card">
                        <h4 class="chart-card-title">⚠️ Security Insights</h4>
                        <div id="security-insights-list" class="security-insights-container">
                            <p style="text-align: center; color: #999;">Loading security insights...</p>
                        </div>
                    </div>
                </div>

                <!-- Row 5: Detailed Risk & Security Analysis -->
                <div class="identity-risk-panel">
                    <h4 class="chart-card-title">⚠️ Detailed Risk & Security Analysis</h4>
                    <div class="risk-items">
                        <div id="riskCritical" class="risk-item risk-critical" style="display:none;">
                            <i class="fas fa-exclamation-circle"></i>
                            <span id="riskCriticalText">Critical: Master Admin detected</span>
                        </div>
                        <div class="risk-item risk-medium">
                            <i class="fas fa-exclamation-triangle"></i>
                            <span id="riskMediumText">Medium Risk: Users without job titles and phone numbers</span>
                        </div>
                        <div class="risk-item risk-low">
                            <i class="fas fa-info-circle"></i>
                            <span>Low Risk: Shared mailboxes detected in user list</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function populateIdentityTable() {
    const tableBody = document.getElementById('users-table-body');
    const table = document.getElementById('users-table');
    
    if (!tableBody) {
        console.error('[Identity Table] Table body not found');
        return;
    }

    console.log(`[Identity Table] Populating table with ${microsoftUsersData.length} users (Sunbird: ${isSunbirdDashboard})`);
    console.log('[Identity Table] Sample user data:', microsoftUsersData[0]);

    tableBody.innerHTML = '';

    // Update table headers based on dashboard type
    if (isSunbirdDashboard && table) {
        const thead = table.querySelector('thead tr');
        if (thead) {
            thead.innerHTML = `
                <th>Name</th>
                <th>Email</th>
                <th>Job Title</th>
                <th>Roles</th>
                <th>Type</th>
                <th>MFA</th>
                <th>Auth Methods</th>
                <th>Risk</th>
                <th>Status</th>
                <th>Last Sign-In</th>
                <th>Location</th>
                <th>Device</th>
                <th>Phone</th>
            `;
        }
    }

    if (microsoftUsersData.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="${isSunbirdDashboard ? 13 : 7}" style="text-align: center; padding: 20px;">No users found</td></tr>`;
        return;
    }

    microsoftUsersData.forEach((user, index) => {
        const row = document.createElement('tr');

        if (isSunbirdDashboard) {
            // Render Sunbird enhanced columns
            const jobTitle = (user.jobTitle && user.jobTitle !== 'No Title' && user.jobTitle.trim() !== '') ? user.jobTitle : '—';
            const phone = (user.mobilePhone && user.mobilePhone !== 'N/A' && user.mobilePhone?.trim() !== '') ? user.mobilePhone : '—';
            
            // Fix: Handle roles array - could be array of strings or objects with name property
            const roles = user.roles || [];
            const rolesDisplay = roles.length > 0 
                ? roles.map(role => {
                    const roleName = typeof role === 'string' ? role : (role?.name || 'Unknown Role');
                    return `<span class="role-badge">${roleName}</span>`;
                }).join(' ')
                : '—';

            // MFA Status: Show both enabled status and method count
            const authMethodCount = user.authMethodCount || 0;
            const mfaStatus = user.mfaEnabled ? `✅ Yes (${authMethodCount})` : `❌ No (${authMethodCount})`;
            
            const riskLevel = user.riskLevel || 'SAFE';
            const riskBadgeClass = riskLevel === 'HIGH' ? 'risk-badge-high' : 
                                  riskLevel === 'MEDIUM' ? 'risk-badge-medium' : 
                                  'risk-badge-safe';
            const riskIcon = riskLevel === 'HIGH' ? '🔴' : 
                           riskLevel === 'MEDIUM' ? '🟡' : 
                           '🟢';

            const lastSignInText = (user.lastSignIn && user.lastSignIn.dateTime) ? 
                getTimeAgoString(new Date(user.lastSignIn.dateTime)) : 'Never';

            // Location: Already formatted in backend as "City, Country"
            const locationDisplay = (user.lastSignIn && user.lastSignIn.location && user.lastSignIn.location !== 'No sign-in') ? user.lastSignIn.location : 'No sign-in';
            
            // Device: Show device name  
            let deviceDisplay = 'Unknown';
            if (user.lastSignIn && user.lastSignIn.device) {
                deviceDisplay = user.lastSignIn.device.toLowerCase().includes('unknown') ? 'Unknown' : user.lastSignIn.device;
            }

            // Log first row for debugging
            if (index === 0) {
                console.log('[Identity Table] Row 0 data:', {
                    jobTitle,
                    roles: rolesDisplay,
                    mfaStatus,
                    riskLevel,
                    lastSignInText,
                    location: locationDisplay,
                    device: deviceDisplay
                });
            }

            row.innerHTML = `
                <td>${user.displayName || 'Unknown'}</td>
                <td>${user.mail || user.userPrincipalName || 'N/A'}</td>
                <td>${jobTitle}</td>
                <td class="roles-cell">${rolesDisplay}</td>
                <td>
                    <span class="user-type-badge ${user.isExternal ? 'external' : 'internal'}">
                        ${user.isExternal ? 'External' : 'Internal'}
                    </span>
                </td>
                <td>${mfaStatus}</td>
                <td>${authMethodCount}</td>
                <td><span class="${riskBadgeClass}">${riskIcon} ${riskLevel}</span></td>
                <td>
                    <span class="user-status-badge active">Active</span>
                </td>
                <td>${lastSignInText}</td>
                <td><span class="location-cell" title="${locationDisplay}">${locationDisplay}</span></td>
                <td><span class="device-cell" title="${deviceDisplay}">${deviceDisplay}</span></td>
                <td>${phone}</td>
            `;
        } else {
            // Render standard columns (original)
            const jobTitle = (user.jobTitle && user.jobTitle !== 'No Title') ? user.jobTitle : '<span style="color: #999;">—</span>';
            const phone = (user.mobilePhone && user.mobilePhone !== 'N/A') ? user.mobilePhone : '<span style="color: #999;">—</span>';
            
            const roles = userRolesMap[user.id] || [];
            const rolesDisplay = roles.length > 0 
                ? roles.map(role => `<span class="role-badge">${role}</span>`).join('')
                : '<span style="color: #999;">—</span>';

            row.innerHTML = `
                <td>${user.displayName || 'N/A'}</td>
                <td>${user.mail || user.userPrincipalName || 'N/A'}</td>
                <td>${jobTitle}</td>
                <td>${phone}</td>
                <td class="roles-cell">${rolesDisplay}</td>
                <td>
                    <span class="user-type-badge ${user.isExternal ? 'external' : 'internal'}">
                        ${user.isExternal ? 'External' : 'Internal'}
                    </span>
                </td>
                <td>
                    <span class="user-status-badge active">Active</span>
                </td>
            `;
        }

        tableBody.appendChild(row);

        if (index === 0) {
            console.log('[Identity Table] First user added:', user.displayName);
        }
    });
    console.log(`[Identity Table] Total rows added: ${microsoftUsersData.length}`);
}



function initializeProjectsList() {
    const projectsGrid = document.getElementById('projects-grid');
    projectsGrid.innerHTML = '';
    
    // Filter projects based on user access level
    const filteredProjects = getFilteredProjects();
    
    // Update the global mockProjects reference for this session
    // (This ensures all other functions work with filtered projects)
    const originalProjects = mockProjects.slice();
    mockProjects.length = 0;
    mockProjects.push(...filteredProjects);
    
    document.getElementById('project-total').textContent = mockProjects.length;
    currentProjectIndex = 0;
    selectedProjectId = null;
    previewLockedByClick = false;
    
    displayCurrentProject();
    fetchDuoStats();
    fetchIdentityAccessData(); // Fetch Microsoft Graph users for the card preview
    fetchApplicationsData(); // Fetch Applications data for the card preview
}

function displayCurrentProject() {
    if (mockProjects.length === 0) return;
    
    const projectsGrid = document.getElementById('projects-grid');
    projectsGrid.innerHTML = '';
    
    // Display 3 projects at a time
    const visibleProjects = mockProjects.slice(currentProjectIndex, currentProjectIndex + 3);
    
    visibleProjects.forEach((project, index) => {
        const projectCard = createProjectCard(project);
        
        if (!project.noDashboard) {
            projectCard.addEventListener('mouseenter', () => {
                if (!previewLockedByClick) {
                    showProjectPreview(project);
                }
            });
            
            projectCard.addEventListener('mouseleave', () => {
                if (!previewLockedByClick) {
                    hideProjectPreview();
                }
            });
            
            projectCard.addEventListener('click', () => {
                const isSelected = selectedProjectId === project.id && previewLockedByClick;
                
                const allCards = document.querySelectorAll('.project-card');
                allCards.forEach(card => card.classList.remove('glow-selected'));
                
                if (isSelected) {
                    // If already selected, close it
                    previewLockedByClick = false;
                    selectedProjectId = null;
                    hideProjectPreview();
                } else {
                    // Otherwise, open it
                    previewLockedByClick = true;
                    selectedProjectId = project.id;
                    projectCard.classList.add('glow-selected');
                    showProjectPreview(project);
                }
            });
        }
        
        projectsGrid.appendChild(projectCard);
    });
    
    document.getElementById('project-current').textContent = currentProjectIndex + 1;
    
    updateNavigationButtons();
}

function goToPreviousProject() {
    if (currentProjectIndex > 0) {
        currentProjectIndex--;
        previewLockedByClick = false;
        selectedProjectId = null;
        displayCurrentProject();
    }
}

function goToNextProject() {
    if (currentProjectIndex < mockProjects.length - 1) {
        currentProjectIndex++;
        previewLockedByClick = false;
        selectedProjectId = null;
        displayCurrentProject();
    }
}

function updateNavigationButtons() {
    const navPrev = document.getElementById('nav-prev');
    const navNext = document.getElementById('nav-next');
    
    navPrev.disabled = currentProjectIndex === 0;
    navNext.disabled = currentProjectIndex >= mockProjects.length - 1;
}

function showProjectPreview(project) {
    let previewSection = document.getElementById('project-preview-section');
    previewSection.classList.add('visible');
    
    previewSection.innerHTML = `
        <div class="preview-container" id="preview-container">
            <div class="preview-header">
                <h3><i class="fas fa-info-circle"></i> ${project.name}</h3>
                <p class="preview-subtitle">${project.type}</p>
            </div>
            
            <div class="preview-stats-grid">
                <div class="preview-stat-item">
                    <div class="preview-stat-icon critical">
                        <i class="fas fa-exclamation-circle"></i>
                    </div>
                    <div class="preview-stat-info">
                        <span class="preview-stat-label">Critical Risks</span>
                        <span class="preview-stat-value">${project.risks.critical}</span>
                    </div>
                </div>
                <div class="preview-stat-item">
                    <div class="preview-stat-icon success">
                        <i class="fas fa-shield-alt"></i>
                    </div>
                    <div class="preview-stat-info">
                        <span class="preview-stat-label">Security Score</span>
                        <span class="preview-stat-value">${project.securityScore}%</span>
                    </div>
                </div>
                <div class="preview-stat-item">
                    <div class="preview-stat-icon info">
                        <i class="fas fa-server"></i>
                    </div>
                    <div class="preview-stat-info">
                        <span class="preview-stat-label">System Uptime</span>
                        <span class="preview-stat-value">${project.uptime}%</span>
                    </div>
                </div>
                <div class="preview-stat-item">
                    <div class="preview-stat-icon warning">
                        <i class="fas fa-clock"></i>
                    </div>
                    <div class="preview-stat-info">
                        <span class="preview-stat-label">Last Update</span>
                        <span class="preview-stat-value">${project.lastUpdate}</span>
                    </div>
                </div>
            </div>
            
            <div class="preview-risks-detail">
                <h4><i class="fas fa-chart-bar"></i> Risk Breakdown</h4>
                <div class="risk-breakdown">
                    <div class="risk-item critical">
                        <span class="risk-label">Critical</span>
                        <span class="risk-value">${project.risks.critical}</span>
                    </div>
                    <div class="risk-item high">
                        <span class="risk-label">High</span>
                        <span class="risk-value">${project.risks.high}</span>
                    </div>
                    <div class="risk-item medium">
                        <span class="risk-label">Medium</span>
                        <span class="risk-value">${project.risks.medium}</span>
                    </div>
                </div>
            </div>
            
            <div class="glow-wrap">
                <div class="glowing-border-layer"></div>
                <button class="btn-view-full-dashboard" onclick="viewProjectDashboard(mockProjects.find(p => p.id === ${project.id}))">
                    <i class="fas fa-arrow-right"></i> View Full Dashboard
                </button>
            </div>
        </div>
    `;
}

function hideProjectPreview() {
    const previewSection = document.getElementById('project-preview-section');
    if (previewSection) {
        previewSection.classList.remove('visible');
    }
}

function createProjectCard(project) {
    const card = document.createElement('div');
    card.className = 'project-card' + (project.noDashboard ? ' no-interaction' : '');
    card.setAttribute('data-project-id', project.id);
    
    const risksCount = project.risks.critical + project.risks.high + project.risks.medium;
    
    // Build metrics section from cardMetrics array
    let metricsHTML = '';
    if (project.cardMetrics && project.cardMetrics.length > 0) {
        metricsHTML = project.cardMetrics.map(metric => `
            <div class="project-info-item">
                <i class="${metric.icon}"></i>
                <span>${metric.label} ${metric.value}</span>
            </div>
        `).join('');
    }
    
    card.innerHTML = `
        <div class="project-card-header">
            <div class="project-icon">
                ${project.image ? `<img src="${project.image}" alt="${project.name}">` : `<i class="${project.icon}"></i>`}
            </div>
            <div class="project-title">
                <h3>${project.name}</h3>
                <p class="project-type">${project.type}</p>
            </div>
            <span class="project-status-badge status-${project.status.toLowerCase()}">
                ${project.status}
            </span>

        </div>
        <div class="project-info">
            ${metricsHTML}
        </div>
        <div class="project-risks">
            <span>${project.cardFooter || 'Risks: ' + risksCount}</span>
            <div class="risk-indicator">
                <div class="risk-dot ${project.risks.critical > 0 ? 'critical' : project.risks.high > 0 ? 'high' : (project.risks.medium > 0 ? 'medium' : 'success')}" 
                     title="${project.risks.critical > 0 ? project.risks.critical + ' Critical' : project.risks.high > 0 ? project.risks.high + ' High' : (project.risks.medium > 0 ? project.risks.medium + ' Medium' : 'No Risks detected')}"></div>
            </div>
        </div>
    `;
    
    return card;
}

function viewProjectDashboard(project) {
    currentProject = project;
    
    document.getElementById('projects-view').style.display = 'none';
    document.getElementById('dashboard-view').style.display = 'none';
    
    // If this is the  Identity Protection card, fetch API data
    if (project.isIdentityCard) {
        document.getElementById('dashboard-view').style.display = 'block';
        fetchIdentityData(project);
    } 
    // If this is the Devices card, fetch device data
    else if (project.isDevicesCard) {
        document.getElementById('devices-view').style.display = 'block';
        fetchDevicesData(project);
    }
    // If this is the Threat & Activity card, fetch security data
    else if (project.isSecurityCard) {
        document.getElementById('security-events-view').style.display = 'block';
        fetchSecurityEventsData(project);
    }
    // If this is the Email Security card, fetch email security data
    else if (project.isEmailSecurityCard) {
        if (!document.getElementById('email-security-view')) {
            console.warn('[Email Security] View element not found');
            return;
        }
        document.getElementById('email-security-view').style.display = 'block';
        fetchEmailSecurityData(project);
    }
    // If this is the Backup and Recovery card, fetch backup recovery data
    else if (project.isBackupRecoveryCard) {
        if (!document.getElementById('backup-recovery-view')) {
            console.warn('[Backup Recovery] View element not found');
            return;
        }
        document.getElementById('backup-recovery-view').style.display = 'block';
        fetchBackupRecoveryData(project);
    }
    // If this is the Applications card, fetch applications data
    else if (project.isApplicationsCard) {
        document.getElementById('dashboard-view').style.display = 'block';
        openApplicationsDashboard();
    }
    else {
        document.getElementById('dashboard-view').style.display = 'block';
        updateDashboardData(project);
        initializeCharts(project);
        initializeTabs();
    }
}

// ============================================
//  Identity Protection DATA API
// ============================================
// Fetches detailed Microsoft user and role data
// for the  Identity Protection dashboard tab

// Fetch  Identity Protection data from API
async function fetchIdentityData(project) {
    try {
        console.log('[Identity] Fetching Microsoft users...');
        const authToken = localStorage.getItem('authToken');
        
        const response = await fetch('/api/microsoft-users', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (!response.ok || !data.success) {
            throw new Error(data.message || 'Failed to fetch users');
        }
        
        microsoftUsersData = data.users || [];
        
        // Update project with API data
        const externalUsers = microsoftUsersData.filter(u => u.isExternal).length;
        project.cardMetrics = [
            { label: "Total Users", value: `: ${microsoftUsersData.length}`, icon: "fas fa-users" },
            { label: "External", value: `: ${externalUsers}`, icon: "fas fa-user-secret" }
        ];
        project.lastUpdate = new Date().toLocaleTimeString();
        project.cardFooter = `Total: ${microsoftUsersData.length} users | External: ${externalUsers}`;
        
        updateDashboardData(project);
        initializeIdentityDashboard();
        
    } catch (error) {
        console.error('[Identity] Error:', error);
        showNotification('Failed to load  Identity Protection data', false);
        updateDashboardData(project);
    }
}

function goBackToProjects() {
    resetDashboard();
}

function resetDashboard() {
    document.getElementById('projects-view').style.display = 'block';
    document.getElementById('dashboard-view').style.display = 'none';
    currentProject = null;
    destroyCharts();
    
    // Restore site header if it was hidden
    const siteHeader = document.querySelector('.site-header');
    if (siteHeader) {
        siteHeader.classList.remove('header-hidden');
        siteHeader.classList.add('header-visible');
    }
    
    // Remove dashboard scroll listener if it exists
    // Note: We need to make handleDashboardScroll global or accessible
    if (typeof window.removeDashboardScroll === 'function') {
        window.removeDashboardScroll();
    }
    
    previewLockedByClick = false;
    selectedProjectId = null;
    const allCards = document.querySelectorAll('.project-card');
    allCards.forEach(card => card.classList.remove('glow-selected'));
    hideProjectPreview();
}

// ============================================
// DASHBOARD DATA PROCESSING & RENDERING
// ============================================
// Updates dashboard statistics and project information
// from retrieved API data

/* DASHBOARD DATA */
function updateDashboardData(project) {
    // For  Identity Protection, data is shown in the summary-stats section generated by generateIdentityDashboardHTML
    // No need to update stat boxes for Identity cards
    if (project.isIdentityCard) {
        document.getElementById('project-name').textContent = project.name;
        return;
    }
    
    // For other projects, use original data
    document.getElementById('project-name').textContent = project.name;
    document.getElementById('stat-risks').textContent = project.risks.critical;
    document.getElementById('stat-security').textContent = project.securityScore + '%';
    document.getElementById('stat-uptime').textContent = project.uptime + '%';
    document.getElementById('stat-last-update').textContent = project.lastUpdate;
}

// ============================================
// DASHBOARD CHARTS & VISUALIZATIONS
// ============================================
// Initializes and manages chart.js visualizations
// for risk, security, health, and threat analysis

/* CHARTS */
function initializeCharts(project) {
    initRiskChart(project);
    initSecurityChart(project);
    initHealthChart(project);
    initThreatChart(project);
}

function initRiskChart(project) {
    const ctx = document.getElementById('riskChart').getContext('2d');
    
    if (charts.risk) {
        charts.risk.destroy();
    }
    
    charts.risk = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
            datasets: [
                {
                    label: 'Critical',
                    data: [2, 3, 2, 4, 2, 1, 2],
                    borderColor: '#dc3545',
                    backgroundColor: 'rgba(220, 53, 69, 0.1)',
                    tension: 0.4,
                    fill: true,
                    pointBackgroundColor: '#dc3545'
                },
                {
                    label: 'High',
                    data: [5, 6, 4, 7, 5, 3, 3],
                    borderColor: '#ffc107',
                    backgroundColor: 'rgba(255, 193, 7, 0.1)',
                    tension: 0.4,
                    fill: false,
                    pointBackgroundColor: '#ffc107'
                },
                {
                    label: 'Medium',
                    data: [8, 9, 7, 10, 8, 6, 5],
                    borderColor: '#ff9800',
                    backgroundColor: 'rgba(255, 152, 0, 0.1)',
                    tension: 0.4,
                    fill: false,
                    pointBackgroundColor: '#ff9800'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: '#bdbdbd',
                        boxWidth: 12,
                        padding: 15
                    }
                }
            },
            scales: {
                y: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#bdbdbd'
                    }
                },
                x: {
                    grid: {
                        display: false,
                        drawBorder: false
                    },
                    ticks: {
                        color: '#bdbdbd'
                    }
                }
            }
        }
    });
}

function initSecurityChart(project) {
    const ctx = document.getElementById('securityChart').getContext('2d');
    
    if (charts.security) {
        charts.security.destroy();
    }
    
    const securePercentage = project.securityScore;
    const vulnerablePercentage = 100 - securePercentage;
    
    charts.security = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Secure', 'Vulnerable'],
            datasets: [{
                data: [securePercentage, vulnerablePercentage],
                backgroundColor: [
                    'rgba(40, 167, 69, 0.8)',
                    'rgba(220, 53, 69, 0.8)'
                ],
                borderColor: ['#28a745', '#dc3545'],
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: '#bdbdbd',
                        padding: 15
                    }
                }
            }
        }
    });
}

function initHealthChart(project) {
    const ctx = document.getElementById('healthChart').getContext('2d');
    
    if (charts.health) {
        charts.health.destroy();
    }
    
    const uptime = project.uptime;
    const downtime = 100 - uptime;
    
    charts.health = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: ['Performance', 'Availability', 'Security', 'Compliance', 'Backup'],
            datasets: [{
                label: 'Health Score',
                data: [92, uptime, project.securityScore, 85, 88],
                borderColor: '#006eff',
                backgroundColor: 'rgba(0, 110, 255, 0.2)',
                pointBackgroundColor: '#006eff',
                pointBorderColor: '#fff',
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: '#006eff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: '#bdbdbd'
                    }
                }
            },
            scales: {
                r: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#bdbdbd',
                        backdropColor: 'transparent'
                    }
                }
            }
        }
    });
}

function initThreatChart(project) {
    const ctx = document.getElementById('threatChart').getContext('2d');
    
    if (charts.threat) {
        charts.threat.destroy();
    }
    
    charts.threat = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
            datasets: [
                {
                    label: 'Malware Detected',
                    data: [2, 3, 1, 5, 2, 1, 3],
                    backgroundColor: 'rgba(220, 53, 69, 0.8)',
                    borderColor: '#dc3545',
                    borderWidth: 1
                },
                {
                    label: 'Intrusion Attempts',
                    data: [5, 7, 3, 8, 4, 2, 6],
                    backgroundColor: 'rgba(255, 193, 7, 0.8)',
                    borderColor: '#ffc107',
                    borderWidth: 1
                },
                {
                    label: 'Vulnerabilities Found',
                    data: [3, 4, 2, 6, 4, 3, 5],
                    backgroundColor: 'rgba(255, 152, 0, 0.8)',
                    borderColor: '#ff9800',
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: '#bdbdbd',
                        padding: 15
                    }
                }
            },
            scales: {
                y: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#bdbdbd'
                    }
                },
                x: {
                    grid: {
                        display: false,
                        drawBorder: false
                    },
                    ticks: {
                        color: '#bdbdbd'
                    }
                }
            }
        }
    });
}

function destroyCharts() {
    Object.values(charts).forEach(chart => {
        if (chart) {
            chart.destroy();
        }
    });
    charts = {};
}

/* UTILITIES */
function updateCopyrightYear() {
    const copyrightElement = document.getElementById('copyright-year');
    if (copyrightElement) {
        copyrightElement.textContent = new Date().getFullYear();
    }
}

// ============================================
// BILLING & INVOICE API
// ============================================
// Retrieves billing information, invoices, and payment status
// for the billing dashboard card

/* BILLING & GOVERNANCE CARDS */
async function initializeBillingCard() {
    const billingCard = document.getElementById('billing-card');
    if (!billingCard) return;
    
    const token = localStorage.getItem('authToken');
    const isSunbird = isSunbirdUser();
    
    if (!token) {
        billingCard.innerHTML = '<p style="color: #bdbdbd; text-align: center; padding: 20px;">Please log in to view billing information.</p>';
        return;
    }
    
    // For Sunbird clients, use tabbed interface
    if (isSunbird) {
        initializeSunbirdTabbedCard(billingCard, token);
    } else {
        // For other clients, use original design
        initializeStandardBillingCard(billingCard, token);
    }
}

// Standard billing card for non-Sunbird clients
async function initializeStandardBillingCard(billingCard, token) {
    try {
        const response = await fetch('/api/client/latest-invoice', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (response.status === 401 || response.status === 403) {
            // Token expired or invalid
            billingCard.innerHTML = '<p style="color: #bdbdbd; text-align: center; padding: 20px;">Session expired. Please log in again.</p>';
            return;
        }
        
        if (!response.ok) {
            throw new Error(`Failed to fetch invoice: ${response.status}`);
        }
        
        const invoice = await response.json();
        
        if (!invoice) {
            billingCard.innerHTML = `
                <div class="billing-card-header">
                    <i class="fas fa-credit-card"></i>
                    <h3>Billing Statement</h3>
                </div>
                <p style="color: #bdbdbd; text-align: center; padding: 20px;">No active billing</p>
            `;
            return;
        }
        
        const currency = 'R';
        const totalAmount = parseFloat(invoice.TotalAmount || 0);
        const items = invoice.items || [];
        const status = invoice.Status || 'Pending';
        
        // Format due date
        const dueDate = invoice.DueDate ? new Date(invoice.DueDate) : null;
        const dueDateString = dueDate ? dueDate.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A';
        
        // Payment status color
        let statusColor = '#ffc107'; // yellow for pending
        if (status.toLowerCase() === 'paid') {
            statusColor = '#28a745'; // green
        } else if (status.toLowerCase() === 'overdue') {
            statusColor = '#dc3545'; // red
        }
        
        // Display all items
        const billingItemsHtml = items.map(item => {
            const itemTotal = parseFloat(item.Total || item.UnitPrice || 0).toFixed(2);
            const serviceCategory = item.ServiceCategory || item.Category || item.Description || 'Service';
            return `
                <div class="billing-item">
                    <span class="billing-item-name">${serviceCategory}</span>
                    <span class="billing-item-cost">${currency}${parseFloat(itemTotal).toLocaleString()}</span>
                </div>
            `;
        }).join('');
        
        billingCard.innerHTML = `
            <div class="billing-card-header">
                <i class="fas fa-credit-card"></i>
                <h3>Billing Statement</h3>
            </div>
            <div class="billing-amount">
                <span class="billing-currency">${currency}</span>${totalAmount.toLocaleString()}
            </div>
            <div class="billing-summary">
                <div class="billing-summary-item">
                    <span class="billing-summary-label">Monthly Subscription</span>
                    <span class="billing-summary-value">${currency}${totalAmount.toLocaleString()}</span>
                </div>
                <div class="billing-summary-item">
                    <span class="billing-summary-label">Total Services</span>
                    <span class="billing-summary-value">${items.length}</span>
                </div>
                <div class="billing-summary-item">
                    <span class="billing-summary-label">Payment Status</span>
                    <span class="billing-summary-value" style="color: ${statusColor}; text-transform: capitalize;">${status}</span>
                </div>
                <div class="billing-summary-item">
                    <span class="billing-summary-label">Due Date</span>
                    <span class="billing-summary-value" style="color: var(--primary);">${dueDateString}</span>
                </div>
            </div>
            <div class="billing-items">
                ${billingItemsHtml}
            </div>
            <div class="billing-warning">
                <div class="warning-icon">
                    <i class="fas fa-exclamation-circle"></i>
                </div>
                <div class="warning-text">
                    <p><strong>Late Payment Notice:</strong></p>
                    <p>Failure to pay by the due date may result in service interruption and increased security exposure.</p>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Error loading billing card:', error);
        billingCard.innerHTML = `
            <div class="billing-card-header">
                <i class="fas fa-credit-card"></i>
                <h3>Billing Statement</h3>
            </div>
            <p style="color: #bdbdbd; text-align: center; padding: 20px;">Error loading billing information</p>
        `;
    }
}

// ============================================
// SUNBIRD TABBED CARD INTERFACE
// ============================================
// Tabbed interface for Security & Alerts, Billing, and Backup & Recovery
// ONLY for Sunbird clients

async function initializeSunbirdTabbedCard(billingCard, token) {
    try {
        // Fetch billing data
        const billingResponse = await fetch('/api/client/latest-invoice', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (billingResponse.status === 401 || billingResponse.status === 403) {
            billingCard.innerHTML = '<p style="color: #bdbdbd; text-align: center; padding: 20px;">Session expired. Please log in again.</p>';
            return;
        }
        
        const invoiceData = billingResponse.ok ? await billingResponse.json() : null;
        const currency = 'R';
        
        // Generate Security & Alerts card content
        const securityAlertsHTML = generateSecurityAlertsCard();
        
        // Generate Billing card content
        const billingHTML = generateBillingCardContent(invoiceData, currency);
        
        // Generate Backup & Recovery card content
        const backupHTML = generateBackupRecoveryCard();
        
        // Create tabbed interface
        const tabbedHTML = `
            <div class="sunbird-tabbed-card">
                <!-- Tab Navigation -->
                <div class="card-tabs-nav">
                    <button class="card-tab-btn active" data-tab="security-alerts" title="Security & Alerts">
                        <i class="fas fa-shield-alt"></i> Security & Alerts
                    </button>
                    <button class="card-tab-btn" data-tab="billing" title="Billing Statement">
                        <i class="fas fa-credit-card"></i> Billing Statement
                    </button>
                    <button class="card-tab-btn" data-tab="backup" title="Backup & Recovery">
                        <i class="fas fa-database"></i> Backup & Recovery
                    </button>
                </div>
                
                <!-- Tab Contents with fade animation -->
                <div class="card-tabs-content">
                    <div id="security-alerts-tab" class="card-tab-content active">
                        ${securityAlertsHTML}
                    </div>
                    <div id="billing-tab" class="card-tab-content">
                        ${billingHTML}
                    </div>
                    <div id="backup-tab" class="card-tab-content">
                        ${backupHTML}
                    </div>
                </div>
            </div>
        `;
        
        billingCard.innerHTML = tabbedHTML;
        
        // Attach tab switching listeners
        setupTabListeners();
        
    } catch (error) {
        console.error('Error loading Sunbird tabbed card:', error);
        billingCard.innerHTML = `<p style="color: #bdbdbd; text-align: center; padding: 20px;">Error loading information</p>`;
    }
}

// Generate Security & Alerts card content
function generateSecurityAlertsCard() {
    return `
        <div class="security-alerts-card">
            <div class="alerts-list">
                <div class="alert-item alert-critical">
                    <div class="alert-icon">
                        <i class="fas fa-lock"></i>
                    </div>
                    <div class="alert-content">
                        <h5>Privileged User Without MFA</h5>
                        <p>2 admin accounts detected without authentication</p>
                        <span class="alert-action"><a href="#">Review →</a></span>
                    </div>
                </div>
                
                <div class="alert-item alert-high">
                    <div class="alert-icon">
                        <i class="fas fa-user-clock"></i>
                    </div>
                    <div class="alert-content">
                        <h5>Inactive Users (30+ days)</h5>
                        <p>8 users require review</p>
                        <span class="alert-action"><a href="#">Review →</a></span>
                    </div>
                </div>
            </div>
            
            <button class="btn-view-full-tab" onclick="switchDashboard('security')">
                <i class="fas fa-arrow-right"></i> View Full Dashboard
            </button>
        </div>
    `;
}

// Generate Billing card content
function generateBillingCardContent(invoice, currency) {
    if (!invoice) {
        return `
            <div class="billing-card-content">
                <div class="card-header">
                    <i class="fas fa-credit-card"></i>
                    <h4>Billing Statement</h4>
                </div>
                <p style="color: #bdbdbd; text-align: center; padding: 20px;">No active billing</p>
            </div>
        `;
    }
    
    const totalAmount = parseFloat(invoice.TotalAmount || 0);
    const items = invoice.items || [];
    const status = invoice.Status || 'Pending';
    const dueDate = invoice.DueDate ? new Date(invoice.DueDate) : null;
    const dueDateString = dueDate ? dueDate.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A';
    
    let statusColor = '#ffc107';
    if (status.toLowerCase() === 'paid') statusColor = '#28a745';
    else if (status.toLowerCase() === 'overdue') statusColor = '#dc3545';
    
    const billingItemsHtml = items.map(item => {
        const itemTotal = parseFloat(item.Total || item.UnitPrice || 0).toFixed(2);
        const serviceCategory = item.ServiceCategory || item.Category || item.Description || 'Service';
        return `
            <div class="billing-item">
                <span class="billing-item-name">${serviceCategory}</span>
                <span class="billing-item-cost">${currency}${parseFloat(itemTotal).toLocaleString()}</span>
            </div>
        `;
    }).join('');
    
    return `
        <div class="billing-card-content">
            <div class="card-header">
                <i class="fas fa-credit-card"></i>
                <h4>Billing Statement</h4>
            </div>
            <div class="billing-amount">
                <span class="billing-currency">${currency}</span>${totalAmount.toLocaleString()}
            </div>
            <div class="billing-summary">
                <div class="billing-summary-item">
                    <span class="billing-summary-label">Monthly Subscription</span>
                    <span class="billing-summary-value">${currency}${totalAmount.toLocaleString()}</span>
                </div>
                <div class="billing-summary-item">
                    <span class="billing-summary-label">Total Services</span>
                    <span class="billing-summary-value">${items.length}</span>
                </div>
                <div class="billing-summary-item">
                    <span class="billing-summary-label">Payment Status</span>
                    <span class="billing-summary-value" style="color: ${statusColor}; text-transform: capitalize;">${status}</span>
                </div>
                <div class="billing-summary-item">
                    <span class="billing-summary-label">Due Date</span>
                    <span class="billing-summary-value" style="color: var(--primary);">${dueDateString}</span>
                </div>
            </div>
            <div class="billing-items">
                ${billingItemsHtml}
            </div>
            <div class="billing-warning">
                <div class="warning-icon">
                    <i class="fas fa-exclamation-circle"></i>
                </div>
                <div class="warning-text">
                    <p><strong>Late Payment Notice:</strong></p>
                    <p>Failure to pay by the due date may result in service interruption and increased security exposure.</p>
                </div>
            </div>
        </div>
    `;
}

// Generate Backup & Recovery card content
function generateBackupRecoveryCard() {
    return `
        <div class="backup-recovery-card">
            <div class="backup-stats-minimal">
                <div class="stat-min">
                    <span class="stat-label">Storage</span>
                    <span class="stat-val">247 GB</span>
                </div>
                <div class="stat-min">
                    <span class="stat-label">Users</span>
                    <span class="stat-val">45</span>
                </div>
                <div class="stat-min">
                    <span class="stat-label">Status</span>
                    <span class="stat-val" style="color: #86efac;">Protected</span>
                </div>
            </div>
            
            <div class="backup-list-minimal">
                <div class="backup-item">
                    <div class="backup-area">Exchange / Mailboxes</div>
                    <div class="backup-detail">89 GB • Protected</div>
                </div>
                <div class="backup-item">
                    <div class="backup-area">SharePoint / OneDrive</div>
                    <div class="backup-detail">98 GB • Protected</div>
                </div>
                <div class="backup-item">
                    <div class="backup-area">Active Directory</div>
                    <div class="backup-detail">34 GB • Protected</div>
                </div>
                <div class="backup-item">
                    <div class="backup-area">Teams & Communications</div>
                    <div class="backup-detail">26 GB • Protected</div>
                </div>
            </div>
            
            <button class="btn-view-full-tab" onclick="switchDashboard('backup')">
                <i class="fas fa-arrow-right"></i> View Full Dashboard
            </button>
        </div>
    `;
}

// Setup tab switching listeners
function setupTabListeners() {
    const tabButtons = document.querySelectorAll('.card-tab-btn');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', function() {
            const tabName = this.getAttribute('data-tab');
            switchCardTab(tabName);
        });
    });
}

// Switch card tabs with animation
function switchCardTab(tabName) {
    // Remove active class from all buttons and contents
    const tabButtons = document.querySelectorAll('.card-tab-btn');
    const tabContents = document.querySelectorAll('.card-tab-content');
    
    tabButtons.forEach(btn => btn.classList.remove('active'));
    tabContents.forEach(content => content.classList.remove('active'));
    
    // Add active class to selected button and content
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(`${tabName}-tab`).classList.add('active');
    
    console.log(`[Card Tabs] Switched to: ${tabName}`);
}

// Navigate to full dashboards
function switchDashboard(dashboardType) {
    const dashboardMap = {
        'security': 'identity-dashboard',
        'backup': 'backup-recovery-dashboard'
    };
    
    const dashboardId = dashboardMap[dashboardType];
    if (dashboardId) {
        const dashboardElement = document.getElementById(dashboardId);
        if (dashboardElement) {
            dashboardElement.scrollIntoView({ behavior: 'smooth' });
        }
    }
}

// Make toggleBillingItems globally accessible
window.toggleBillingItems = function() {
    const moreItems = document.getElementById('billing-items-more');
    const seeMoreBtn = document.getElementById('billing-see-more-btn');
    
    if (moreItems && seeMoreBtn) {
        const isHidden = moreItems.style.display === 'none';
        moreItems.style.display = isHidden ? 'block' : 'none';
        const icon = seeMoreBtn.querySelector('i');
        const text = seeMoreBtn.querySelector('span');
        
        if (isHidden) {
            text.textContent = 'See Less';
            icon.classList.remove('fa-chevron-down');
            icon.classList.add('fa-chevron-up');
        } else {
            text.textContent = 'See More';
            icon.classList.remove('fa-chevron-up');
            icon.classList.add('fa-chevron-down');
        }
    }
};

function initializeGovernanceCard() {
    const governanceCard = document.getElementById('governance-card');
    if (!governanceCard) return;
    
    const isSunbird = isSunbirdUser();
    
    let governanceData = [
        'Change Management',
        'End-user awareness',
        'Configurations',
        'Site documentation'
    ];
    
    // For Sunbird, we split Governance and Compliance
    if (isSunbird) {
        governanceData = [
            'Change Management',
            'Site documentation',
            'Project Roadmaps',
            'Asset Management'
        ];
    }
    
    const governanceHtml = governanceData.map(item => `
        <div class="governance-item">
            <i class="fas fa-check-circle" style="color: #28a745;"></i>
            <span class="governance-item-text">${item}</span>
        </div>
    `).join('');
    
    governanceCard.innerHTML = `
        <div class="governance-card-header">
            <i class="fas fa-shield-alt"></i>
            <h3>${isSunbird ? 'Governance' : 'Governance & Compliance'}</h3>
        </div>
        <div class="governance-content">
            ${governanceHtml}
        </div>
    `;
}

function initializeSupportCard() {
    const supportCard = document.getElementById('support-card');
    if (!supportCard) return;
    
    const isSunbird = isSunbirdUser();
    
    if (isSunbird) {
        // For Sunbird, this becomes the Compliance card
        supportCard.innerHTML = `
            <div class="secondary-card-header">
                <i class="fas fa-certificate"></i>
                <h3>Compliance</h3>
            </div>
            <div class="governance-content">
                <div class="governance-item">
                    <i class="fas fa-check-circle" style="color: #28a745;"></i>
                    <span class="governance-item-text">End-user awareness</span>
                </div>
                <div class="governance-item">
                    <i class="fas fa-check-circle" style="color: #28a745;"></i>
                    <span class="governance-item-text">MFA Enforcement</span>
                </div>
                <div class="governance-item">
                    <i class="fas fa-check-circle" style="color: #28a745;"></i>
                    <span class="governance-item-text">POPIA Compliance</span>
                </div>
                <div class="governance-item">
                    <i class="fas fa-check-circle" style="color: #28a745;"></i>
                    <span class="governance-item-text">ISO 27001 Readiness</span>
                </div>
            </div>
        `;
    } else {
        // Standard Support & SLA card for other clients
        supportCard.innerHTML = `
            <div class="secondary-card-header">
                <i class="fas fa-headset"></i>
                <h3>Support & SLA</h3>
            </div>
            <div class="governance-content">
                <div class="governance-item">
                    <i class="fas fa-clock"></i>
                    <span class="governance-item-text"><strong>8am - 5pm Priority Support</strong> - Response in 1 hour</span>
                </div>
                <div class="governance-item">
                    <i class="fas fa-phone"></i>
                    <span class="governance-item-text"><strong>Dedicated Support Team</strong> - 1 assigned engineer</span>
                </div>
                <div class="governance-item">
                    <i class="fas fa-tachometer-alt"></i>
                    <span class="governance-item-text"><strong>99.9% Uptime SLA</strong> - Guaranteed availability</span>
                </div>
            </div>
        `;
    }
}

/* RESIZE HANDLER */
window.addEventListener('resize', () => {
    if (currentProject && charts.risk) {
        Object.values(charts).forEach(chart => {
            if (chart) {
                chart.resize();
            }
        });
    }
});

/* ============================================ */
/* Dashboard Tabs & Microsoft Graph Integration */
/* ============================================ */

// Initialize tabs when project dashboard is loaded
function initializeTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    // Show tabs only if project has tabs enabled
    const dashboardTabs = document.getElementById('dashboard-tabs');
    
    // Always clear and hide all tab contents first
    tabContents.forEach(content => {
        content.classList.remove('active');
        content.style.display = 'none';
    });
    tabBtns.forEach(btn => {
        btn.classList.remove('active');
    });
    
    if (currentProject && currentProject.hasTabs) {
        dashboardTabs.style.display = 'block';
        
        // Add event listeners to tab buttons (remove duplicates by cloning)
        tabBtns.forEach(btn => {
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
        });
        
        // Query buttons again after cloning
        const freshTabBtns = document.querySelectorAll('.tab-btn');
        freshTabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const tabId = btn.getAttribute('data-tab');
                switchTab(tabId, document.querySelectorAll('.tab-btn'), document.querySelectorAll('.tab-content'));
                
                // Fetch Microsoft users when switching to identity tab
                if (tabId === 'identity-tab' && currentProject.microsoftGraphEnabled) {
                    fetchMicrosoftUsersData();
                }
            });
        });
        
        // Set default tab to "all"
        const allTab = document.getElementById('all-tab');
        if (allTab) {
            allTab.classList.add('active');
            allTab.style.display = 'block';
        }
        document.querySelector('[data-tab="all-tab"]').classList.add('active');
    } else {
        dashboardTabs.style.display = 'none';
        // Show the all-tab content when no project-specific tabs
        const allTab = document.getElementById('all-tab');
        if (allTab) {
            allTab.classList.add('active');
            allTab.style.display = 'block';
        }
    }
}

function switchTab(tabId, tabBtns, tabContents) {
    // Hide all tabs
    tabContents.forEach(content => {
        content.classList.remove('active');
        content.style.display = 'none';
    });
    
    // Deactivate all buttons
    tabBtns.forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Show selected tab
    const selectedTab = document.getElementById(tabId);
    if (selectedTab) {
        selectedTab.classList.add('active');
        selectedTab.style.display = 'block';
    }
    
    // Activate selected button
    const selectedBtn = document.querySelector(`[data-tab="${tabId}"]`);
    if (selectedBtn) {
        selectedBtn.classList.add('active');
    }
    
    console.log(`[Tabs] Switched to tab: ${tabId}`);
}

// ============================================
// MICROSOFT GRAPH USERS & ROLES API
// ============================================
// Fetches and displays Microsoft user data, roles, and access information
// for the Identity tab in the dashboard

// Fetch Microsoft users from the API
async function fetchMicrosoftUsersData() {
    try {
        const token = localStorage.getItem('authToken');
        if (!token) {
            showNotification('Authentication required. Please log in again.', false);
            return;
        }
        
        console.log('[Microsoft Graph] Fetching users...');
        
        const response = await fetch('/api/microsoft-users', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to fetch Microsoft users');
        }
        
        const data = await response.json();
        microsoftUsersData = data.users || [];
        
        console.log(`[Microsoft Graph] Retrieved ${microsoftUsersData.length} users`);
        
        populateMicrosoftUsersTable(microsoftUsersData);
        updateIdentityStats(microsoftUsersData);
        
    } catch (error) {
        console.error('[Microsoft Graph] Error fetching users:', error.message);
        showNotification(`Failed to load Microsoft users: ${error.message}`, false);
        
        // Show error in table
        const tbody = document.getElementById('microsoft-users-tbody');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 20px; color: #dc3545;">
                <i class="fas fa-exclamation-circle"></i> Error loading users: ${error.message}
            </td></tr>`;
        }
    }
}

// ============================================
// USER DATA DISPLAY & TABLE RENDERING
// ============================================
// Renders Microsoft user data in tables, applies filters,
// and displays identity analytics statistics

// Populate the Microsoft users table
function populateMicrosoftUsersTable(users) {
    const tbody = document.getElementById('microsoft-users-tbody');
    if (!tbody) return;
    
    if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px; color: #94a3b8;">No users found</td></tr>';
        return;
    }
    
    const rows = users.map(user => `
        <tr>
            <td>${user.displayName}</td>
            <td>${user.mail}</td>
            <td>${user.jobTitle}</td>
            <td>${user.mobilePhone}</td>
            <td>
                <span class="user-type ${user.isExternal ? 'external' : 'internal'}">
                    ${user.isExternal ? 'External' : 'Internal'}
                </span>
            </td>
            <td>
                <span class="user-status">${user.status}</span>
            </td>
        </tr>
    `).join('');
    
    tbody.innerHTML = rows;
    
    console.log('[Microsoft Graph] Table updated with ' + users.length + ' users');
}

// Update identity stats
function updateIdentityStats(users) {
    const totalUsers = users.length;
    const externalUsers = users.filter(u => u.isExternal).length;
    const missingData = users.filter(u => 
        !u.jobTitle || u.jobTitle === 'No Title' || !u.phone || u.phone === 'N/A'
    ).length;
    
    document.getElementById('ms-total-users').textContent = totalUsers;
    document.getElementById('ms-external-users').textContent = externalUsers;
    document.getElementById('ms-missing-data').textContent = missingData;
    
    // Format timestamp
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
    });
    document.getElementById('ms-last-updated').textContent = timeStr;
    
    console.log(`[Identity Stats] Total: ${totalUsers}, External: ${externalUsers}, Missing Data: ${missingData}`);
}

// Filter Microsoft users based on search and checkboxes
function filterMicrosoftUsers() {
    const searchInput = document.getElementById('microsoft-user-search');
    const filterExternal = document.getElementById('filter-external').checked;
    const filterNoJobTitle = document.getElementById('filter-no-jobTitle').checked;
    
    const searchTerm = searchInput.value.toLowerCase();
    
    let filtered = microsoftUsersData.filter(user => {
        // Search filter
        if (searchTerm && !user.displayName.toLowerCase().includes(searchTerm) && 
            !user.email.toLowerCase().includes(searchTerm)) {
            return false;
        }
        
        // External users filter
        if (filterExternal && !user.isExternal) {
            return false;
        }
        
        // Missing job title filter
        if (filterNoJobTitle && user.jobTitle && user.jobTitle !== 'No Title') {
            return false;
        }
        
        return true;
    });
    
    populateMicrosoftUsersTable(filtered);
    console.log(`[Filter] Showing ${filtered.length} of ${microsoftUsersData.length} users`);
}

// Add search input listener
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('microsoft-user-search');
    if (searchInput) {
        searchInput.addEventListener('input', filterMicrosoftUsers);
    }
});

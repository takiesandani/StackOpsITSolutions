/* Client Portal JavaScript */

let currentProject = null;
let charts = {};
let currentProjectIndex = 0;
let selectedProjectId = null;
let previewLockedByClick = false;

// Sunbird-only card IDs that should be hidden from non-Sunbird clients
const SUNBIRD_ONLY_CARD_IDS = [2, 3, 4, 5, 7, 8, 9, 10]; // Identity Protection, Devices, Security & Events, Email Security, Backup & Recovery, Applications, Credential Security, Network Security

// Cards to hide from Sunbird clients
const HIDDEN_FROM_SUNBIRD_IDS = []; // All Sunbird cards are visible to them

// Cards to hide from the main project cards UI (keep functionality in code)
const HIDDEN_PROJECT_CARD_IDS = [4, 7, 8, 6]; // Security & Events, Backup and Recovery, Applications

// SEDFA/Duo user-specific card IDs (Cisco Duo Licenses, Cloud data services, Infrastructure Monitoring)
const SEDFA_CARD_IDS = [1, 6, 11];

// Sunbird-specific card order (for carousel layout): Credential Security (left), Identity, Device, Email (center 3), Network Security (right)
const SUNBIRD_CARD_ORDER = [9, 2, 3, 5, 10];

// Check if current user is a Sunbird client
function isSunbirdUser() {
    try {
        const rawUser = localStorage.getItem('user');
        if (!rawUser) return false;
        const user = JSON.parse(rawUser);
        return String(user?.access || '').toLowerCase() === 'sunbird';
    } catch (error) {
        return false;
    }
}

// Check if current user is sedfa client (has Cisco Duo access)
// Access type is set by backend from user_duo_accounts table
function isSedfaUser() {
    try {
        const rawUser = localStorage.getItem('user');
        if (!rawUser) return false;
        const user = JSON.parse(rawUser);
        // Check if user has duo access (set by backend via user_duo_accounts table)
        const access = String(user?.access || '').toLowerCase();
        return access === 'duo' || access === 'sedfa';
    } catch (error) {
        return false;
    }
}

// Update Sunbird logo visibility based on user type
function updateSunbirdLogoVisibility() {
    const logoImg = document.querySelector('.sunbird-logo-img');
    if (logoImg) {
        if (isSunbirdUser()) {
            logoImg.style.display = 'block';
        } else {
            logoImg.style.display = 'none';
        }
    }
}

// Check if session is still valid
function isSessionValid() {
    const isLoggedIn = sessionStorage.getItem('isLoggedIn');
    const userEmail = sessionStorage.getItem('userEmail');
    const token = localStorage.getItem('authToken');
    const localUser = localStorage.getItem('user');
    
    return isLoggedIn === 'true' && userEmail && token;
}

// Get filtered projects based on user access level
function getFilteredProjects() {
    if (isSunbirdUser()) {
        // Sunbird users see specific cards in carousel order: Credential (left), Identity-Device-Email (center), Network (right)
        return SUNBIRD_CARD_ORDER.map(id => mockProjects.find(p => p.id === id)).filter(Boolean);
    }
    
    if (isSedfaUser()) {
        // Sedfa users see Cisco Duo Licenses, Cloud data services, and Infrastructure Monitoring
        return mockProjects.filter(project =>
            SEDFA_CARD_IDS.includes(project.id)
        );
    }
    
    // All other clients see all projects EXCEPT Sunbird-only, Cisco Duo, and hidden projects
    return mockProjects.filter(project =>
        !SUNBIRD_ONLY_CARD_IDS.includes(project.id) && 
        project.id !== 1 &&
        !HIDDEN_PROJECT_CARD_IDS.includes(project.id)
    );
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
            { label: "Total Users", value: ": 0", icon: "fas fa-users" },
            { label: "Active (24h)", value: ": 0", icon: "fas fa-user-check" },
            { label: "Admin Roles", value: ": 0", icon: "fas fa-crown" },
            { label: "Security Score", value: ": 0", icon: "fas fa-shield-alt" }
        ],
        cardFooter: "Live data",
        hasTabs: false,
        microsoftGraphEnabled: true,
        isIdentityCard: true
    },
    {
        id: 3,
        name: "Device Protection",
        type: "Device Management & Compliance",
        status: "active",
        risks: { critical: 0, high: 0, medium: 0 },
        securityScore: 0,
        uptime: 100,
        lastUpdate: "Loading...",
        icon: "fas fa-laptop",
        cardMetrics: [
            { label: "Total Devices", value: ": 0", icon: "fas fa-desktop" },
            { label: "Non-Compliant", value: ": 0", icon: "fas fa-times-circle" },
            { label: "Not Encrypted", value: ": 0", icon: "fas fa-lock-open" },
            { label: "Stale (7+ days)", value: ": 0", icon: "fas fa-clock" }
        ],
        cardFooter: "Live device status",
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
            { label: "Active Threats", value: ": 0", icon: "fas fa-exclamation-triangle" },
            { label: "High Severity", value: ": 0", icon: "fas fa-circle-exclamation" },
            { label: "Users Targeted", value: ": 0", icon: "fas fa-user-shield" },
            { label: "Open Incidents", value: ": 0", icon: "fas fa-bug" }
        ],
        cardFooter: "Monitoring threats",
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
            { label: "Total Apps", value: ": 0", icon: "fas fa-cubes" },
            { label: "External Apps", value: ": 0", icon: "fas fa-globe" },
            { label: "High Risk Apps", value: ": 0", icon: "fas fa-exclamation-circle" },
            { label: "High Access Apps", value: ": 0", icon: "fas fa-users" }
        ],
        cardFooter: "Access monitoring active",
        hasTabs: false,
        microsoftGraphEnabled: true,
        isApplicationsCard: true
    },
    {
        id: 9,
        name: "Credential Security", 
        type: "Password & Credential Management",
        status: "inactive",
        risks: { critical: 1, high: 1, medium: 1 },
        securityScore: 85,
        uptime: 98.5,
        lastUpdate: "2 days ago",
        icon: "fas fa-key",
        cardMetrics: [
            { label: "Weak Passwords", value: ": 12", icon: "fas fa-exclamation-triangle" },
            { label: "Reused Passwords", value: ": 8", icon: "fas fa-sync-alt" }
        ],
        cardFooter: "High-risk credentials detected"
    },
    {
        id: 10,
        name: "Network Security",
        type: "Network Monitoring & Threat Detection", 
        status: "inactive",
        risks: { critical: 1, high: 2, medium: 1 },
        securityScore: 78,
        uptime: 97.2,
        lastUpdate: "1 day ago",
        icon: "fas fa-network-wired",
        cardMetrics: [
            { label: "Open Ports", value: ": 5", icon: "fas fa-firewall" },
            { label: "Unusual Traffic", value: ": 23", icon: "fas fa-chart-line" }
        ],
        cardFooter: "Network vulnerabilities found"
    },
    {
        id: 11,
        name: "Infrastructure Monitoring",
        type: "Server Health & Performance Monitoring",
        status: "active",
        risks: { critical: 0, high: 1, medium: 2 },
        securityScore: 92,
        uptime: 99.5,
        lastUpdate: "5 minutes ago",
        icon: "fas fa-server",
        cardMetrics: [
            { label: "Servers Online", value: ": 24", icon: "fas fa-server" },
            { label: "CPU Avg Load", value: ": 45%", icon: "fas fa-microchip" },
            { label: "Memory Usage", value: ": 72%", icon: "fas fa-memory" },
            { label: "Disk Space", value: ": 68%", icon: "fas fa-hdd" }
        ],
        cardFooter: "Infrastructure healthy - monitoring active"
    }
];

/* INITIALIZATION */
let microsoftUsersData = [];
let microsoftRolesData = [];
let userRolesMap = {}; // Maps userId to array of role names
let applicationsData = []; // Applications from Microsoft Graph
let servicePrincipalsData = []; // Service Principals for app mapping
let groupsData = []; // Groups for access mapping
let sunbirdBillingMenuSelection = 'security';
let cachedSunbirdBillingHtml = '';
let cachedSunbirdSecurityData = null;
let cachedSunbirdBackupData = null;
const BILLING_CACHE_KEY = 'billingInvoiceCache_v1';
const BILLING_CACHE_TTL_MS = 5 * 60 * 1000;
let billingAuthRetryCount = 0;
let sunbirdBillingCardLockedHeight = null;
let identityRiskFocus = 'all';
let pendingIdentityRiskFocus = 'all';
let identityFetchRequestId = 0;
let latestDevicesCardData = null;
let latestEmailCardData = null;

function toBooleanMfa(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value > 0;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        return normalized === 'true' || normalized === 'yes' || normalized === 'enabled' || normalized === '1';
    }
    return false;
}

function isSummaryProjectCard(project) {
    return !!(project && (project.isIdentityCard || project.isDevicesCard || project.isEmailSecurityCard || project.isApplicationsCard));
}

function getSummaryCardStatusMeta(project) {
    if (!project || !isSummaryProjectCard(project)) {
        return { status: 'active', text: 'Live data', dotClass: 'ok' };
    }

    const normalizedStatus = String(project.status || '').toLowerCase();
    if (normalizedStatus.includes('error')) {
        return { status: 'error', text: 'Data unavailable', dotClass: 'error' };
    }

    if (normalizedStatus.includes('loading') || normalizedStatus.includes('syncing')) {
        return { status: 'loading', text: 'Live data', dotClass: 'partial' };
    }

    return { status: 'active', text: '', dotClass: 'ok' };
}

function toMetricValue(value, fallback = 0) {
    const raw = String(value ?? '').replace(':', '').trim();
    if (!raw || raw === '...') return String(fallback);
    return raw;
}

function normalizeSummaryMetrics(project) {
    if (!project || !isSummaryProjectCard(project)) return Array.isArray(project?.cardMetrics) ? project.cardMetrics : [];

    const defaultMetricsByCard = {
        2: [
            { label: "Total Users", value: ": 0", icon: "fas fa-users" },
            { label: "Active (24h)", value: ": 0", icon: "fas fa-user-check" },
            { label: "Admin Roles", value: ": 0", icon: "fas fa-crown" },
            { label: "Security Score", value: ": 0", icon: "fas fa-shield-alt" }
        ],
        3: [
            { label: "Total Devices", value: ": 0", icon: "fas fa-desktop" },
            { label: "Non-Compliant", value: ": 0", icon: "fas fa-times-circle" },
            { label: "Not Encrypted", value: ": 0", icon: "fas fa-lock-open" },
            { label: "Stale (7+ days)", value: ": 0", icon: "fas fa-clock" }
        ],
        5: [
            { label: "Active Threats", value: ": 0", icon: "fas fa-exclamation-triangle" },
            { label: "High Severity", value: ": 0", icon: "fas fa-circle-exclamation" },
            { label: "Users Targeted", value: ": 0", icon: "fas fa-user-shield" },
            { label: "Open Incidents", value: ": 0", icon: "fas fa-bug" }
        ],
        8: [
            { label: "Total Apps", value: ": 0", icon: "fas fa-cubes" },
            { label: "External Apps", value: ": 0", icon: "fas fa-globe" },
            { label: "High Risk Apps", value: ": 0", icon: "fas fa-exclamation-circle" },
            { label: "High Access Apps", value: ": 0", icon: "fas fa-users" }
        ]
    };

    const defaults = defaultMetricsByCard[project.id] || [];
    const incoming = Array.isArray(project.cardMetrics) ? project.cardMetrics.slice(0, 4) : [];
    return defaults.map((metric, index) => ({ ...metric, ...(incoming[index] || {}) })).slice(0, 4);
}

document.addEventListener('DOMContentLoaded', function() {
    setupEventListeners();
    setupSessionManagement();
    initializeProjectsList();
    initializeBillingCard();
    initializeGovernanceCard();
    initializeSupportCard();
    initializeSunbirdLeftMenu();
    updateCopyrightYear();
});

function getSunbirdBillingActiveView() {
    const billingCard = document.getElementById('billing-card');
    return billingCard?.dataset?.sunbirdView || sunbirdBillingMenuSelection;
}

function isSunbirdBillingViewActive(view) {
    return getSunbirdBillingActiveView() === view;
}

async function bootstrapDashboardDataAfterLogin() {
    // Rebuild visible cards for the authenticated user immediately.
    initializeProjectsList();

    // Fire all key dashboard data fetches in parallel.
    await Promise.allSettled([
        fetchDuoStats(),
        fetchIdentityData(mockProjects.find(p => p.id === 2)),
        fetchApplicationsData(),
        fetchDevicesCardData(),
        fetchEmailCardData(),
        initializeBillingCard()
    ]);

    // Retry identity fetch once if Sunbird data is still empty.
    if (isSunbirdUser() && microsoftUsersData.length === 0) {
        setTimeout(() => {
            fetchIdentityAccessData();
        }, 900);
    }

    // Ensure Sunbird-specific menu and billing panel are attached immediately after login.
    if (isSunbirdUser()) {
        initializeSunbirdLeftMenu();
        if (typeof window.switchBillingMenu === 'function') {
            window.switchBillingMenu(sunbirdBillingMenuSelection || 'security');
        }
    }
}

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
        
        const response = await fetch('/api/db/identity-details', {
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
        
        const response = await fetch('/api/db/application-metrics', {
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
        
        const metrics = data.metrics || {};
        applicationsData = applicationsData || [];
        console.log('[Applications] Loaded DB application metrics');
        populateApplicationsCard({
            totalApplications: metrics.TotalApps || metrics.totalApps || 0,
            externalApplications: metrics.ExternalApps || metrics.externalApps || 0,
            highRiskApps: metrics.HighRiskApps || metrics.highRiskApps || 0,
            highAccessApps: metrics.HighAccessApps || metrics.highAccessApps || 0
        });
        
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
    const highRiskApps = apiData.highRiskApps ?? calculateHighRiskApplications(applicationsData);
    const highAccessApps = apiData.highAccessApps ?? applicationsData.filter(app => (app.userCount || 0) >= 20).length;

    appProject.status = 'active';
    appProject.cardMetrics = [
        { label: "Total Apps", value: `: ${totalApps}`, icon: "fas fa-cubes" },
        { label: "External Apps", value: `: ${externalApps}`, icon: "fas fa-globe" },
        { label: "High Risk Apps", value: `: ${highRiskApps}`, icon: "fas fa-exclamation-circle" },
        { label: "High Access Apps", value: `: ${highAccessApps}`, icon: "fas fa-users" }
    ];
    appProject.cardFooter = highRiskApps > 0 ? `${highRiskApps} high risk apps` : 'No high risk apps detected';
    appProject.lastUpdate = new Date().toLocaleTimeString();
    
    // Re-render project cards
    displayCurrentProject();
}

// Show detailed app access (users/groups) modal/card
async function showAppAccessDetail(spId, appName) {
    console.log(`[App Access] Showing details for ${appName} (${spId})`);
    
    const authToken = localStorage.getItem('authToken');
    if (!authToken) {
        showNotification('Please login again to view app details', false);
        return;
    }
    
    try {
        // Show loading state
        const accessContainer = document.getElementById('apps-access-content');
        if (accessContainer) {
            accessContainer.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #94a3b8;">
                    <i class="fas fa-spinner fa-spin" style="font-size: 24px; margin-bottom: 12px;"></i>
                    <div>Loading app access details...</div>
                </div>
            `;
        }
        
        const response = await fetch(`/api/app-access/${spId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'Failed to fetch app access data');
        }
        
        renderAppAccessDetail(spId, appName, data);
        
    } catch (error) {
        console.error('[App Access] Error:', error);
        const accessContainer = document.getElementById('apps-access-content');
        if (accessContainer) {
            accessContainer.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #f87171;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 24px; margin-bottom: 12px;"></i>
                    <div>Failed to load app details</div>
                    <small>${error.message}</small>
                </div>
            `;
        }
        showNotification('Failed to load app details', false);
    }
}

// Render app access detail view
function renderAppAccessDetail(spId, appName, data) {
    const accessContainer = document.getElementById('apps-access-content');
    if (!accessContainer) return;
    
    const { users, groups, hasDirect, message } = data;
    const app = applicationsData.find(a => a.id === spId);
    const isExternal = app ? app.isExternal : false;
    
    let groupsHtml = '';
    if (groups && groups.length > 0) {
        groupsHtml = groups.slice(0, 8).map(group => `<span class="group-tag">${group}</span>`).join(' ');
        if (groups.length > 8) {
            groupsHtml += ` <span class="group-tag more-groups">+${groups.length - 8} more</span>`;
        }
    } else {
        groupsHtml = '<span class="group-tag no-groups">No groups assigned</span>';
    }
    
    let usersHtml = `<span class="user-count-badge">${users || 0} users</span>`;
    
    const accessHtml = `
        <div class="access-grid">
            <div class="access-card">
                <h4>${appName}</h4>
                <p class="access-stat">
                    ${usersHtml}
                    <span>assigned users</span>
                </p>
                <small>${isExternal ? 'External app' : 'Internal app'}</small>
            </div>
            
            <div class="access-card">
                <h4>Assigned Groups</h4>
                <div class="groups-display">
                    ${groupsHtml}
                </div>
                ${groups && groups.length > 0 ? '' : '<small>No group assignments</small>'}
            </div>
            
            ${hasDirect ? 
                `<div class="access-card success">
                    <h4>✅ Direct Assignments</h4>
                    <p class="access-stat app-users">${users || 0} <span>users with direct access</span></p>
                    <small>Active assignments confirmed</small>
                </div>` :
                `<div class="access-card warning">
                    <h4>⚠️ ${message || 'No Direct Assignments Detected'}</h4>
                    <p class="access-stat">0 <span>direct user assignments</span></p>
                    <small>App exists but no users/groups assigned</small>
                </div>`
            }
            
            <div class="access-card full-width">
                <h4>Quick Actions</h4>
                <div class="access-actions">
                    <button class="btn-action" onclick="copyAppDetails('${spId}', '${appName}')">
                        <i class="fas fa-copy"></i> Copy Details
                    </button>
                    <button class="btn-action external" onclick="openMicrosoftApp('${spId}')">
                        <i class="fas fa-external-link-alt"></i> Azure Portal
                    </button>
                </div>
            </div>
        </div>
    `;
    
    accessContainer.innerHTML = accessHtml;
}

// Copy app details to clipboard
function copyAppDetails(spId, appName) {
    const app = applicationsData.find(a => a.id === spId);
    const details = `App: ${appName} (${spId})
Users: ${app?.userCount || 0}
External: ${app?.isExternal ? 'Yes' : 'No'}
Permissions: ${(app?.scopeCount || 0) + (app?.roleCount || 0)}`;
    
    navigator.clipboard.writeText(details).then(() => {
        showNotification('App details copied to clipboard', true);
    }).catch(() => {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = details;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showNotification('App details copied', true);
    });
}

// Open app in Microsoft Azure Portal
function openMicrosoftApp(spId) {
    const url = `https://portal.azure.com/#blade/Microsoft_AAD_IAM/ActiveDirectoryMenuBlade/ServicePrincipals/servicePrincipalId/${spId}/overview`;
    window.open(url, '_blank');
}

// Populate Applications table exactly as requested: App | Users | Type | Risk
function populateApplicationsTable() {
    const tableBody = document.getElementById('apps-table-body');
    if (!tableBody) return;
    
    tableBody.innerHTML = '';
    
    // Sort apps: High risk first, then by user count
    const sortedApps = [...applicationsData].sort((a, b) => {
         const riskA = calculateAppRisk(a).level;
         const riskB = calculateAppRisk(b).level;
         if (riskA === 'high' && riskB !== 'high') return -1;
         if (riskB === 'high' && riskA !== 'high') return 1;
         return b.userCount - a.userCount;
    });

    sortedApps.forEach((app) => {
        const risk = calculateAppRisk(app);
        
        // Emoji Logic
        let riskIcon = '✅';
        if (risk.level === 'high') riskIcon = '🔴';
        else if (risk.level === 'medium') riskIcon = '⚠️';
        
        const row = document.createElement('tr');
        row.className = 'app-row';
        row.innerHTML = `
            <td class="app-name">
                <strong>${app.name}</strong><br>
                <small style="color: #64748b;">${app.assignedGroups && app.assignedGroups.length ? 'Groups: ' + app.assignedGroups.join(', ') : 'No assigned groups'}</small>
            </td>
            <td class="app-users"><strong>${app.userCount || 0}</strong></td>
            <td class="app-type"><span class="user-type-badge ${app.isExternal ? 'external' : 'internal'}">${app.type}</span></td>
            <td class="app-risk">
                <span title="Risk Info">${riskIcon} <small style="color: #94a3b8; margin-left: 5px;">${risk.reasons[0]}</small></span>
            </td>
        `;
        
        tableBody.appendChild(row);
    });
    
    // Calculate and update the 4 Top Cards
    const totalApps = applicationsData.length;
    const externalApps = applicationsData.filter(a => a.isExternal).length;
    const highRiskApps = applicationsData.filter(a => calculateAppRisk(a).level === 'high').length;
    
    // Fix the "0 Avg Users" bug by only averaging apps that ACTUALLY have users
    const appsWithUsers = applicationsData.filter(a => a.userCount > 0);
    const totalUsers = appsWithUsers.reduce((sum, a) => sum + a.userCount, 0);
    const avgUsers = appsWithUsers.length > 0 ? Math.round(totalUsers / appsWithUsers.length) : 0;
    
    document.getElementById('totalAppsValue').textContent = totalApps;
    document.getElementById('externalAppsValue').textContent = externalApps;
    document.getElementById('highRiskAppsValue').textContent = highRiskApps;
    document.getElementById('avgUsersValue').textContent = avgUsers;
    
    // Update bottom insights dynamically
    updateApplicationsAccessOverview(totalUsers, externalApps);
    updateApplicationsInsights(totalApps, externalApps, highRiskApps);
}

async function fetchDevicesCardData() {
    const project = mockProjects.find(p => p.id === 3);
    if (!project) return;

    try {
        const token = localStorage.getItem('authToken');
        if (!token) return;

        project.status = 'loading';
        displayCurrentProject();

        const response = await fetch('/api/db/device-metrics', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.message || 'Failed to fetch device metrics');
        }

        latestDevicesCardData = data;
        const metrics = data.metrics || {};
        const total = metrics.TotalDevices || metrics.totalDevices || 0;
        const nonCompliant = metrics.NonCompliant || metrics.nonCompliant || 0;
        const notEncrypted = metrics.NotEncrypted || metrics.notEncrypted || 0;
        const stale7days = metrics.StaleDevices || metrics.staleDevices || 0;

        project.status = 'active';
        project.cardMetrics = [
            { label: "Total Devices", value: `: ${total}`, icon: "fas fa-desktop" },
            { label: "Non-Compliant", value: `: ${nonCompliant}`, icon: "fas fa-times-circle" },
            { label: "Not Encrypted", value: `: ${notEncrypted}`, icon: "fas fa-lock-open" },
            { label: "Stale (7+ days)", value: `: ${stale7days}`, icon: "fas fa-clock" }
        ];
        project.cardFooter = nonCompliant > 0 ? `${nonCompliant} non-compliant devices` : 'All devices compliant';
        project.lastUpdate = new Date().toLocaleTimeString();
        displayCurrentProject();
    } catch (error) {
        console.error('[Devices Card] Error:', error);
        project.status = 'error';
        project.cardFooter = 'Data unavailable';
        displayCurrentProject();
    }
}

async function fetchEmailCardData() {
    const project = mockProjects.find(p => p.id === 5);
    if (!project) return;

    try {
        const token = localStorage.getItem('authToken');
        if (!token) return;

        project.status = 'loading';
        displayCurrentProject();

        const response = await fetch('/api/db/email-metrics', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.message || 'Failed to fetch email metrics');
        }

        latestEmailCardData = data;
        const metrics = data.metrics || {};
        project.status = 'active';
        project.cardMetrics = [
            { label: "Active Threats", value: `: ${metrics.ActiveThreats || metrics.activeThreats || 0}`, icon: "fas fa-exclamation-triangle" },
            { label: "High Severity", value: `: ${metrics.HighSeverity || metrics.highSeverity || 0}`, icon: "fas fa-circle-exclamation" },
            { label: "Users Targeted", value: `: ${metrics.UsersTargeted || metrics.usersTargeted || 0}`, icon: "fas fa-user-shield" },
            { label: "Open Incidents", value: `: ${metrics.OpenIncidents || metrics.openIncidents || 0}`, icon: "fas fa-bug" }
        ];
        const activeThreats = metrics.ActiveThreats || metrics.activeThreats || 0;
        project.cardFooter = activeThreats > 0 ? `${activeThreats} active threats detected` : 'No active threats';
        project.lastUpdate = new Date().toLocaleTimeString();
        displayCurrentProject();
    } catch (error) {
        console.error('[Email Card] Error:', error);
        project.status = 'error';
        project.cardFooter = 'Data unavailable';
        displayCurrentProject();
    }
}

// Calculate simple risk logic exactly as requested
function calculateAppRisk(app) {
    let riskLevel = 'safe'; 
    let riskReasons = [];
    
    const totalPermissions = (app.scopeCount || 0) + (app.roleCount || 0);
    const userCount = app.userCount || 0;
    
    // High Risk Rules
    if (userCount > 50) {
        riskLevel = 'high';
        riskReasons.push('App has high user access');
    }
    if (totalPermissions > 10) {
        riskLevel = 'high';
        riskReasons.push('Excessive permissions detected');
    }
    if (app.isExternal || app.type === 'External') {
        riskLevel = 'high';
        riskReasons.push('External app connected');
    }
    
    // Fallback if no rules hit
    if (riskReasons.length === 0) {
        riskLevel = 'safe';
        riskReasons.push('Safe / Internal');
    }
    
    return { level: riskLevel, reasons: riskReasons };
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
async function initializeApplicationsDashboard() {
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
    
    // Render an identity-specific loading view immediately to avoid showing generic dashboard content.
    dashboardView.innerHTML = generateIdentityDashboardHTML();
    showIdentityTableLoadingSkeleton();

    // Trigger fresh fetch whenever user opens Identity dashboard.
    fetchIdentityAccessData();

    // WAIT for data to load before initializing dashboard
    if (microsoftUsersData.length > 0) {
        console.log('[Identity Dashboard] Data already loaded, initializing immediately');
        initializeIdentityDashboard();
    } else {
        // Otherwise wait for data to load with timeout
        console.log('[Identity Dashboard] Waiting for data to load...');
        let waitTime = 0;
        const maxWait = 12000; // Max 12 seconds for slower Graph calls
        const checkInterval = setInterval(() => {
            waitTime += 100;
            if (microsoftUsersData.length > 0) {
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
        console.warn('[Identity Dashboard] No user data available yet, retrying...');
        setTimeout(() => {
            if (microsoftUsersData.length > 0) {
                initializeIdentityDashboard();
            } else {
                fetchIdentityAccessData();
            }
        }, 700);
        return;
    }
    
    // Update dashboard content with Identity-specific layout
    const dashboardView = document.getElementById('dashboard-view');
    if (dashboardView) {
        dashboardView.innerHTML = generateIdentityDashboardHTML();
    }
    
    // Show loading skeleton immediately
    showIdentityTableLoadingSkeleton();
    
    // Initialize table population, search, and insights
    setTimeout(() => {
        console.log('[Identity Dashboard] Initializing table, search, and insights');
        populateIdentityTable();
        setupIdentitySearch();
        initializeIdentityInsights();
    }, 100);
}

// Show loading skeleton while table data loads
function showIdentityTableLoadingSkeleton() {
    const tableBody = document.getElementById('users-table-body');
    if (!tableBody) return;
    
    tableBody.innerHTML = '';
    
    // Create 8 skeleton rows
    for (let i = 0; i < 8; i++) {
        const row = document.createElement('tr');
        row.className = 'skeleton-row';
        row.innerHTML = `
            <td><div class="skeleton-block"></div></td>
            <td><div class="skeleton-block"></div></td>
            <td><div class="skeleton-block"></div></td>
            <td><div class="skeleton-block"></div></td>
            <td><div class="skeleton-block"></div></td>
            <td><div class="skeleton-block"></div></td>
            <td><div class="skeleton-block"></div></td>
            <td><div class="skeleton-block"></div></td>
            <td><div class="skeleton-block"></div></td>
            <td><div class="skeleton-block"></div></td>
            <td><div class="skeleton-block"></div></td>
            <td><div class="skeleton-block"></div></td>
            <td><div class="skeleton-block"></div></td>
        `;
        tableBody.appendChild(row);
    }
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
    
    const isUserPrivileged = (user) => {
        const roleNames = (user.roles || []).map(role => typeof role === 'string' ? role : (role?.name || '')).join(' ').toLowerCase();
        return /(admin|global|privileged|security)/.test(roleNames);
    };

    const isUserActive24h = (user) => {
        const dt = user?.lastSignIn?.dateTime ? new Date(user.lastSignIn.dateTime) : null;
        if (!dt || Number.isNaN(dt.getTime())) return false;
        return (Date.now() - dt.getTime()) <= (24 * 60 * 60 * 1000);
    };

    const matchesRiskFocus = (user) => {
        if (identityRiskFocus === 'all') return true;
        if (identityRiskFocus === 'high-risk-users') return String(user.riskLevel || '').toUpperCase() === 'HIGH';
        if (identityRiskFocus === 'privileged-without-mfa') return isUserPrivileged(user) && !user.mfaEnabled;
        if (identityRiskFocus === 'active-users-24h') return isUserActive24h(user);
        return true;
    };

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
            
            const matchesRisk = matchesRiskFocus(user);
            row.style.display = (matchesSearch && matchesTypeFilter && matchesRisk) ? '' : 'none';
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
            identityRiskFocus = 'all';
            document.querySelectorAll('.sunbird-summary-card.risk-filter-active').forEach(card => {
                card.classList.remove('risk-filter-active');
            });
            applyFilters();
        });
    }
    
    // Back button functionality
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            resetDashboard();
        });
    }

    // Expose for summary risk quick filters
    window.applyIdentityRiskFilters = applyFilters;

    if (pendingIdentityRiskFocus !== 'all') {
        identityRiskFocus = pendingIdentityRiskFocus;
        const targetCard = document.querySelector(`.sunbird-summary-card[data-risk-filter="${pendingIdentityRiskFocus}"]`);
        if (targetCard) {
            document.querySelectorAll('.sunbird-summary-card[data-risk-filter]').forEach(c => c.classList.remove('risk-filter-active'));
            targetCard.classList.add('risk-filter-active');
        }
        pendingIdentityRiskFocus = 'all';
        applyFilters();
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
        renderSunbirdRoleDistributionChart();
        
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
                <h4 style="margin: 0 0 12px 0; font-size: 0.95rem; color: #e0e0e0; font-weight: 200;">📋 Recommended Actions:</h4>
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
    setupSunbirdRiskQuickFilters();
}

function setupSunbirdRiskQuickFilters() {
    const cards = document.querySelectorAll('.sunbird-summary-card[data-risk-filter]');
    cards.forEach(card => {
        card.onclick = () => {
            const filterKey = card.dataset.riskFilter || 'all';

            if (identityRiskFocus === filterKey) {
                identityRiskFocus = 'all';
                card.classList.remove('risk-filter-active');
            } else {
                identityRiskFocus = filterKey;
                document.querySelectorAll('.sunbird-summary-card[data-risk-filter]').forEach(c => c.classList.remove('risk-filter-active'));
                card.classList.add('risk-filter-active');
            }

            if (typeof window.applyIdentityRiskFilters === 'function') {
                window.applyIdentityRiskFilters();
            }
        };
    });
}

function collectSunbirdRiskItems() {
    const rawItems = [];

    const pushItem = (tab, risk, severity, insight) => {
        rawItems.push({ tab, risk, severity, insight });
    };

    if (sunbirdDashboardData?.summary) {
        const summary = sunbirdDashboardData.summary;
        pushItem('Identity Protection', 'Privileged Without MFA', 'high', `${summary.privilegedUsersWithoutMFA || 0} privileged accounts without MFA.`);
        pushItem('Identity Protection', 'High Risk Users', 'high', `${summary.highRiskUsers || 0} users classified as HIGH risk.`);
        pushItem('Identity Protection', 'Active Users (24h)', 'medium', `${summary.activeUsers24h || 0} users active in the last 24 hours.`);
    }

    if (cachedSunbirdSecurityData?.summary) {
        const sec = cachedSunbirdSecurityData.summary;
        pushItem('Security Alerts', 'High Severity Alerts', 'high', `${sec.highSeverityAlerts || 0} high severity alerts currently open.`);
        pushItem('Security Alerts', 'Active Incidents', 'high', `${sec.activeIncidents || 0} active incidents require investigation.`);
    }

    if (cachedSunbirdBackupData?.summary) {
        const backup = cachedSunbirdBackupData.summary;
        pushItem('Backup & Recovery', 'Storage Growth Risk', 'medium', `${backup.totalStorageGB || 0} GB protected storage to monitor for growth.`);
        pushItem('Backup & Recovery', 'Coverage Risk', 'medium', `${backup.activeUsersCount || 0} active users currently included in coverage.`);
    }

    // Include all project-card level risk footers so we don't miss existing risk hints.
    mockProjects.forEach(project => {
        const footer = project.cardFooter || '';
        if (/risk|risks|threat|alert/i.test(footer)) {
            const severity = /high|critical/i.test(footer) ? 'high' : /medium/i.test(footer) ? 'medium' : 'low';
            pushItem(project.name, 'Card Risk Summary', severity, footer);
        }
    });

    const normalizeTab = (tab) => {
        if (tab === 'Identity Protection') return 'Identity Protection';
        if (tab === 'Security Alerts') return 'Security Alerts';
        if (tab === 'Backup & Recovery') return 'Backup & Recovery';
        return 'Applications/Others';
    };

    const dedupMap = new Map();
    rawItems.forEach(item => {
        const tab = normalizeTab(item.tab);
        const key = `${tab}|${item.risk}`.toLowerCase();
        const existing = dedupMap.get(key);

        if (!existing) {
            dedupMap.set(key, {
                tab,
                risk: item.risk,
                severity: item.severity,
                insights: [item.insight]
            });
            return;
        }

        // Keep highest severity across duplicates.
        const rank = { high: 3, medium: 2, low: 1 };
        if ((rank[item.severity] || 0) > (rank[existing.severity] || 0)) {
            existing.severity = item.severity;
        }

        if (!existing.insights.includes(item.insight)) {
            existing.insights.push(item.insight);
        }
    });

    const tabOrder = {
        'Identity Protection': 1,
        'Security Alerts': 2,
        'Backup & Recovery': 3,
        'Applications/Others': 4
    };
    const severityRank = { high: 1, medium: 2, low: 3 };

    return Array.from(dedupMap.values())
        .map(item => ({
            tab: item.tab,
            risk: item.risk,
            severity: item.severity,
            insight: item.insights.join(' ')
        }))
        .sort((a, b) =>
            (tabOrder[a.tab] || 99) - (tabOrder[b.tab] || 99) ||
            (severityRank[a.severity] || 99) - (severityRank[b.severity] || 99) ||
            a.risk.localeCompare(b.risk)
        );
}

window.viewRiskFromRegister = function(encodedTab, encodedRisk) {
    const tab = decodeURIComponent(encodedTab || '');
    const risk = decodeURIComponent(encodedRisk || '');

    if (tab === 'Identity Protection') {
        const identityProject = mockProjects.find(p => p.id === 2 || p.isIdentityCard);
        if (identityProject) {
            if (/privileged without mfa/i.test(risk)) {
                pendingIdentityRiskFocus = 'privileged-without-mfa';
            } else if (/high risk users/i.test(risk)) {
                pendingIdentityRiskFocus = 'high-risk-users';
            } else if (/active users/i.test(risk)) {
                pendingIdentityRiskFocus = 'active-users-24h';
            } else {
                pendingIdentityRiskFocus = 'all';
            }
            viewProjectDashboard(identityProject);
        }
        return;
    }

    if (tab === 'Security Alerts') {
        const secProject = mockProjects.find(p => p.isSecurityCard);
        if (secProject) viewProjectDashboard(secProject);
        return;
    }

    if (tab === 'Backup & Recovery') {
        const backupProject = mockProjects.find(p => p.isBackupRecoveryCard);
        if (backupProject) viewProjectDashboard(backupProject);
        return;
    }

    // Applications / other project card summaries
    const appProject = mockProjects.find(p => p.isApplicationsCard) || mockProjects.find(p => p.name === 'Applications');
    if (appProject) {
        viewProjectDashboard(appProject);
    }
};

async function renderSunbirdRisksView(forceRefresh = false) {
    const billingCard = document.getElementById('billing-card');
    if (!billingCard) return;
    if (!isSunbirdBillingViewActive('risks')) return;

    try {
        billingCard.innerHTML = renderSunbirdPremiumLoader('Loading risk register');

        // Pull latest risk sources where available.
        if (forceRefresh || !cachedSunbirdSecurityData) {
            try { cachedSunbirdSecurityData = await fetchSunbirdSecurityEventsData(); } catch (_) {}
        }
        if (forceRefresh || !cachedSunbirdBackupData) {
            try { cachedSunbirdBackupData = await fetchSunbirdBackupRecoveryData(); } catch (_) {}
        }
        if (!sunbirdDashboardData) {
            try { await fetchIdentityAccessData(); } catch (_) {}
        }

        const riskItems = collectSunbirdRiskItems();
        const rowsHtml = riskItems.length
            ? riskItems.map(item => `
                <tr>
                    <td>${item.tab}</td>
                    <td>${item.risk}</td>
                    <td><span class="sunbird-risk-pill ${item.severity}">${item.severity.toUpperCase()}</span></td>
                    <td>${item.insight}</td>
                    <td>
                        <button class="sunbird-risk-view-btn" onclick="window.viewRiskFromRegister('${encodeURIComponent(item.tab)}','${encodeURIComponent(item.risk)}')">
                            View
                        </button>
                    </td>
                </tr>
            `).join('')
            : '<tr><td colspan="5" class="sunbird-empty-row">No risks available</td></tr>';

        if (!isSunbirdBillingViewActive('risks')) return;
        billingCard.innerHTML = `
            <div class="sunbird-panel-view">
                <div class="billing-card-header">
                    <i class="fas fa-triangle-exclamation"></i>
                    <h3>Risks Register</h3>
                </div>
                <div class="sunbird-section-title">All Risks by Tab</div>
                <div class="sunbird-risk-list-wrap">
                    <table class="sunbird-incidents-table sunbird-risk-table">
                        <thead>
                            <tr>
                                <th>Tab</th>
                                <th>Risk</th>
                                <th>Severity</th>
                                <th>Insight</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>${rowsHtml}</tbody>
                    </table>
                </div>
            </div>
        `;
    } finally {
        ensureSunbirdBillingCardDimensions();
        syncSunbirdLeftMenuHeight();
    }
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

// 🆕 Render Sunbird Role Distribution Chart
function renderSunbirdRoleDistributionChart() {
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
    const backBtnsGeneric = document.querySelectorAll('[id="btn-back"]');
    const passwordToggle = document.getElementById('password-toggle');
    const navPrev = document.getElementById('nav-prev');
    const navNext = document.getElementById('nav-next');
    const sidePeekPrev = document.getElementById('side-peek-prev');
    const sidePeekNext = document.getElementById('side-peek-next');
    const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
    const mobileNavClose = document.getElementById('mobile-nav-close');
    const mobileNav = document.getElementById('mobile-nav');
    const btnLogoutMobile = document.getElementById('btn-logout-mobile');
    const verifyMfaBtn = document.getElementById('verify-mfa-btn');
    const resendCodeLink = document.getElementById('resend-code-link');
    const backToLoginLink = document.getElementById('back-to-login');
    const backBtnDevices = document.getElementById('btn-back-devices');
    const backBtnSecurity = document.getElementById('btn-back-security');
    const backBtnEmailSecurity = document.getElementById('btn-back-email-security') || document.getElementById('btn-back-email');
    const backBtnBackupRecovery = document.getElementById('btn-back-backup-recovery');

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

    if (backBtnsGeneric.length) {
        backBtnsGeneric.forEach(btn => btn.addEventListener('click', goBackToProjects));
    } else if (backBtn) {
        backBtn.addEventListener('click', goBackToProjects);
    }

    // Back buttons for full dashboards (non-generic views)
    if (backBtnDevices) backBtnDevices.addEventListener('click', goBackToProjects);
    if (backBtnSecurity) backBtnSecurity.addEventListener('click', goBackToProjects);
    if (backBtnEmailSecurity) backBtnEmailSecurity.addEventListener('click', goBackToProjects);
    if (backBtnBackupRecovery) backBtnBackupRecovery.addEventListener('click', goBackToProjects);

    if (passwordToggle) {
        passwordToggle.addEventListener('click', togglePasswordVisibility);
    }

    if (navPrev) {
        navPrev.addEventListener('click', goToPreviousProject);
    }

    if (navNext) {
        navNext.addEventListener('click', goToNextProject);
    }

    if (sidePeekPrev) {
        sidePeekPrev.addEventListener('click', goToPreviousProject);
    }

    if (sidePeekNext) {
        sidePeekNext.addEventListener('click', goToNextProject);
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
            if (data.user) {
                localStorage.setItem('user', JSON.stringify(data.user));
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
            
            // Update Sunbird logo visibility
            updateSunbirdLogoVisibility();
            
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

                // Reset forms
                if (loginForm) loginForm.reset();
                mfaCodeInput.value = '';
                if (loginForm) loginForm.style.display = 'block';
                if (mfaSection) mfaSection.style.display = 'none';
                
                // Reload dashboard data now that token/session are set.
                bootstrapDashboardDataAfterLogin();
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
    localStorage.removeItem('user');

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
        
        // Update Sunbird logo visibility
        updateSunbirdLogoVisibility();
        
        // Load billing card if user is logged in
        bootstrapDashboardDataAfterLogin();
        
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
    const requestId = ++identityFetchRequestId;
    const isStaleRequest = () => requestId !== identityFetchRequestId;
    try {
        const identityProjectForState = mockProjects.find(p => p.id === 2);
        if (identityProjectForState) {
            identityProjectForState.status = 'loading';
            displayCurrentProject();
        }

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
                if (isStaleRequest()) return;
                if (sunbirdData.success) {
                    console.log('[Identity Access] Sunbird dashboard loaded successfully');
                    isSunbirdDashboard = true;
                    sunbirdDashboardData = sunbirdData;
                    
                    // Map Sunbird data to existing global variables and ENRICH with missing fields
                    microsoftUsersData = (sunbirdData.users || []).map(user => ({
                        // Core identity fields
                        id: user.id,
                        displayName: user.displayName,
                        mail: user.mail,
                        userPrincipalName: user.userPrincipalName,
                        jobTitle: user.jobTitle,
                        mobilePhone: user.mobilePhone,
                        isExternal: user.isExternal,
                        
                        // Roles (from Sunbird)
                        roles: user.roles || [],
                        
                        // MFA fields (from Sunbird)
                        mfaEnabled: toBooleanMfa(user.mfaEnabled),
                        authMethodCount: user.authMethods?.length || user.authMethodCount || 0,
                        authMethods: user.authMethods || [],
                        
                        // Risk assessment (from Sunbird)
                        riskLevel: user.riskLevel || 'SAFE',
                        
                        // Sign-in and location data (from Sunbird)
                        lastSignIn: {
                            dateTime: user.lastSignIn?.dateTime || user.latestSignInDateTime || null,
                            location: user.lastSignIn?.location || user.signInLocation || 'Unknown',
                            device: user.lastSignIn?.device || user.deviceDetail?.displayName || user.deviceName || 'Unknown Device',
                            ipAddress: user.lastSignIn?.ipAddress || user.ipAddress || 'N/A'
                        },
                        
                        // Status fields (from Sunbird)
                        accountEnabled: user.accountEnabled !== false,
                        
                        // Preserve any additional Sunbird-specific fields
                        ...user
                    }));
                    if (isStaleRequest()) return;
                    
                    console.log('[Identity Access] Sunbird users enriched with MFA, Risk, and Sign-in data');
                    console.log('[Identity Access] Sample enriched user:', microsoftUsersData[0]);
                    console.log('[Identity Access] Sample roles:', microsoftUsersData[0]?.roles);
                    console.log('[Identity Access] Sample jobTitle:', microsoftUsersData[0]?.jobTitle);
                    
                    // Detailed logging for first 3 users
                    microsoftUsersData.slice(0, 3).forEach((user, idx) => {
                        console.log(`[Identity Access] User ${idx}: ${user.displayName} - roles:`, user.roles, 'jobTitle:', user.jobTitle);
                    });
                    
                    // Build role map from enriched users
                    userRolesMap = {};
                    microsoftUsersData.forEach(user => {
                        if (user.roles && user.roles.length > 0) {
                            userRolesMap[user.id] = user.roles.map(r => typeof r === 'string' ? r : (r?.name || 'Unknown Role'));
                        }
                    });
                    
                    // Build mock roles data for compatibility
                    microsoftRolesData = [];
                    microsoftUsersData.forEach(user => {
                        if (user.roles && user.roles.length > 0) {
                            user.roles.forEach(role => {
                                const roleName = typeof role === 'string' ? role : (role?.name || 'Unknown Role');
                                microsoftRolesData.push({
                                    id: role?.id || `role-${roleName}`,
                                    principalId: user.id,
                                    roleName: roleName
                                });
                            });
                        }
                    });
                    
                    console.log('[Identity Access] Sunbird data mapped to globals');
                    console.log(`[Identity Access] Enriched ${microsoftUsersData.length} users with roles, MFA, risk, and sign-in data`);
                    
                    // Update card with Sunbird metrics
                    const identityProject = mockProjects.find(p => p.id === 2);
                    if (identityProject) {
                        const usersWithoutMfa = (sunbirdData.users || []).filter(user => !user.mfaEnabled).length;
                        identityProject.cardMetrics = [
                            { label: "Total Users", value: `: ${sunbirdData.summary.totalUsers}`, icon: "fas fa-users" },
                            { label: "Active (24h)", value: `: ${sunbirdData.summary.activeUsers24h}`, icon: "fas fa-user-check" },
                            { label: "Admin Roles", value: `: ${sunbirdData.summary.adminUsers}`, icon: "fas fa-crown" },
                            { label: "Security Score", value: `: ${sunbirdData.summary.securityScore}`, icon: "fas fa-shield-alt" }
                        ];
                        identityProject.status = 'active';
                        identityProject.cardFooter = usersWithoutMfa > 0 ? `${usersWithoutMfa} users without MFA` : 'All users secured';
                        identityProject.lastUpdate = new Date().toLocaleTimeString();
                        displayCurrentProject();
                    }

                    // If Identity dashboard view is open, reinitialize immediately with fresh data.
                    const dashboardView = document.getElementById('dashboard-view');
                    const projectName = document.getElementById('project-name');
                    const isIdentityOpen = dashboardView &&
                        dashboardView.style.display !== 'none' &&
                        String(projectName?.textContent || '').toLowerCase().includes('identity protection');
                    if (isIdentityOpen) {
                        console.log('[Identity Access] Identity dashboard open, reinitializing with fresh data');
                        setTimeout(() => initializeIdentityDashboard(), 100);
                    }
                    
                    return; // Skip to end - Sunbird data fully loaded
                }
            }
        } catch (sunbirdError) {
            console.log('[Identity Access] Sunbird endpoint not available, falling back to standard API');
        }

        // Fallback: load users first for fast paint, enrich in background.
        console.log('[Identity Access] Fast-loading cached identity users first...');
        const usersStart = performance.now();
        const usersResponse = await fetch('/api/db/identity-details', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        if (isStaleRequest()) return;
        if (!usersResponse.ok) {
            const errData = await usersResponse.json().catch(() => ({}));
            throw new Error(errData.message || `Users API failed: ${usersResponse.status}`);
        }
        const usersData = await usersResponse.json();
        if (isStaleRequest()) return;
        if (!usersData.success || !Array.isArray(usersData.users)) {
            throw new Error(usersData.message || 'Invalid users response format');
        }
        microsoftUsersData = usersData.users || [];
        console.log(`[Identity Access] ✓ Loaded ${microsoftUsersData.length} users (${(performance.now() - usersStart).toFixed(0)}ms)`);

        // Fast card update before enrichers complete.
        const identityProjectQuick = mockProjects.find(p => p.id === 2);
        if (identityProjectQuick) {
            identityProjectQuick.cardMetrics = [
                { label: "Total Users", value: `: ${microsoftUsersData.length}`, icon: "fas fa-users" },
                { label: "Active (24h)", value: ": ...", icon: "fas fa-user-check" },
                { label: "Admin Roles", value: ": ...", icon: "fas fa-crown" },
                { label: "Security Score", value: ": ...", icon: "fas fa-shield-alt" }
            ];
            identityProjectQuick.status = 'active';
            identityProjectQuick.cardFooter = `Users loaded: ${microsoftUsersData.length} | Enriching...`;
            identityProjectQuick.lastUpdate = new Date().toLocaleTimeString();
            displayCurrentProject();
            const isIdentityOpenQuick = document.getElementById('dashboard-view')?.style.display !== 'none' &&
                String(document.getElementById('project-name')?.textContent || '').toLowerCase().includes('identity protection');
            if (isIdentityOpenQuick) {
                setTimeout(() => initializeIdentityDashboard(), 30);
            }
        }

        // Background enrichers
        const startTime = performance.now();
        const [rolesResult, mfaResult, signInResult] = await Promise.allSettled([
            fetch('/api/microsoft-roles', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }),
            fetch('/api/user-mfa-status', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }),
            fetch('/api/sign-in-logs', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            })
        ]);
        if (isStaleRequest()) return;
        const loadTime = performance.now() - startTime;
        console.log(`[Identity Access] Enrichment API calls completed in ${loadTime.toFixed(0)}ms`);

        // Process Roles - OPTIONAL
        if (rolesResult.status === 'fulfilled' && rolesResult.value.ok) {
            try {
                const rolesData = await rolesResult.value.json();
                if (isStaleRequest()) return;
                if (rolesData.success && rolesData.roleAssignments) {
                    microsoftRolesData = rolesData.roleAssignments || [];
                    buildUserRolesMap();
                    console.log(`[Identity Access] ✓ Loaded ${microsoftRolesData.length} role assignments`);
                }
            } catch (e) {
                console.warn('[Identity Access] Could not process roles:', e.message);
            }
        } else {
            console.warn('[Identity Access] ⚠ Roles API unavailable');
        }

        // Process MFA Status - OPTIONAL (Enriches existing users)
        if (mfaResult.status === 'fulfilled' && mfaResult.value.ok) {
            try {
                const mfaData = await mfaResult.value.json();
                if (isStaleRequest()) return;
                if (mfaData.success && mfaData.mfaStatus) {
                    // Merge MFA data into user objects
                    mfaData.mfaStatus.forEach(mfaInfo => {
                        const user = microsoftUsersData.find(u => u.id === mfaInfo.userId);
                        if (user) {
                            user.mfaEnabled = toBooleanMfa(mfaInfo.mfaEnabled);
                            user.authMethodCount = mfaInfo.authMethodCount || 0;
                            user.authMethods = mfaInfo.authMethods || [];
                        }
                    });
                    console.log(`[Identity Access] ✓ Enriched ${mfaData.mfaStatus.length} users with MFA data`);
                }
            } catch (e) {
                console.warn('[Identity Access] ⚠ Could not process MFA data:', e.message);
            }
        } else {
            console.warn('[Identity Access] ⚠ MFA API unavailable - using defaults');
            // Set default MFA status if API unavailable
            microsoftUsersData.forEach(user => {
                if (user.mfaEnabled === undefined) user.mfaEnabled = false;
                user.mfaEnabled = toBooleanMfa(user.mfaEnabled);
                if (user.authMethodCount === undefined) user.authMethodCount = 0;
            });
        }

        // Process Sign-In Logs - OPTIONAL (Enriches user activity)
        if (signInResult.status === 'fulfilled' && signInResult.value.ok) {
            try {
                const signInData = await signInResult.value.json();
                if (isStaleRequest()) return;
                if (signInData.success && signInData.signInLogs) {
                    // Merge sign-in data into user objects
                    const userSignInMap = {}; // userId -> latest sign-in
                    signInData.signInLogs.forEach(log => {
                        const userId = log.userId;
                        if (!userSignInMap[userId] || new Date(log.createdDateTime) > new Date(userSignInMap[userId].createdDateTime)) {
                            userSignInMap[userId] = log;
                        }
                    });
                    
                    // Update users with latest sign-in info
                    microsoftUsersData.forEach(user => {
                        if (userSignInMap[user.id]) {
                            const signIn = userSignInMap[user.id];
                            user.lastSignIn = {
                                dateTime: signIn.createdDateTime,
                                location: signIn.location || 'Unknown',
                                device: signIn.deviceDetail?.displayName || 'Unknown Device',
                                ipAddress: signIn.ipAddress || 'N/A'
                            };
                        } else {
                            user.lastSignIn = {
                                dateTime: null,
                                location: 'No sign-in',
                                device: 'Unknown',
                                ipAddress: 'N/A'
                            };
                        }
                    });
                    console.log(`[Identity Access] ✓ Enriched sign-in data for ${Object.keys(userSignInMap).length} users`);
                }
            } catch (e) {
                console.warn('[Identity Access] ⚠ Could not process sign-in logs:', e.message);
            }
        } else {
            console.warn('[Identity Access] ⚠ Sign-In Logs API unavailable');
            // Set default sign-in status
            microsoftUsersData.forEach(user => {
                if (!user.lastSignIn) {
                    user.lastSignIn = {
                        dateTime: null,
                        location: 'Unknown',
                        device: 'Unknown',
                        ipAddress: 'N/A'
                    };
                }
            });
        }

        // Calculate risk levels for users (local computation)
        microsoftUsersData.forEach(user => {
            let riskLevel = 'SAFE';
            const isAdmin = !!userRolesMap[user.id];
            const hasOldSignIn = user.lastSignIn && user.lastSignIn.dateTime 
                ? ((Date.now() - new Date(user.lastSignIn.dateTime).getTime()) > 30 * 24 * 60 * 60 * 1000) 
                : false;
            const missingMFA = isAdmin && !user.mfaEnabled;
            
            if (missingMFA || hasOldSignIn) {
                riskLevel = 'HIGH';
            } else if (user.isExternal || (user.authMethodCount && user.authMethodCount === 1)) {
                riskLevel = 'MEDIUM';
            }
            
            user.riskLevel = riskLevel;
        });
        console.log('[Identity Access] ✓ Risk levels calculated for all users');

        // Update the  Identity Protection project card with real data
        const identityProject = mockProjects.find(p => p.id === 2);
        if (identityProject) {
            const externalUsers = microsoftUsersData.filter(u => u.isExternal).length;
            const adminsCount = Object.keys(userRolesMap).length;
            const active24h = microsoftUsersData.filter(u => {
                const dt = u?.lastSignIn?.dateTime ? new Date(u.lastSignIn.dateTime).getTime() : 0;
                if (!dt) return false;
                return (Date.now() - dt) <= (24 * 60 * 60 * 1000);
            }).length;
            const usersWithoutMfa = microsoftUsersData.filter(u => !u.mfaEnabled).length;
            
            identityProject.cardMetrics = [
                { label: "Total Users", value: `: ${microsoftUsersData.length}`, icon: "fas fa-users" },
                { label: "Active (24h)", value: `: ${active24h}`, icon: "fas fa-user-check" },
                { label: "Admin Roles", value: `: ${adminsCount}`, icon: "fas fa-crown" },
                { label: "Security Score", value: `: ${Math.max(0, 100 - (externalUsers + usersWithoutMfa))}`, icon: "fas fa-shield-alt" }
            ];
            identityProject.status = 'active';
            identityProject.cardFooter = usersWithoutMfa > 0 ? `${usersWithoutMfa} users without MFA` : 'All users secured';
            identityProject.lastUpdate = new Date().toLocaleTimeString();
            
            // Refresh the display to show updated data
            displayCurrentProject();
            console.log('[Identity Access] Card updated with real user data');
        }
        if (isStaleRequest()) return;

        // If Identity dashboard view is open, reinitialize with updated fallback data.
        const dashboardView = document.getElementById('dashboard-view');
        const projectName = document.getElementById('project-name');
        const isIdentityOpen = dashboardView &&
            dashboardView.style.display !== 'none' &&
            String(projectName?.textContent || '').toLowerCase().includes('identity protection');
        if (isIdentityOpen) {
            setTimeout(() => initializeIdentityDashboard(), 100);
        }

    } catch (error) {
        console.error('[Identity Access] Error fetching data:', error.message);
        const identityProject = mockProjects.find(p => p.id === 2);
        if (identityProject) {
            identityProject.status = 'error';
            identityProject.cardFooter = 'Data unavailable';
            displayCurrentProject();
        }
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
        duoProject.cardFooter = `Tier: ${data.edition || 'Unknown'}`;
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
                    <div class="btn-back">
                        <div class="glow-wrap">
                            <div class="glowing-border-layer"></div>
                            <button id="btn-back-identity" class="btn-back-identity">
                                <i class="fas fa-arrow-left"></i> Back
                            </button>
                        </div>
                    </div>
                    <h2 class="identity-dashboard-title"> Identity Protection - Dashboard</h2>
                </div>
            </div>

            <!-- Overview Stats (Key Metrics) -->
            <div class="identity-stats-cards">
                <div class="identity-stat-card">
                    <div class="stat-card-icon" style="background: rgba(255, 255, 255, 0.2); color: #ffffff;">
                        <i class="fas fa-users"></i>
                    </div>
                    <div class="stat-card-content">
                        <div class="stat-card-label">Total Users</div>
                        <div class="stat-card-value">${totalUsers}</div>
                    </div>
                </div>

                <div class="identity-stat-card">
                    <div class="stat-card-icon" style="background: rgba(0, 230, 118, 0.2); color: #00e676;">
                        <i class="fas fa-user-tie"></i>
                    </div>
                    <div class="stat-card-content">
                        <div class="stat-card-label">Internal Users</div>
                        <div class="stat-card-value">${internalUsers}</div>
                    </div>
                </div>

                <div class="identity-stat-card">
                    <div class="stat-card-icon" style="background: rgba(255, 152, 0, 0.2); color: #ff9800;">
                        <i class="fas fa-user-secret"></i>
                    </div>
                    <div class="stat-card-content">
                        <div class="stat-card-label">External Users</div>
                        <div class="stat-card-value">${externalUsers}</div>
                    </div>
                </div>

                <div class="identity-stat-card">
                    <div class="stat-card-icon" style="background: rgba(0, 230, 118, 0.2); color: #00e676;">
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
                    <div class="sunbird-summary-card" data-risk-filter="active-users-24h">
                        <div class="summary-card-icon" style="background: rgba(255, 255, 255, 0.2); color: #ffffff;">
                            <i class="fas fa-shield-alt"></i>
                        </div>
                        <div class="summary-card-content">
                            <div class="summary-card-label">Security Score</div>
                            <div class="summary-card-value" id="sunbird-security-score">0</div>
                            <div class="summary-card-subtext">/100</div>
                        </div>
                    </div>

                    <div class="sunbird-summary-card" data-risk-filter="high-risk-users">
                        <div class="summary-card-icon" style="background: rgba(0, 230, 118, 0.2); color: #00e676;">
                            <i class="fas fa-user-check"></i>
                        </div>
                        <div class="summary-card-content">
                            <div class="summary-card-label">Active Users (24h)</div>
                            <div class="summary-card-value" id="sunbird-active-users">0</div>
                        </div>
                    </div>

                    <div class="sunbird-summary-card" data-risk-filter="privileged-without-mfa">
                        <div class="summary-card-icon" style="background: rgba(255, 77, 77, 0.2); color: #ff4d4d;">
                            <i class="fas fa-exclamation-circle"></i>
                        </div>
                        <div class="summary-card-content">
                            <div class="summary-card-label">High Risk Users</div>
                            <div class="summary-card-value" id="sunbird-high-risk">0</div>
                        </div>
                    </div>

                    <div class="sunbird-summary-card">
                        <div class="summary-card-icon" style="background: rgba(255, 152, 0, 0.2); color: #ff9800;">
                            <i class="fas fa-user-clock"></i>
                        </div>
                        <div class="summary-card-content">
                            <div class="summary-card-label">Inactive (30+ days)</div>
                            <div class="summary-card-value" id="sunbird-inactive-users">0</div>
                        </div>
                    </div>

                    <div class="sunbird-summary-card">
                        <div class="summary-card-icon" style="background: rgba(255, 77, 77, 0.2); color: #ff4d4d;">
                            <i class="fas fa-lock"></i>
                        </div>
                        <div class="summary-card-content">
                            <div class="summary-card-label">🚨 Privileged Without MFA</div>
                            <div class="summary-card-value" id="sunbird-privileged-without-mfa">0</div>
                        </div>
                    </div>

                    <div class="sunbird-summary-card">
                        <div class="summary-card-icon" style="background: rgba(255, 152, 0, 0.2); color: #ff9800;">
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
    if (table) {
        const thead = table.querySelector('thead tr');
        if (thead) {
            if (isSunbirdDashboard) {
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
            } else {
                thead.innerHTML = `
                    <th>Name</th>
                    <th>Email</th>
                    <th>Job Title</th>
                    <th>Phone</th>
                    <th>Roles</th>
                    <th>Type</th>
                    <th>Status</th>
                `;
            }
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
    
    const carouselProjects = getFilteredProjects();
    document.getElementById('project-total').textContent = carouselProjects.length;
    
    // For Sunbird users, start at index 1 (Identity Protection centered) and disable navigation
    if (isSunbirdUser()) {
        currentProjectIndex = 1;
    } else {
        currentProjectIndex = 0;
    }
    
    selectedProjectId = null;
    previewLockedByClick = false;
    
    displayCurrentProject();
    updateNavigationButtons(); // Update button states after setting index
    
    const token = localStorage.getItem('authToken');
    const isLoggedIn = sessionStorage.getItem('isLoggedIn') === 'true';
    if (token && isLoggedIn) {
        fetchDuoStats();
        fetchIdentityAccessData(); // Fetch Microsoft Graph users for the card preview
        fetchApplicationsData(); // Fetch Applications data for the card preview
        fetchDevicesCardData();
        fetchEmailCardData();
    }
}

function displayCurrentProject() {
    const carouselProjects = getFilteredProjects();
    if (carouselProjects.length === 0) return;
    
    const projectsGrid = document.getElementById('projects-grid');
    projectsGrid.innerHTML = '';
    
    // Display 3 projects at a time
    const visibleProjects = carouselProjects.slice(currentProjectIndex, currentProjectIndex + 3);
    
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

    renderSidePeekCards();
    
    document.getElementById('project-current').textContent = currentProjectIndex + 1;
    
    updateNavigationButtons();
}

function renderSidePeekCards() {
    const carouselProjects = getFilteredProjects();
    const sidePeekPrev = document.getElementById('side-peek-prev');
    const sidePeekNext = document.getElementById('side-peek-next');
    const sidePeekPrevCard = document.getElementById('side-peek-prev-card');
    const sidePeekNextCard = document.getElementById('side-peek-next-card');

    if (!sidePeekPrevCard || !sidePeekNextCard || !sidePeekPrev || !sidePeekNext) return;

    sidePeekPrevCard.innerHTML = '';
    sidePeekNextCard.innerHTML = '';

    const prevProject = carouselProjects[currentProjectIndex - 1];
    const nextProject = carouselProjects[currentProjectIndex + 3];

    if (prevProject) {
        const prevCard = createProjectCard(prevProject);
        prevCard.classList.add('no-interaction');
        sidePeekPrevCard.appendChild(prevCard);
    }

    if (nextProject) {
        const nextCard = createProjectCard(nextProject);
        nextCard.classList.add('no-interaction');
        sidePeekNextCard.appendChild(nextCard);
    }

    sidePeekPrev.classList.toggle('is-empty', !prevProject);
    sidePeekNext.classList.toggle('is-empty', !nextProject);

    // Sync sizing on next frame and with a small delay to ensure DOM is ready
    setTimeout(() => {
        syncSidePeekCardSizing();
    }, 10);
}

function syncSidePeekCardSizing() {
    const shell = document.querySelector('.projects-carousel-shell');
    const mainCard = document.querySelector('#projects-grid .project-card');
    if (!shell || !mainCard) return;

    const mainCardWidth = mainCard.getBoundingClientRect().width;
    const mainCardHeight = mainCard.getBoundingClientRect().height;
    if (mainCardHeight <= 0 || mainCardWidth <= 0) return;

    // Match side cards to main project card size.
    shell.style.setProperty('--side-peek-card-width', `${Math.round(mainCardWidth)}px`);
    shell.style.setProperty('--side-peek-card-height', `${Math.round(mainCardHeight)}px`);
}

function goToPreviousProject() {
    // Sunbird users cannot navigate (locked view)
    if (isSunbirdUser()) return;
    
    if (currentProjectIndex > 0) {
        currentProjectIndex--;
        previewLockedByClick = false;
        selectedProjectId = null;
        displayCurrentProject();
    }
}

function goToNextProject() {
    // Sunbird users cannot navigate (locked view)
    if (isSunbirdUser()) return;
    
    const carouselProjects = getFilteredProjects();
    const maxStartIndex = Math.max(0, carouselProjects.length - 3);
    if (currentProjectIndex < maxStartIndex) {
        currentProjectIndex++;
        previewLockedByClick = false;
        selectedProjectId = null;
        displayCurrentProject();
    }
}

function updateNavigationButtons() {
    const carouselProjects = getFilteredProjects();
    const navPrev = document.getElementById('nav-prev');
    const navNext = document.getElementById('nav-next');
    const sidePeekPrev = document.getElementById('side-peek-prev');
    const sidePeekNext = document.getElementById('side-peek-next');

    // For Sunbird users, always disable navigation buttons (locked view)
    if (isSunbirdUser()) {
        if (navPrev) navPrev.disabled = true;
        if (navNext) navNext.disabled = true;
        if (sidePeekPrev) sidePeekPrev.disabled = true;
        if (sidePeekNext) sidePeekNext.disabled = true;
        return;
    }

    const maxStartIndex = Math.max(0, carouselProjects.length - 3);
    const disablePrev = currentProjectIndex === 0;
    const disableNext = currentProjectIndex >= maxStartIndex;

    if (navPrev) navPrev.disabled = disablePrev;
    if (navNext) navNext.disabled = disableNext;
    if (sidePeekPrev) sidePeekPrev.disabled = disablePrev;
    if (sidePeekNext) sidePeekNext.disabled = disableNext;
}

function showProjectPreview(project) {
    let previewSection = document.getElementById('project-preview-section');
    previewSection.classList.add('visible');

    const previewModel = buildProjectPreviewModel(project);
    const topMetricsHTML = previewModel.topMetrics.map(metric => `
        <div class="preview-stat-item">
            <div class="preview-stat-icon ${metric.tone || 'info'}">
                <i class="${metric.icon}"></i>
            </div>
            <div class="preview-stat-info">
                <span class="preview-stat-label">${metric.label}</span>
                <span class="preview-stat-value">${metric.value}</span>
            </div>
        </div>
    `).join('');

    const riskBreakdownHTML = previewModel.riskBreakdown.map(item => `
        <div class="risk-item ${item.tone}">
            <span class="risk-label">${item.label}</span>
            <span class="risk-value">${item.value}</span>
        </div>
    `).join('');

    const feedHTML = (previewModel.miniFeed || []).slice(0, 3).map(item => `
        <div class="preview-feed-item">
            <i class="${item.icon || 'fas fa-circle'}"></i>
            <span>${item.text}</span>
        </div>
    `).join('');

    previewSection.innerHTML = `
        <div class="preview-container" id="preview-container">
            <div class="preview-header">
                <h3><i class="fas fa-info-circle"></i> ${project.name}</h3>
                <p class="preview-subtitle">${project.type}</p>
            </div>

            <div class="preview-row preview-row-metrics">
                ${topMetricsHTML}
            </div>

            <div class="preview-row preview-row-risk">
                <h4><i class="fas fa-chart-bar"></i> Risk Breakdown</h4>
                <div class="risk-breakdown">
                    ${riskBreakdownHTML}
                </div>
            </div>

            <div class="preview-row preview-row-insights">
                <div class="preview-insight-line">${previewModel.keyInsight}</div>
                <div class="preview-mini-feed">${feedHTML || '<div class="preview-feed-item"><i class="fas fa-check-circle"></i><span>Live activity is stable</span></div>'}</div>
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
    
    const isSummaryCard = isSummaryProjectCard(project);
    const metrics = isSummaryCard ? normalizeSummaryMetrics(project) : (project.cardMetrics || []);
    const statusMeta = getSummaryCardStatusMeta(project);

    // Build metrics section from cardMetrics array
    let metricsHTML = '';
    if (metrics.length > 0) {
        const renderMetrics = isSummaryCard ? metrics.slice(0, 4) : metrics;
        metricsHTML = renderMetrics.map(metric => {
            if (isSummaryCard && statusMeta.status === 'loading') {
                return `
                    <div class="project-info-item metric-loading">
                        <i class="${metric.icon}"></i>
                        <div class="metric-skeleton-wrap">
                            <span class="metric-skeleton-label"></span>
                            <span class="metric-skeleton-value"></span>
                        </div>
                    </div>
                `;
            }

            return `
                <div class="project-info-item">
                    <i class="${metric.icon}"></i>
                    <div class="metric-content-wrap">
                        <span class="metric-label-text">${metric.label}</span>
                        <span class="metric-value-text">${toMetricValue(metric.value)}</span>
                    </div>
                </div>
            `;
        }).join('');
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

function buildProjectPreviewModel(project) {
    if (project.isIdentityCard) return buildIdentityPreviewModel(project);
    if (project.isDevicesCard) return buildDevicesPreviewModel(project);
    if (project.isEmailSecurityCard) return buildEmailPreviewModel(project);
    if (project.isApplicationsCard) return buildApplicationsPreviewModel(project);

    return {
        topMetrics: [
            { label: 'Critical Risks', value: project.risks.critical, icon: 'fas fa-exclamation-circle', tone: 'critical' },
            { label: 'Security Score', value: `${project.securityScore}%`, icon: 'fas fa-shield-alt', tone: 'success' },
            { label: 'System Uptime', value: `${project.uptime}%`, icon: 'fas fa-server', tone: 'info' }
        ],
        riskBreakdown: [
            { label: 'High', value: project.risks.high, tone: 'critical' },
            { label: 'Medium', value: project.risks.medium, tone: 'high' },
            { label: 'Safe', value: Math.max(0, (project.securityScore || 0) - project.risks.high - project.risks.medium), tone: 'medium' }
        ],
        keyInsight: 'Security summary synced just now',
        miniFeed: []
    };
}

function buildIdentityPreviewModel() {
    const users = Array.isArray(microsoftUsersData) ? microsoftUsersData : [];
    const now = Date.now();
    const adminSet = new Set(Object.keys(userRolesMap || {}));

    users.forEach(user => {
        if ((user.roles || []).length > 0) adminSet.add(user.id);
    });

    const adminCount = adminSet.size;
    const usersWithoutMfa = users.filter(user => !user.mfaEnabled).length;
    const inactiveUsers = users.filter(user => {
        const lastSignIn = user?.signInActivity?.lastSignInDateTime;

        if (!lastSignIn) return true;

        const dt = new Date(lastSignIn).getTime();
        return (now - dt) > (30 * 24 * 60 * 60 * 1000);
    }).length;
    const highRiskUsers = users.filter(user => String(user.riskLevel || '').toUpperCase() === 'HIGH').length;
    const adminWithoutMfa = users.filter(user => adminSet.has(user.id) && !user.mfaEnabled).length;
    const mediumRiskUsers = users.filter(user => String(user.riskLevel || '').toUpperCase() === 'MEDIUM').length + Math.max(0, inactiveUsers - highRiskUsers);
    const safeUsers = Math.max(0, users.length - highRiskUsers - mediumRiskUsers);

    const recentSignIns = users
        .filter(user => user?.lastSignIn?.dateTime)
        .sort((a, b) => new Date(b.lastSignIn.dateTime) - new Date(a.lastSignIn.dateTime))
        .slice(0, 3)
        .map(user => ({
            icon: 'fas fa-sign-in-alt',
            text: `${user.displayName || 'User'} signed in from ${user?.lastSignIn?.location || 'Unknown'}`
        }));

    const keyInsight = adminWithoutMfa > 0
        ? `${adminWithoutMfa} admins do not have MFA enabled`
        : inactiveUsers > 0
            ? `${inactiveUsers} users have not signed in within 30 days`
            : 'Identity posture is stable across active users';

    return {
        topMetrics: [
            { label: 'High Risk Users', value: highRiskUsers, icon: 'fas fa-user-shield', tone: 'critical' },
            { label: 'Users Without MFA', value: usersWithoutMfa, icon: 'fas fa-key', tone: 'warning' },
            { label: 'Privileged Accounts', value: adminCount, icon: 'fas fa-crown', tone: 'info' },
            { label: 'Inactive (30+ days)', value: inactiveUsers, icon: 'fas fa-user-clock', tone: 'warning' }
        ],
        riskBreakdown: [
            { label: 'High', value: highRiskUsers + adminWithoutMfa, tone: 'critical' },
            { label: 'Medium', value: mediumRiskUsers, tone: 'high' },
            { label: 'Safe', value: safeUsers, tone: 'medium' }
        ],
        keyInsight,
        miniFeed: recentSignIns
    };
}

function buildDevicesPreviewModel() {
    
    const data = latestDevicesCardData || {};
    const summary = data.summary || {};
    const devices = Array.isArray(data.devices) ? data.devices : [];
    const totalDevices = summary.totalDevices || devices.length || 0;
    const compliantDevices = devices.filter(d => d.complianceState === 'compliant').length;
    const graceDevices = devices.filter(d => d.complianceState === 'inGracePeriod').length;
    const encryptedDevices = summary.encryptedDevices || devices.filter(d => d.isEncrypted).length;
    const nonCompliant = devices.filter(d => d.complianceState === 'noncompliant').length;
    const notEncrypted = Math.max(0, totalDevices - encryptedDevices);
    const staleDevices = data.activityBreakdown?.stale7days || 0;
    const highRisk = devices.filter(d => d.complianceState === 'noncompliant' && !d.isEncrypted).length;
    const mediumRisk = devices.filter(d => d.complianceState === 'inGracePeriod').length;
    const healthy = compliantDevices;

    const keyInsight =
        notEncrypted > 0
            ? `${notEncrypted} devices are not encrypted`
            : graceDevices > 0
            ? `${graceDevices} devices are in grace period`
            : staleDevices > 0
            ? `${staleDevices} devices have stale sync status`
            : 'Device security posture is healthy';
    const feed = (data.alerts || []).slice(0, 3).map(alert => ({
        icon: 'fas fa-laptop-medical',
        text: alert.title || alert.message || 'Device compliance updated'
    }));

    return {
        topMetrics: [
            { label: 'Total Devices', value: totalDevices, icon: 'fas fa-desktop', tone: 'info' },
            { label: 'Compliant', value: compliantDevices, icon: 'fas fa-check-circle', tone: 'success' },
            { label: 'Grace Period', value: graceDevices, icon: 'fas fa-hourglass-half', tone: 'warning' },
            { label: 'Non-Compliant', value: nonCompliant, icon: 'fas fa-times-circle', tone: 'critical' }
        ],
        riskBreakdown: [
            { label: 'High', value: highRisk, tone: 'critical' },
            { label: 'Medium', value: mediumRisk, tone: 'high' },
            { label: 'Healthy', value: healthy, tone: 'medium' }
        ],
        keyInsight,
        miniFeed: feed
    };
}

function buildEmailPreviewModel() {
    const data = latestEmailCardData || {};
    const summary = data.summary || {};
    const threatTypes = data.threats?.byType || {};
    const phishing = threatTypes.Phishing || threatTypes.phishing || 0;
    const malware = threatTypes.Malware || threatTypes.malware || 0;
    const spam = threatTypes.Spam || threatTypes.spam || 0;
    const activeThreats = summary.activeThreats || 0;
    const highSeverity = summary.highSeverityAlerts || 0;
    const targetedUsers = summary.affectedUsersCount || 0;
    const openIncidents = summary.activeIncidents || 0;
    const keyInsight = targetedUsers > 0
        ? `${targetedUsers} users targeted by email threats today`
        : highSeverity > 0
            ? 'High severity malware or phishing alert detected'
            : 'Email threat activity is currently controlled';
    const feed = (data.alerts || []).slice(0, 3).map(alert => ({
        icon: 'fas fa-bell',
        text: alert.title || alert.description || 'New email threat signal observed'
    }));

    return {
        topMetrics: [
            { label: 'Active Threats', value: activeThreats, icon: 'fas fa-radiation', tone: 'critical' },
            { label: 'High Severity Alerts', value: highSeverity, icon: 'fas fa-triangle-exclamation', tone: 'critical' },
            { label: 'Users Targeted', value: targetedUsers, icon: 'fas fa-user-shield', tone: 'warning' },
            { label: 'Open Incidents', value: openIncidents, icon: 'fas fa-bug', tone: 'warning' }
        ],
        riskBreakdown: [
            { label: 'Phishing', value: phishing, tone: 'critical' },
            { label: 'Malware', value: malware, tone: 'high' },
            { label: 'Spam', value: spam, tone: 'medium' }
        ],
        keyInsight,
        miniFeed: feed
    };
}

function buildApplicationsPreviewModel() {
    const apps = Array.isArray(applicationsData) ? applicationsData : [];
    const total = apps.length;
    const external = apps.filter(app => app.isExternal).length;
    const highRisk = apps.filter(app => calculateAppRisk(app).level === 'high').length;
    const highAccess = apps.filter(app => (app.userCount || 0) >= 20).length;
    const highBucket = apps.filter(app => app.isExternal && ((app.scopeCount || 0) + (app.roleCount || 0) > 10)).length;
    const mediumBucket = apps.filter(app => (app.userCount || 0) > 10 && (app.userCount || 0) < 20).length;
    const safeBucket = Math.max(0, total - highBucket - mediumBucket);
    const topExternal = apps.filter(app => app.isExternal).sort((a, b) => (b.userCount || 0) - (a.userCount || 0))[0];
    const keyInsight = topExternal
        ? `External app has access to ${topExternal.userCount || 0} users`
        : highRisk > 0
            ? 'App with excessive permissions detected'
            : 'Application access posture is stable';
    const feed = apps
        .sort((a, b) => (b.userCount || 0) - (a.userCount || 0))
        .slice(0, 3)
        .map(app => ({
            icon: 'fas fa-cube',
            text: `${app.displayName || app.name || 'Application'} activity at ${app.userCount || 0} users`
        }));

    return {
        topMetrics: [
            { label: 'Total Applications', value: total, icon: 'fas fa-cubes', tone: 'info' },
            { label: 'External Applications', value: external, icon: 'fas fa-globe', tone: 'warning' },
            { label: 'High Risk Applications', value: highRisk, icon: 'fas fa-triangle-exclamation', tone: 'critical' },
            { label: 'Apps High Access', value: highAccess, icon: 'fas fa-users', tone: 'warning' }
        ],
        riskBreakdown: [
            { label: 'High', value: highBucket, tone: 'critical' },
            { label: 'Medium', value: mediumBucket, tone: 'high' },
            { label: 'Safe', value: safeBucket, tone: 'medium' }
        ],
        keyInsight,
        miniFeed: feed
    };
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
        // Sunbird requires enriched identity payload (roles, MFA, risk, sign-in metadata).
        // The DB identity-details response can be safely merged with enrichment payloads.
        if (isSunbirdUser()) {
            console.log('[Identity] Sunbird user detected, using enriched identity loader');
            // Render instantly using any already-loaded snapshot, then hydrate in background.
            updateDashboardData(project);
            initializeIdentityDashboard();
            fetchIdentityAccessData().catch((error) => {
                console.error('[Identity] Background hydrate failed:', error);
            });
            return;
        }

        console.log('[Identity] Fetching cached identity metrics...');
        const authToken = localStorage.getItem('authToken');
        
        const response = await fetch('/api/db/identity-metrics', {
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
        
        const metrics = data.metrics || {};
        const totalUsers = metrics.TotalUsers || metrics.totalUsers || 0;
        const activeUsers = metrics.ActiveUsers || metrics.activeUsers || 0;
        const adminRoles = metrics.AdminRoles || metrics.adminRoles || 0;
        const securityScore = metrics.SecurityScore || metrics.securityScore || 0;

        microsoftUsersData = microsoftUsersData || [];
        project.cardMetrics = [
            { label: "Total Users", value: `: ${totalUsers}`, icon: "fas fa-users" },
            { label: "Active (24h)", value: `: ${activeUsers}`, icon: "fas fa-user-check" },
            { label: "Admin Roles", value: `: ${adminRoles}`, icon: "fas fa-crown" },
            { label: "Security Score", value: `: ${securityScore}`, icon: "fas fa-shield-alt" }
        ];
        project.lastUpdate = new Date().toLocaleTimeString();
        project.cardFooter = `Users: ${totalUsers} | Active: ${activeUsers}`;
        
        updateDashboardData(project);
        
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
    const devicesView = document.getElementById('devices-view');
    const securityEventsView = document.getElementById('security-events-view');
    const emailSecurityView = document.getElementById('email-security-view');
    const backupRecoveryView = document.getElementById('backup-recovery-view');

    if (devicesView) devicesView.style.display = 'none';
    if (securityEventsView) securityEventsView.style.display = 'none';
    if (emailSecurityView) emailSecurityView.style.display = 'none';
    if (backupRecoveryView) backupRecoveryView.style.display = 'none';

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
        document.getElementById('project-name').textContent = project.name + ' - Dashboard';
        return;
    }
    
    // For other projects, use original data
    document.getElementById('project-name').textContent = project.name + ' - Dashboard';
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

function renderPoweredByBadge(provider) {
    return '';
}

function renderSunbirdFullDashboardButton(target) {
    let icon = 'fa-chart-line';
    if (target === 'security') icon = 'fa-shield-alt';
    if (target === 'backup') icon = 'fa-hdd';
    if (target === 'applications') icon = 'fa-cubes'; // Icon for apps
    
    return `
        <div class="sunbird-dashboard-btn-wrap">
            <button class="sunbird-dashboard-btn" onclick="window.openSunbirdFullDashboard('${target}')">
                <i class="fas ${icon}"></i> View Full Dashboard
            </button>
        </div>
    `;
}

function renderSunbirdPlaceholderView(title, icon, subtitle = 'Coming soon') {
    return `
        <div class="sunbird-panel-view">
            <div class="billing-card-header">
                <i class="fas ${icon}"></i>
                <h3>${title}</h3>
            </div>
            <p class="sunbird-panel-error">${subtitle}</p>
        </div>
    `;
}

window.openSunbirdFullDashboard = function(target) {
    let project = null;
    
    if (target === 'security') {
        project = mockProjects.find(p => p.isSecurityCard);
    } else if (target === 'backup') {
        project = mockProjects.find(p => p.isBackupRecoveryCard);
    } else if (target === 'applications') {
        // Look for the Applications project card to launch its dashboard
        project = mockProjects.find(p => p.isApplicationsCard);
    }

    if (!project) {
        console.warn(`[Sunbird] Full dashboard target not found: ${target}`);
        return;
    }

    viewProjectDashboard(project);
};

// ============================================
// BILLING & INVOICE API
// ============================================
// Retrieves billing information, invoices, and payment status
// for the billing dashboard card

/* BILLING & GOVERNANCE CARDS */
async function initializeBillingCard() {
    const billingCard = document.getElementById('billing-card');
    if (!billingCard) return;

    // Prevent async races from overwriting the active Sunbird mini-view.
    // If the user is currently viewing another menu item, don't render billing HTML into the container.
    if (isSunbirdUser() && billingCard.dataset?.sunbirdView && billingCard.dataset.sunbirdView !== 'billing') {
        syncSunbirdLeftMenuHeight();
        return;
    }
    
    const token = localStorage.getItem('authToken');
    
    if (!token) {
        const isSessionLoggedIn = sessionStorage.getItem('isLoggedIn') === 'true' || !!localUser;
        if (isSessionLoggedIn) {
            if (isSunbirdUser() && !isSunbirdBillingViewActive('billing') && billingCard.dataset?.sunbirdView) return;
            billingCard.innerHTML = '<p style="color: #bdbdbd; text-align: left; padding: 20px;">Loading billing information...</p>';
            cachedSunbirdBillingHtml = billingCard.innerHTML;
            setTimeout(() => {
                if (!localStorage.getItem('authToken')) return;
                initializeBillingCard();
            }, 450);
            return;
        }
        if (billingAuthRetryCount < 6) {
            billingAuthRetryCount += 1;
            billingCard.innerHTML = '<p style="color: #bdbdbd; text-align: left; padding: 20px;">Preparing your billing view...</p>';
            setTimeout(() => initializeBillingCard(), 350);
            return;
        }
        if (isSunbirdUser() && !isSunbirdBillingViewActive('billing') && billingCard.dataset?.sunbirdView) return;
        billingCard.innerHTML = '<p style="color: #bdbdbd; text-align: center; padding: 20px;">Please log in to view billing information.</p>';
        cachedSunbirdBillingHtml = billingCard.innerHTML;
        return;
    }

    billingAuthRetryCount = 0;

    // Stale-while-revalidate render for instant paint.
    try {
        const rawCache = localStorage.getItem(BILLING_CACHE_KEY);
        if (rawCache) {
            const parsed = JSON.parse(rawCache);
            if (parsed?.html && parsed?.cachedAt && (Date.now() - parsed.cachedAt) < BILLING_CACHE_TTL_MS) {
                billingCard.innerHTML = parsed.html;
                cachedSunbirdBillingHtml = parsed.html;
            }
        }
    } catch (_) {}
    
    try {
        const response = await fetch('/api/client/latest-invoice', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (response.status === 401 || response.status === 403) {
            // Token expired or invalid
            if (isSunbirdUser() && !isSunbirdBillingViewActive('billing')) return;
            billingCard.innerHTML = '<p style="color: #bdbdbd; text-align: center; padding: 20px;">Session expired. Please log in again.</p>';
            cachedSunbirdBillingHtml = billingCard.innerHTML;
            localStorage.setItem(BILLING_CACHE_KEY, JSON.stringify({
                html: billingCard.innerHTML,
                cachedAt: Date.now()
            }));
            return;
        }
        
        if (!response.ok) {
            throw new Error(`Failed to fetch invoice: ${response.status}`);
        }
        
        const invoice = await response.json();
        
        if (!invoice) {
            if (isSunbirdUser() && !isSunbirdBillingViewActive('billing')) return;
            billingCard.innerHTML = `
                <div class="billing-card-header">
                    <i class="fas fa-credit-card"></i>
                    <h3>Billing Statement</h3>
                </div>
                <p style="color: #bdbdbd; text-align: center; padding: 20px;">No active billing</p>
            `;
            cachedSunbirdBillingHtml = billingCard.innerHTML;
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
        
        if (isSunbirdUser() && !isSunbirdBillingViewActive('billing')) return;
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
                    <p><strong>Friendly Reminder:</strong></p>
                    <p>A quick reminder to complete your payment by the due date.</p>
                </div>
            </div>
        `;
        cachedSunbirdBillingHtml = billingCard.innerHTML;
        localStorage.setItem(BILLING_CACHE_KEY, JSON.stringify({
            html: billingCard.innerHTML,
            cachedAt: Date.now()
        }));
    } catch (error) {
        console.error('Error loading billing card:', error);
        if (isSunbirdUser() && !isSunbirdBillingViewActive('billing')) return;
        if (!billingCard.innerHTML || billingCard.innerHTML.trim().length === 0) {
            billingCard.innerHTML = `
                <div class="billing-card-header">
                    <i class="fas fa-credit-card"></i>
                    <h3>Billing Statement</h3>
                </div>
                <p style="color: #bdbdbd; text-align: center; padding: 20px;">Error loading billing information</p>
            `;
            cachedSunbirdBillingHtml = billingCard.innerHTML;
        }
    } finally {
        ensureSunbirdBillingCardDimensions();
        // If this renderer completed after the user navigated away, don't force-switch tabs.
        if (isSunbirdUser() && isSunbirdBillingViewActive('billing') === false) {
            syncSunbirdLeftMenuHeight();
            return;
        }
        // Keep Sunbird menu aligned to the rendered billing card height.
        syncSunbirdLeftMenuHeight();
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

// Switch billing menu for Sunbird users
window.switchBillingMenu = async function(menuItem) {
    sunbirdBillingMenuSelection = menuItem;

    const menuItems = document.querySelectorAll('.sunbird-menu-item');
    menuItems.forEach(item => item.classList.remove('active'));
    
    const activeItem = document.querySelector(`[data-menu="${menuItem}"]`);
    if (activeItem) {
        activeItem.classList.add('active');
    }

    const billingCard = document.getElementById('billing-card');
    if (!billingCard) return;
    billingCard.dataset.sunbirdView = menuItem;

    const placeholderViews = {
        reports: { title: 'Reports', icon: 'fa-chart-line' },
        architecture: { title: 'Architecture', icon: 'fa-sitemap' },
        sla: { title: 'SLA', icon: 'fa-handshake' }
    };

    if (placeholderViews[menuItem]) {
        billingCard.innerHTML = renderSunbirdPlaceholderView(
            placeholderViews[menuItem].title,
            placeholderViews[menuItem].icon
        );
        ensureSunbirdBillingCardDimensions();
        syncSunbirdLeftMenuHeight();
        return;
    }

    if (menuItem === 'billing') {
        // Always render billing view when selected so click visibly affects the container.
        await initializeBillingCard();
        return;
    }

    if (menuItem === 'operations') {
        await renderSunbirdOperationsView();
        return;
    }

    if (menuItem === 'security') {
        await renderSunbirdSecurityAlertsView(false);
        return;
    }

    if (menuItem === 'backup') {
        await renderSunbirdBackupRecoveryView(false);
        return;
    }

    if (menuItem === 'risks') {
        await renderSunbirdRisksView(false);
    }

    // NEW: Route for Applications
    if (menuItem === 'applications') {
        await renderSunbirdApplicationsView(false);
        return;
    }
};

function ensureSunbirdBillingCardDimensions() {
    if (!isSunbirdUser()) return;
    const billingCard = document.getElementById('billing-card');
    if (!billingCard) return;

    if (!sunbirdBillingCardLockedHeight && billingCard.offsetHeight > 0) {
        sunbirdBillingCardLockedHeight = billingCard.offsetHeight;
    }

    if (sunbirdBillingCardLockedHeight) {
        billingCard.style.height = `${sunbirdBillingCardLockedHeight}px`;
    }
}

async function fetchSunbirdSecurityEventsData() {
    const token = localStorage.getItem('authToken');
    if (!token) throw new Error('Authentication required');

    console.log('[Frontend] 🚀 Fetching security events from /api/security-events...');
    
    const response = await fetch('/api/security-events', {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    });

    console.log('[Frontend] 📡 Response status:', response.status);

    if (!response.ok) {
        console.error('[Frontend] ❌ Failed to fetch security events:', response.status);
        throw new Error(`Failed to fetch security events (${response.status})`);
    }

    const data = await response.json();
    console.log('[Frontend] ✅ Security data received:', {
        success: data.success,
        summary: data.summary,
        incidentsCount: data.incidents?.length || 0,
        alertsCount: data.alerts?.length || 0
    });
    
    if (!data.success) {
        throw new Error(data.message || 'Invalid security response');
    }
    return data;
}

async function fetchSunbirdBackupRecoveryData() {
    const token = localStorage.getItem('authToken');
    if (!token) throw new Error('Authentication required');

    const response = await fetch('/api/db/backup-recovery', {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch backup data (${response.status})`);
    }

    const data = await response.json();
    if (!data.success) {
        throw new Error(data.message || 'Invalid backup response');
    }
    return data;
}

async function renderSunbirdSecurityAlertsView(forceRefresh = false) {
    const billingCard = document.getElementById('billing-card');
    if (!billingCard) return;

    try {
        if (!isSunbirdBillingViewActive('security')) return;
        billingCard.innerHTML = renderSunbirdPremiumLoader('Loading security alerts');

        if (forceRefresh || !cachedSunbirdSecurityData) {
            cachedSunbirdSecurityData = await fetchSunbirdSecurityEventsData();
        }

        const data = cachedSunbirdSecurityData;
        const incidents = (data.incidents || []).slice(0, 10);
        const highSeverityAlerts = data.summary?.highSeverityAlerts || 0;
        const activeIncidents = data.summary?.activeIncidents || 0;

        const rowsHtml = incidents.length
            ? incidents.map(incident => `
                <tr>
                    <td>${incident.displayName || 'Unknown Incident'}</td>
                    <td><span class="sunbird-severity-pill ${String(incident.severity || 'medium').toLowerCase()}">${incident.severity || 'medium'}</span></td>
                    <td>${incident.status || 'active'}</td>
                    <td>${incident.assignedTo || 'Unassigned'}</td>
                </tr>
            `).join('')
            : '<tr><td colspan="4" class="sunbird-empty-row">No incidents found</td></tr>';

        if (!isSunbirdBillingViewActive('security')) return;
        
        // Build activity feed items from the activityFeed array sent by backend
        // This includes incidents, alerts, and suspicious sign-ins
        const activityFeed = cachedSunbirdSecurityData.activityFeed || [];
        console.log('[Sunbird Security Alerts] 📋 Activity Feed Items:', activityFeed.length);
        
        const activityFeedHtml = activityFeed.length
            ? activityFeed.map(item => {
                const severityColor = item.severity === 'critical' ? '#ff6b6b' : item.severity === 'high' ? '#ff9f40' : '#ffc107';
                const itemIcon = item.type === 'incident' ? '🔴' : item.type === 'alert' ? '⚠️' : item.type === 'signin' ? '🔑' : '•';
                return `
                    <div class="sunbird-activity-item">
                        <span class="sunbird-activity-severity" style="background-color: ${severityColor}"></span>
                        <div class="sunbird-activity-content">
                            <p class="sunbird-activity-title">${itemIcon} ${item.message || 'Activity detected'}</p>
                            <p class="sunbird-activity-meta">${new Date(item.timestamp).toLocaleTimeString()} • ${item.type}</p>
                        </div>
                    </div>
                `;
            }).join('')
            : '<div class="sunbird-activity-empty">No recent activity</div>';
        
        console.log('[Sunbird Security Alerts] 📊 Data prepared - High Severity: %d, Active Incidents: %d, Total Incidents: %d, Activity Items: %d', highSeverityAlerts, activeIncidents, incidents.length, activityFeed.length);
        
        billingCard.innerHTML = `
            <div class="sunbird-panel-view">
                <div class="billing-card-header">
                    <i class="fas fa-shield-alt"></i>
                    <h3>Security Alerts</h3>
                </div>
                <div class="sunbird-mini-stats">
                    <div class="sunbird-mini-stat">
                        <span>High Severity Alerts</span>
                        <strong>${highSeverityAlerts}</strong>
                    </div>
                    <div class="sunbird-mini-stat">
                        <span>Security Incidents</span>
                        <strong>${activeIncidents}</strong>
                    </div>
                </div>
                
                <!-- Security Incidents Table Section -->
                <div class="sunbird-section-container">
                    <h4 class="sunbird-section-heading">
                        <i class="fas fa-exclamation-triangle"></i> Security Incidents
                    </h4>
                    <div class="sunbird-incidents-table-wrap">
                        <table class="sunbird-incidents-table">
                            <thead>
                                <tr>
                                    <th>Incident Name</th>
                                    <th>Severity</th>
                                    <th>Status</th>
                                    <th>Assigned To</th>
                                </tr>
                            </thead>
                            <tbody>${rowsHtml}</tbody>
                        </table>
                    </div>
                </div>
                
                <!-- Real-Time Activity Feed Section -->
                <div class="sunbird-section-container">
                    <h4 class="sunbird-section-heading">
                        <i class="fas fa-stream"></i> Real-Time Activity Feed
                    </h4>
                    <div class="sunbird-activity-feed">
                        ${activityFeedHtml}
                    </div>
                </div>
                
                ${renderSunbirdFullDashboardButton('security')}
            </div>
        `;
    } catch (error) {
        console.error('[Sunbird Security Alerts] Error:', error);
        if (!isSunbirdBillingViewActive('security')) return;
        billingCard.innerHTML = `
            <div class="sunbird-panel-view">
                <div class="billing-card-header">
                    <i class="fas fa-shield-alt"></i>
                    <h3>Security Alerts</h3>
                </div>
                <p class="sunbird-panel-error">Unable to load security alerts right now.</p>
                ${renderSunbirdFullDashboardButton('security')}
            </div>
        `;
    } finally {
        ensureSunbirdBillingCardDimensions();
        syncSunbirdLeftMenuHeight();
    }
}

async function renderSunbirdBackupRecoveryView(forceRefresh = false) {
    const billingCard = document.getElementById('billing-card');
    if (!billingCard) return;

    try {
        if (!isSunbirdBillingViewActive('backup')) return;
        billingCard.innerHTML = renderSunbirdPremiumLoader('Loading backup and recovery');

        if (forceRefresh || !cachedSunbirdBackupData) {
            cachedSunbirdBackupData = await fetchSunbirdBackupRecoveryData();
        }

        const data = cachedSunbirdBackupData;
        const summary = data.summary || {};
        const byService = data.storage?.byService || {};

        if (!isSunbirdBillingViewActive('backup')) return;
        billingCard.innerHTML = `
            <div class="sunbird-panel-view">
                <div class="billing-card-header">
                    <i class="fas fa-hdd"></i>
                    <h3>Backup & Recovery</h3>
                </div>

                <div class="sunbird-mini-stats">
                    <div class="sunbird-mini-stat">
                        <span>Total Storage</span>
                        <strong>${summary.totalStorageGB || 0} GB</strong>
                    </div>
                    <div class="sunbird-mini-stat">
                        <span>Active Users</span>
                        <strong>${summary.activeUsersCount || 0}</strong>
                    </div>
                </div>

                <div class="sunbird-section-title">Storage by Service</div>
                <div class="sunbird-storage-list">
                    <div class="sunbird-storage-row"><span>OneDrive</span><strong>${byService.onedrive || 0} GB</strong></div>
                    <div class="sunbird-storage-row"><span>SharePoint</span><strong>${byService.sharepoint || 0} GB</strong></div>
                    <div class="sunbird-storage-row"><span>Exchange</span><strong>${byService.exchange || 0} GB</strong></div>
                </div>
                ${renderSunbirdFullDashboardButton('backup')}
            </div>
        `;
    } catch (error) {
        console.error('[Sunbird Backup Recovery] Error:', error);
        if (!isSunbirdBillingViewActive('backup')) return;
        billingCard.innerHTML = `
            <div class="sunbird-panel-view">
                <div class="billing-card-header">
                    <i class="fas fa-hdd"></i>
                    <h3>Backup & Recovery</h3>
                </div>
                <p class="sunbird-panel-error">Unable to load backup and recovery data right now.</p>
                ${renderSunbirdFullDashboardButton('backup')}
            </div>
        `;
    } finally {
        ensureSunbirdBillingCardDimensions();
        syncSunbirdLeftMenuHeight();
    }
}

async function renderSunbirdApplicationsView(forceRefresh = false) {
    const billingCard = document.getElementById('billing-card');
    if (!billingCard) return;

    try {
        if (!isSunbirdBillingViewActive('applications')) return;
        billingCard.innerHTML = renderSunbirdPremiumLoader('Loading applications');

        // Fetch app data if it doesn't exist yet or if forced
        if (forceRefresh || applicationsData.length === 0) {
            await fetchApplicationsData();
        }

        const apps = applicationsData || [];
        const totalApps = apps.length;
        const externalApps = apps.filter(a => a.isExternal).length;
        
        // Use your simple risk logic helper!
        const highRiskApps = apps.filter(a => calculateAppRisk(a).level === 'high').length;

        // Sort by users (descending) and get top 5
        const topApps = [...apps]
            .sort((a, b) => (b.userCount || 0) - (a.userCount || 0))
            .slice(0, 5);

        const topAppsHtml = topApps.length > 0 
            ? topApps.map(app => `
                <div class="sunbird-storage-row">
                    <span>${app.name || 'Unknown App'} <small style="color: #64748b; margin-left: 6px;">(${app.type})</small></span>
                    <strong>${app.userCount || 0} Users</strong>
                </div>
            `).join('')
            : '<div class="sunbird-empty-row" style="padding: 20px;">No application user data found</div>';

        if (!isSunbirdBillingViewActive('applications')) return;
        
        // We use grid-template-columns: repeat(3, 1fr) to fit the 3 stats evenly
        billingCard.innerHTML = `
            <div class="sunbird-panel-view">
                <div class="billing-card-header">
                    <i class="fas fa-cubes"></i>
                    <h3>Applications & Access</h3>
                </div>

                <div class="sunbird-mini-stats" style="grid-template-columns: repeat(3, 1fr);">
                    <div class="sunbird-mini-stat">
                        <span>Total Apps</span>
                        <strong>${totalApps}</strong>
                    </div>
                    <div class="sunbird-mini-stat">
                        <span>External Apps</span>
                        <strong>${externalApps}</strong>
                    </div>
                    <div class="sunbird-mini-stat" style="${highRiskApps > 0 ? 'background: rgba(239, 68, 68, 0.08); border-color: rgba(239, 68, 68, 0.3);' : ''}">
                        <span style="${highRiskApps > 0 ? 'color: #fca5a5;' : ''}">High Risk Apps</span>
                        <strong style="${highRiskApps > 0 ? 'color: #f87171;' : ''}">${highRiskApps}</strong>
                    </div>
                </div>

                <div class="sunbird-section-title" style="margin-top: 10px;">Top 5 Apps by Users</div>
                <div class="sunbird-storage-list">
                    ${topAppsHtml}
                </div>
                
                ${renderSunbirdFullDashboardButton('applications')}
            </div>
        `;
    } catch (error) {
        console.error('[Sunbird Applications View] Error:', error);
        if (!isSunbirdBillingViewActive('applications')) return;
        billingCard.innerHTML = `
            <div class="sunbird-panel-view">
                <div class="billing-card-header">
                    <i class="fas fa-cubes"></i>
                    <h3>Applications & Access</h3>
                </div>
                <p class="sunbird-panel-error">Unable to load applications data right now.</p>
                ${renderSunbirdFullDashboardButton('applications')}
            </div>
        `;
    } finally {
        ensureSunbirdBillingCardDimensions();
        syncSunbirdLeftMenuHeight();
    }
}

function renderSunbirdPremiumLoader(message) {
    return `
        <div class="sunbird-panel-view sunbird-panel-loader-wrap">
            <div class="sunbird-premium-loader" aria-live="polite">
                <div class="sunbird-loader-orbit"></div>
                <div class="sunbird-loader-core"></div>
                <div class="sunbird-loader-bars">
                    <span></span><span></span><span></span>
                </div>
                <p class="sunbird-panel-loading">${message}<span class="sunbird-loader-dots"></span></p>
            </div>
        </div>
    `;
}

let sunbirdMenuResizeObserver = null;

function syncSunbirdLeftMenuHeight() {
    if (!isSunbirdUser()) return;

    const billingCard = document.getElementById('billing-card');
    const leftMenu = document.querySelector('.sunbird-left-menu');
    const wrapper = leftMenu?.parentElement;
    if (!billingCard || !leftMenu || !wrapper) return;

    // Keep the menu sized to its content, but vertically centered
    // to the billing card for a "control rail" look.
    const billingRect = billingCard.getBoundingClientRect();
    const wrapperRect = wrapper.getBoundingClientRect();
    const billingTopOffset = billingRect.top - wrapperRect.top;

    if (billingRect.height > 0) {
        // Ensure the menu hugs its items (no forced height).
        leftMenu.style.height = 'auto';

        // Measure after letting height auto-apply.
        const menuRect = leftMenu.getBoundingClientRect();

        // Align menu center to billing card center.
        const billingCenterY = billingTopOffset + (billingRect.height / 2);
        let desiredTop = billingCenterY - (menuRect.height / 2);

        // Clamp within wrapper.
        const maxTop = Math.max(0, wrapperRect.height - menuRect.height);
        desiredTop = Math.max(0, Math.min(desiredTop, maxTop));

        leftMenu.style.top = `${desiredTop}px`;

        // Keep connector aligned to billing card center.
        wrapper.style.setProperty('--sunbird-connector-y', `${billingCenterY}px`);
    }
}

// Initialize Sunbird left menu (called during dashboard initialization)
function initializeSunbirdLeftMenu() {
    if (!isSunbirdUser()) return;
    
    const dashboardCardsSection = document.querySelector('.dashboard-cards-section');
    if (!dashboardCardsSection) return;
    
    // Check if wrapper already exists
    const existingWrapper = dashboardCardsSection.parentElement;
    if (existingWrapper.classList.contains('dashboard-with-menu')) return;
    
    // Create wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'dashboard-with-menu';
    
    // Create left menu
    const leftMenu = document.createElement('div');
    leftMenu.className = 'sunbird-left-menu';
    leftMenu.innerHTML = `
        <div class="sunbird-menu-heading">Control Center</div>
        <button class="sunbird-menu-item" data-menu="security" onclick="window.switchBillingMenu('security')">
            <i class="fas fa-shield-alt"></i><span>Security Alerts</span>
        </button>
        <button class="sunbird-menu-item" data-menu="operations" onclick="window.switchBillingMenu('operations')">
            <i class="fas fa-tasks"></i><span>Operations</span>
        </button>
        <button class="sunbird-menu-item" data-menu="backup" onclick="window.switchBillingMenu('backup')">
            <i class="fas fa-hdd"></i><span>Backup & Recovery</span>
        </button>
        <button class="sunbird-menu-item" data-menu="billing" onclick="window.switchBillingMenu('billing')">
            <i class="fas fa-file-invoice"></i><span>Billing Statement</span>
        </button>
        <button class="sunbird-menu-item" data-menu="reports" onclick="window.switchBillingMenu('reports')">
            <i class="fas fa-chart-line"></i><span>Reports</span>
        </button>
        <button class="sunbird-menu-item" data-menu="risks" onclick="window.switchBillingMenu('risks')">
            <i class="fas fa-triangle-exclamation"></i><span>Risks</span>
        </button>
        <button class="sunbird-menu-item" data-menu="architecture" onclick="window.switchBillingMenu('architecture')">
            <i class="fas fa-sitemap"></i><span>Architecture</span>
        </button>
        <button class="sunbird-menu-item" data-menu="sla" onclick="window.switchBillingMenu('sla')">
            <i class="fas fa-handshake"></i><span>SLA</span>
        </button>
        <button class="sunbird-menu-item" data-menu="applications" onclick="window.switchBillingMenu('applications')">
            <i class="fas fa-cubes"></i><span>Applications</span>
        </button>
    `;
    
    // Insert wrapper before dashboard-cards-section
    dashboardCardsSection.parentElement.insertBefore(wrapper, dashboardCardsSection);
    
    // Add menu and dashboard to wrapper
    wrapper.appendChild(leftMenu);
    wrapper.appendChild(dashboardCardsSection);

    window.switchBillingMenu(sunbirdBillingMenuSelection);
    syncSunbirdLeftMenuHeight();

    // Keep menu height aligned with billing card when content changes.
    if ('ResizeObserver' in window) {
        const billingCard = document.getElementById('billing-card');
        if (billingCard) {
            if (sunbirdMenuResizeObserver) {
                sunbirdMenuResizeObserver.disconnect();
            }
            sunbirdMenuResizeObserver = new ResizeObserver(() => {
                syncSunbirdLeftMenuHeight();
            });
            sunbirdMenuResizeObserver.observe(billingCard);
        }
    }
}

function initializeGovernanceCard() {
    const governanceCard = document.getElementById('governance-card');
    if (!governanceCard) return;
    
    const client = isSunbirdUser() ? 'sunbird' : 'default';

    if (client === 'sunbird') {
        const governanceFrameworkRows = [
            { area: 'Access review', activity: 'Review users', source: 'Framework', frequency: 'Quarterly', lastReviewed: '2025-10-05', evidence: 'Quarterly user entitlement review exported and signed off.' },
            { area: 'Admin review', activity: 'Review roles', source: 'Framework', frequency: 'Quarterly', lastReviewed: '2025-11-10', evidence: 'Privileged role assignment list reviewed against approvals.' },
            { area: 'Security review', activity: 'Full stack review', source: 'Framework', frequency: 'Annual', lastReviewed: '2025-01-14', evidence: 'Security baseline checklist completed by platform team.' },
            { area: 'Threat review', activity: 'Threat landscape', source: 'Framework', frequency: 'Annual', lastReviewed: '2024-12-08', evidence: 'Threat model workshop notes and action log captured.' },
            { area: 'AI review', activity: 'AI policy', source: 'Framework', frequency: 'Ongoing', lastReviewed: null, evidence: 'AI policy updates pending legal and risk approval.' },
            { area: 'Software review', activity: 'App review', source: 'Framework', frequency: 'Annual', lastReviewed: '2025-03-22', evidence: 'Third-party software inventory and risk review completed.' },
            { area: 'Incident review', activity: 'Post-incident', source: 'Framework', frequency: 'Triggered', lastReviewed: '2026-02-15', evidence: 'Post-incident RCA shared with governance stakeholders.' },
            { area: 'MFA audit', activity: 'Identity check', source: 'Checklist', frequency: 'Quarterly', lastReviewed: '2025-08-30', evidence: 'MFA coverage report generated from identity dashboard.' },
            { area: 'Device audit', activity: 'Device posture', source: 'Checklist', frequency: 'Monthly', lastReviewed: '2026-03-25', evidence: 'Managed device compliance report reviewed and archived.' },
            { area: 'Log review', activity: 'Sign-in logs', source: 'Checklist', frequency: 'Monthly', lastReviewed: '2026-03-05', evidence: 'Sign-in anomaly summary and analyst notes attached.' },
            { area: 'Backup review', activity: 'Backup check', source: 'Checklist', frequency: 'Monthly', lastReviewed: '2026-02-03', evidence: 'Backup success rates verified and exceptions documented.' },
            { area: 'Restore testing', activity: 'Recovery test', source: 'Checklist', frequency: 'Quarterly', lastReviewed: '2025-09-28', evidence: 'Recovery simulation runbook execution record available.' },
            { area: 'Policy review', activity: 'CA policies', source: 'Checklist', frequency: 'Quarterly', lastReviewed: '2025-10-20', evidence: 'Conditional Access policy matrix reviewed and approved.' },
            { area: 'Data review', activity: 'SharePoint usage', source: 'Framework', frequency: 'Quarterly', lastReviewed: '2026-01-06', evidence: 'SharePoint activity and exposure controls assessed.' },
            { area: 'Awareness review', activity: 'Training', source: 'Framework', frequency: 'Annual', lastReviewed: '2025-04-17', evidence: 'Security awareness completion report captured.' }
        ];

        governanceCard.innerHTML = `
            <div class="governance-card-header">
                <i class="fas fa-shield-alt"></i>
                <h3>Governance</h3>
            </div>
            <div class="governance-content sunbird-governance-content">
                <div class="sunbird-governance-table-wrap">
                    <table class="sunbird-incidents-table sunbird-governance-table">
                        <thead>
                            <tr>
                                <th>Governance Area</th>
                                <th>Activity</th>
                                <th>Source</th>
                                <th>Frequency</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${governanceFrameworkRows.map((row, index) => `
                                <tr>
                                    <td>${row.area}</td>
                                    <td>
                                        <div class="sunbird-governance-activity-cell">${row.activity}</div>
                                        <button class="sunbird-risk-view-btn sunbird-governance-evidence-btn" onclick="window.openSunbirdGovernanceEvidence(${index})">
                                            View Evidence
                                        </button>
                                    </td>
                                    <td>${row.source}</td>
                                    <td>${row.frequency}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        window.sunbirdGovernanceRows = governanceFrameworkRows;
        ensureSunbirdGovernanceEvidenceModal();
        return;
    }

    let governanceData = [
        'Change Management',
        'End-user awareness',
        'Configurations',
        'Site documentation'
    ];
    
    const governanceHtml = governanceData.map(item => `
        <div class="governance-item">
            <i class="fas fa-check-circle" style="color: #28a745;"></i>
            <span class="governance-item-text">${item}</span>
        </div>
    `).join('');
    
    governanceCard.innerHTML = `
        <div class="governance-card-header">
            <i class="fas fa-shield-alt"></i>
            <h3>Governance & Compliance</h3>
        </div>
        <div class="governance-content">
            ${governanceHtml}
        </div>
    `;
}

function deriveGovernanceStatus(row) {
    const mapDays = {
        Monthly: 35,
        Quarterly: 100,
        Annual: 395
    };
    if (!row?.lastReviewed) {
        return row?.frequency === 'Ongoing' ? 'Pending' : 'Overdue';
    }

    const reviewedAt = new Date(row.lastReviewed);
    if (Number.isNaN(reviewedAt.getTime())) return 'Pending';
    if (row.frequency === 'Triggered') return 'Completed';
    if (row.frequency === 'Ongoing') return 'Completed';

    const maxAgeDays = mapDays[row.frequency] || 90;
    const ageDays = (Date.now() - reviewedAt.getTime()) / (1000 * 60 * 60 * 24);
    return ageDays > maxAgeDays ? 'Overdue' : 'Completed';
}

function ensureSunbirdGovernanceEvidenceModal() {
    if (document.getElementById('sunbird-governance-evidence-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'sunbird-governance-evidence-modal';
    modal.className = 'sunbird-governance-evidence-modal';
    modal.innerHTML = `
        <div class="sunbird-governance-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="sunbird-governance-modal-title">
            <button class="sunbird-governance-modal-close" type="button" aria-label="Close">
                <i class="fas fa-times"></i>
            </button>
            <h4 id="sunbird-governance-modal-title">Governance Evidence</h4>
            <div class="sunbird-governance-modal-meta" id="sunbird-governance-modal-meta"></div>
            <div class="sunbird-governance-modal-status-wrap">
                <span class="sunbird-governance-modal-status-label">Status</span>
                <span class="sunbird-governance-modal-status" id="sunbird-governance-modal-status">Pending</span>
            </div>
            <div class="sunbird-governance-modal-evidence-title">Supporting Evidence</div>
            <div class="sunbird-governance-modal-evidence-text" id="sunbird-governance-modal-evidence"></div>
        </div>
    `;

    modal.addEventListener('click', (event) => {
        if (event.target === modal) {
            modal.classList.remove('open');
        }
    });

    const closeBtn = modal.querySelector('.sunbird-governance-modal-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => modal.classList.remove('open'));
    }

    document.body.appendChild(modal);
}

window.openSunbirdGovernanceEvidence = function(index) {
    const rows = Array.isArray(window.sunbirdGovernanceRows) ? window.sunbirdGovernanceRows : [];
    const row = rows[index];
    const modal = document.getElementById('sunbird-governance-evidence-modal');
    if (!row || !modal) return;

    const status = deriveGovernanceStatus(row);
    const reviewedLabel = row.lastReviewed
        ? `Last reviewed: ${new Date(row.lastReviewed).toLocaleDateString()}`
        : 'Last reviewed: Pending review';

    const meta = modal.querySelector('#sunbird-governance-modal-meta');
    const statusEl = modal.querySelector('#sunbird-governance-modal-status');
    const evidenceEl = modal.querySelector('#sunbird-governance-modal-evidence');
    const titleEl = modal.querySelector('#sunbird-governance-modal-title');

    if (titleEl) titleEl.textContent = row.area;
    if (meta) {
        meta.innerHTML = `
            <div><strong>Activity:</strong> ${row.activity}</div>
            <div><strong>Frequency:</strong> ${row.frequency}</div>
            <div>${reviewedLabel}</div>
            <div>Related data source connected</div>
        `;
    }
    if (statusEl) {
        statusEl.textContent = status;
        statusEl.className = `sunbird-governance-modal-status ${status.toLowerCase()}`;
    }
    if (evidenceEl) {
        evidenceEl.textContent = row.evidence || (status === 'Completed' ? 'Completed' : 'Pending review');
    }

    modal.classList.add('open');
};

function initializeSupportCard() {
    const supportCard = document.getElementById('support-card');
    if (!supportCard) return;
    
    // 🚨 STRICT SCOPE CONTROL: Non-Sunbird clients get the standard Support & SLA card
    if (!isSunbirdUser()) {
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
        return;
    }

    // 🚨 SUNBIRD ONLY LOGIC: Live Compliance Validation
    supportCard.innerHTML = `
        <div class="secondary-card-header">
            <i class="fas fa-certificate"></i>
            <h3>Compliance Validation</h3>
        </div>
        <div class="governance-content sunbird-governance-content">
            <div style="text-align: center; padding: 20px; color: #94a3b8;">
                <i class="fas fa-spinner fa-spin"></i> Validating live controls...
            </div>
        </div>
    `;

    // Fetch dynamic API data
    fetchSunbirdComplianceData(supportCard);
}

async function fetchSunbirdComplianceData(supportCard) {
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch('/api/sunbird/compliance-controls', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('Failed to fetch compliance data');
        const data = await response.json();
        
        window.sunbirdComplianceControls = data.controls || [];

        const tableRows = window.sunbirdComplianceControls.map((control, index) => {
            const isDanger = control.insight.includes('🔴');
            const isWarning = control.insight.includes('🟡');
            const insightClass = isDanger ? 'color: #ef4444;' : (isWarning ? 'color: #f59e0b;' : 'color: #10b981;');

            return `
                <tr>
                    <td>
                        <div style="font-weight: 500; margin-bottom: 4px;">${control.name}</div>
                        <button class="sunbird-risk-view-btn" onclick="window.openSunbirdComplianceEvidence(${index})">
                            View Evidence
                        </button>
                    </td>
                    <td style="color: #cbd5e1;">${control.area}</td>
                    <td style="font-weight: 500; ${insightClass}">${control.insight}</td>
                </tr>
            `;
        }).join('');

        supportCard.querySelector('.sunbird-governance-content').innerHTML = `
            <div class="sunbird-governance-table-wrap">
                <table class="sunbird-incidents-table sunbird-governance-table">
                    <thead>
                        <tr>
                            <th>Control Name</th>
                            <th>Area</th>
                            <th>Insight</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRows}
                    </tbody>
                </table>
            </div>
        `;

        ensureSunbirdComplianceEvidenceModal();
    } catch (error) {
        console.error('[Compliance] Error:', error);
        supportCard.querySelector('.sunbird-governance-content').innerHTML = `
            <div style="color: #ef4444; padding: 10px; text-align: center;">Failed to load compliance validation.</div>
        `;
    }
}

function ensureSunbirdComplianceEvidenceModal() {
    if (document.getElementById('sunbird-compliance-evidence-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'sunbird-compliance-evidence-modal';
    modal.className = 'sunbird-governance-evidence-modal'; 
    modal.innerHTML = `
        <div class="sunbird-governance-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="sunbird-compliance-modal-title">
            <button class="sunbird-governance-modal-close" type="button" aria-label="Close">
                <i class="fas fa-times"></i>
            </button>
            <h4 id="sunbird-compliance-modal-title">Control Evidence</h4>
            <div class="sunbird-governance-modal-meta" id="sunbird-compliance-modal-meta"></div>
            <div class="sunbird-governance-modal-evidence-title" style="margin-top: 15px;">Live Data Proof</div>
            <div class="sunbird-governance-modal-evidence-text" id="sunbird-compliance-modal-evidence"></div>
        </div>
    `;

    modal.addEventListener('click', (event) => {
        if (event.target === modal) modal.classList.remove('open');
    });

    const closeBtn = modal.querySelector('.sunbird-governance-modal-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => modal.classList.remove('open'));
    }

    document.body.appendChild(modal);
}

window.openSunbirdComplianceEvidence = function(index) {
    const controls = Array.isArray(window.sunbirdComplianceControls) ? window.sunbirdComplianceControls : [];
    const control = controls[index];
    const modal = document.getElementById('sunbird-compliance-evidence-modal');
    if (!control || !modal) return;

    const titleEl = modal.querySelector('#sunbird-compliance-modal-title');
    const metaEl = modal.querySelector('#sunbird-compliance-modal-meta');
    const evidenceEl = modal.querySelector('#sunbird-compliance-modal-evidence');

    if (titleEl) titleEl.textContent = `Evidence: ${control.name}`;
    
    if (metaEl) {
        metaEl.innerHTML = `
            <div style="margin-bottom: 4px;"><strong>Area:</strong> ${control.area}</div>
            <div><strong>Live Insight:</strong> ${control.insight}</div>
        `;
    }

    if (evidenceEl) {
        let evidenceHtml = '<div style="display: grid; gap: 8px; margin-top: 10px;">';
        
        Object.entries(control.evidenceData || {}).forEach(([key, value]) => {
            const formattedKey = key
                .replace(/_/g, ' ')
                .replace(/\b\w/g, l => l.toUpperCase());

            evidenceHtml += `
                <div style="display: flex; justify-content: space-between; padding: 8px; background: rgba(255,255,255,0.05); border-radius: 4px;">
                    <span style="color: #94a3b8;">${formattedKey}</span>
                    <span style="font-weight: 500; color: #e2e8f0;">${value}</span>
                </div>
            `;
        });
        
        evidenceHtml += '</div>';
        evidenceEl.innerHTML = evidenceHtml;
    }

    modal.classList.add('open');
};

/* RESIZE HANDLER */
window.addEventListener('resize', () => {
    syncSunbirdLeftMenuHeight();
    syncSidePeekCardSizing();
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
        
        console.log('[Identity Details] Fetching users...');
        
        const response = await fetch('/api/db/identity-details', {
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
        const displayName = (user.displayName || '').toLowerCase();
        const email = (user.mail || user.userPrincipalName || user.email || '').toLowerCase();

        if (searchTerm && !displayName.includes(searchTerm) && !email.includes(searchTerm)) {
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

// ============================================================================
// SUNBIRD ONLY: OPERATIONS REMEDIATION ENGINE
// ============================================================================
async function renderSunbirdOperationsView() {
    const billingCard = document.getElementById('billing-card');
    if (!billingCard) return;

    // 1. Skeleton Loader (No text fetching)
    const skeletonRows = Array(6).fill(`
        <tr class="op-skeleton-row">
            <td><div class="op-skeleton-block" style="width: 80%;"></div></td>
            <td><div class="op-skeleton-block" style="width: 50%;"></div></td>
            <td><div class="op-skeleton-block" style="width: 60px; border-radius: 20px;"></div></td>
            <td><div class="op-skeleton-block" style="width: 70%;"></div></td>
            <td><div class="op-skeleton-block" style="width: 80px;"></div></td>
        </tr>
    `).join('');

    billingCard.innerHTML = `
        <div class="sunbird-panel-view">
            <div class="billing-card-header">
                <i class="fas fa-tasks"></i>
                <h3>Operations Action Queue</h3>
            </div>
            <div class="sunbird-section-title" style="margin-bottom: 10px;">Live Remediation Required</div>
            
            <div class="sunbird-incidents-table-wrap" style="max-height: 400px;">
                <table class="sunbird-incidents-table">
                    <thead>
                        <tr>
                            <th>Task</th>
                            <th>Area</th>
                            <th>Priority</th>
                            <th>Insight</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody id="operations-tbody">
                        ${skeletonRows}
                    </tbody>
                </table>
            </div>
        </div>
    `;

    ensureSunbirdOperationsModal();
    ensureSunbirdBillingCardDimensions();
    syncSunbirdLeftMenuHeight();

    // 2. Fetch Live Tasks
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch('/api/sunbird/operations', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('Failed to fetch operations');
        const data = await response.json();
        
        window.sunbirdOperationsTasks = data.tasks || [];

        const tbody = document.getElementById('operations-tbody');
        
        if (window.sunbirdOperationsTasks.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="sunbird-empty-row">No active tasks required. System is healthy.</td></tr>`;
            return;
        }

        tbody.innerHTML = window.sunbirdOperationsTasks.map((task, index) => {
            const isHigh = task.priority === 'High';
            const isMed = task.priority === 'Medium';
            const badgeClass = isHigh ? 'op-priority-high' : (isMed ? 'op-priority-medium' : 'op-priority-low');
            const dotColor = isHigh ? '#f87171' : (isMed ? '#fbbf24' : '#34d399');
            
            const insightClass = isHigh ? 'op-insight-danger' : (isMed ? 'op-insight-warning' : 'op-insight-success');

            return `
                <tr>
                    <td style="font-weight: 500; color: #e2e8f0;">${task.task}</td>
                    <td style="color: #94a3b8;">${task.area}</td>
                    <td>
                        <span class="op-priority-badge ${badgeClass}">
                            <span style="width: 6px; height: 6px; border-radius: 50%; background: ${dotColor};"></span>
                            ${task.priority}
                        </span>
                    </td>
                    <td class="op-insight-text ${insightClass}">${task.insight}</td>
                    <td>
                        <button class="btn-fix-this" onclick="window.openSunbirdOperationsModal(${index})">
                            Fix this
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

    } catch (error) {
        console.error('[Operations] Error:', error);
        document.getElementById('operations-tbody').innerHTML = `
            <tr><td colspan="5" class="sunbird-empty-row" style="color: #f87171;">Failed to load operations queue.</td></tr>
        `;
    }
}

function ensureSunbirdOperationsModal() {
    if (document.getElementById('sunbird-operations-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'sunbird-operations-modal';
    modal.className = 'sunbird-governance-evidence-modal'; 
    modal.innerHTML = `
        <div class="sunbird-governance-modal-dialog" role="dialog" aria-modal="true" style="max-width: 550px;">
            <button class="sunbird-governance-modal-close" type="button" aria-label="Close" onclick="document.getElementById('sunbird-operations-modal').classList.remove('open')">
                <i class="fas fa-times"></i>
            </button>
            <h4 id="op-modal-title" style="color: #e2e8f0; font-size: 1.1rem; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 10px; margin-bottom: 15px;">Task Details</h4>
            
            <div style="display: flex; flex-direction: column; gap: 15px;">
                <!-- Why it exists -->
                <div style="background: rgba(255,255,255,0.03); padding: 12px; border-radius: 8px; border-left: 3px solid #fbbf24;">
                    <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase; margin-bottom: 4px;">Why this task exists</div>
                    <div id="op-modal-why" style="font-size: 0.9rem; color: #cbd5e1; line-height: 1.5;"></div>
                </div>

                <!-- Affected Entities -->
                <div style="background: rgba(255,255,255,0.03); padding: 12px; border-radius: 8px; border-left: 3px solid #f87171;">
                    <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase; margin-bottom: 4px;">Affected Entities</div>
                    <div id="op-modal-affected" style="font-size: 0.9rem; color: #cbd5e1; font-weight: 500;"></div>
                </div>

                <!-- Remediation -->
                <div style="background: rgba(0, 110, 255, 0.05); padding: 12px; border-radius: 8px; border-left: 3px solid #3b82f6;">
                    <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase; margin-bottom: 8px;">Suggested Remediation Steps</div>
                    <div id="op-modal-remediation" style="font-size: 0.9rem; color: #e2e8f0; line-height: 1.6; white-space: pre-wrap;"></div>
                </div>
            </div>
            
            <div style="margin-top: 20px; display: flex; justify-content: flex-end;">
                <button class="btn-fix-this" style="background: #3b82f6; color: white;" onclick="document.getElementById('sunbird-operations-modal').classList.remove('open')">Acknowledge</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

window.openSunbirdOperationsModal = function(index) {
    const task = window.sunbirdOperationsTasks[index];
    if (!task) return;

    document.getElementById('op-modal-title').innerHTML = `<i class="fas fa-wrench" style="color: #3b82f6; margin-right: 8px;"></i> ${task.task}`;
    document.getElementById('op-modal-why').textContent = task.why;
    document.getElementById('op-modal-affected').textContent = task.affected;
    document.getElementById('op-modal-remediation').textContent = task.remediation;

    document.getElementById('sunbird-operations-modal').classList.add('open');
};
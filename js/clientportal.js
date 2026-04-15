/* Client Portal JavaScript */

let currentProject = null;
let charts = {};
let currentProjectIndex = 0;
let selectedProjectId = null;
let previewLockedByClick = false;

const mockProjects = [
    {
        id: 1,
        name: "Cisco Duo Licenses",
        type: "Enterprise Identity & Access Management",
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
        name: "Identity & Access",
        type: "User Management & Access Control",
        status: "active",
        risks: { critical: 0, high: 0, medium: 0 },
        securityScore: 0,
        uptime: 100,
        lastUpdate: "Loading...",
        image: "https://static.vecteezy.com/system/resources/thumbnails/018/911/406/small_2x/microsoft-logo-editorial-free-vector.jpg",
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
        name: "Devices",
        type: "Real-time support visibility and tracking",
        status: "active",
        risks: { critical: 1, high: 2, medium: 3 },
        securityScore: 88,
        uptime: 99.5,
        lastUpdate: "1 hour ago",
        icon: "fas fa-shopping-cart",
        cardMetrics: [
            { label: "Tickets Resolved", value: ": 156", icon: "fas fa-check-circle" },
            { label: "Avg Response Time", value: ": 2.5h", icon: "fas fa-clock" }
        ],
        cardFooter: "Active Issues: 8"
    },
    {
        id: 4,
        name: "Applications",
        type: "Automated protection and restore readiness",
        status: "active",
        risks: { critical: 1, high: 1, medium: 1 },
        securityScore: 90,
        uptime: 99.7,
        lastUpdate: "30 minutes ago",
        icon: "fas fa-database",
        cardMetrics: [
            { label: "Last Backup", value: ": 2 hours ago", icon: "fas fa-history" },
            { label: "Recovery Time", value: ": 15 mins", icon: "fas fa-hourglass-end" }
        ],
        cardFooter: "Backup Status: Healthy"
    },
    {
        id: 6,
        name: "Cloud data services",
        type: "Optomized cloud storage & Database health",
        status: "active",
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
    }
];

/* INITIALIZATION */
let microsoftUsersData = [];

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

// Fetch Microsoft users and populate Identity & Access cards
async function fetchMicrosoftUsersForCard() {
    try {
        console.log('[Microsoft Users] Fetching users data...');
        
        const authToken = localStorage.getItem('authToken');
        if (!authToken) {
            console.error('[Microsoft Users] No auth token found');
            return;
        }
        
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
        
        // Populate Identity & Access cards
        populateIdentityCards(data);
        
    } catch (error) {
        console.error('[Microsoft Users] Exception:', error);
        showNotification('Failed to load Microsoft Users data', false);
    }
}

// Populate Identity & Access cards
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
    
    // Create main Identity & Access card
    const card = document.createElement('div');
    card.className = 'identity-card';
    card.innerHTML = `
        <div class="identity-card-header">
            <i class="fas fa-users"></i>
            <div>
                <div class="identity-card-title">Identity & Access</div>
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

// Open Identity & Access full dashboard
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
    if (projectName) projectName.textContent = 'Identity & Access - Full Dashboard';
    if (projectStatus) projectStatus.textContent = 'Active';
    
    // Update back button to go back to projects
    const backBtn = document.getElementById('btn-back');
    if (backBtn) {
        backBtn.onclick = function() {
            dashboardView.style.display = 'none';
            document.getElementById('projects-view').style.display = 'block';
            
            // Restore generic parts for other projects
            if (statsGrid) statsGrid.style.display = 'grid';
            if (chartsSection) chartsSection.style.display = 'grid';
        };
    }
    
    // Initialize Identity dashboard content
    initializeIdentityDashboard();
}

// Initialize Identity & Access dashboard
function initializeIdentityDashboard() {
    console.log('[Identity Dashboard] Initializing dashboard...');
    console.log(`[Identity Dashboard] Users data available: ${microsoftUsersData.length}`);
    
    if (microsoftUsersData.length === 0) {
        console.warn('[Identity Dashboard] No user data available');
        return;
    }
    
    // Clear existing content
    const dashboardContent = document.querySelector('.monitoring-section');
    if (dashboardContent) {
        console.log('[Identity Dashboard] Found monitoring-section, updating content');
        dashboardContent.innerHTML = generateIdentityDashboardHTML();
    } else {
        console.warn('[Identity Dashboard] monitoring-section not found, creating/finding alternative');
        // Try to find and replace the entire dashboard content area
        const dashboardView = document.getElementById('dashboard-view');
        if (dashboardView) {
            // Find any content area and replace it
            const contentArea = dashboardView.querySelector('[class*="content"], [class*="monitoring"], .dashboard-content');
            if (contentArea) {
                contentArea.innerHTML = generateIdentityDashboardHTML();
            }
        }
    }
    
    // Initialize charts
    setTimeout(() => {
        console.log('[Identity Dashboard] Initializing charts and table');
        initializeIdentityCharts();
        populateIdentityTable();
    }, 100);
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


// Fetch Identity & Access data and update card preview
async function fetchIdentityAccessData() {
    try {
        const token = localStorage.getItem('authToken');
        const isLoggedIn = sessionStorage.getItem('isLoggedIn') === 'true';
        
        if (!token || !isLoggedIn) {
            console.log('[Identity Access] User not logged in. Skipping fetch.');
            return;
        }

        console.log('[Identity Access] Fetching Microsoft users...');
        
        const response = await fetch('/api/microsoft-users', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`API responded with status ${response.status}`);
        }

        const data = await response.json();
        
        if (!data.success || !data.users) {
            throw new Error(data.message || 'Invalid response format');
        }

        microsoftUsersData = data.users || [];
        console.log(`[Identity Access] Loaded ${microsoftUsersData.length} users`);

        // Update the Identity & Access project card with real data
        const identityProject = mockProjects.find(p => p.id === 2);
        if (identityProject) {
            const externalUsers = microsoftUsersData.filter(u => u.isExternal).length;
            const internalUsers = microsoftUsersData.length - externalUsers;
            
            identityProject.cardMetrics = [
                { label: "Total Users", value: `: ${microsoftUsersData.length}`, icon: "fas fa-users" },
                { label: "External", value: `: ${externalUsers}`, icon: "fas fa-user-secret" }
            ];
            identityProject.cardFooter = `Internal: ${internalUsers} | External: ${externalUsers}`;
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


/* IDENTITY & ACCESS DASHBOARD */
function generateIdentityDashboardHTML() {
    const internalUsers = microsoftUsersData.filter(u => !u.isExternal).length;
    const externalUsers = microsoftUsersData.filter(u => u.isExternal).length;
    const missingData = microsoftUsersData.filter(u => !u.jobTitle || !u.mobilePhone).length;
    
    return `
        <div class="monitoring-section" id="monitoring-section">
            <!-- Search & Filters + Table Section (Priority) -->
            <div class="management-header">
                <div class="users-filter-section">
                    <h3>User Management</h3>
                    <div class="filter-controls">
                        <input type="text" id="user-search-input" class="search-input" placeholder="Search by name or email...">
                        <select id="user-type-filter" class="filter-select">
                            <option value="all">All Users</option>
                            <option value="internal">Internal Only</option>
                            <option value="external">External Only</option>
                            <option value="missing-data">Missing Data</option>
                        </select>
                    </div>
                </div>
            </div>

            <!-- Users Table (Full Width) -->
            <div class="users-table-container">
                <table class="users-table" id="users-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Email</th>
                            <th>Job Title</th>
                            <th>Phone</th>
                            <th>Type</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody id="users-table-body">
                        <!-- Users will be populated here -->
                    </tbody>
                </table>
            </div>

            <!-- Summary Stats (Below Table) -->
            <div class="summary-stats">
                <div class="summary-stat-card">
                    <div class="stat-icon-box blue">
                        <i class="fas fa-users"></i>
                    </div>
                    <div class="stat-info">
                        <h3>Total Users</h3>
                        <p class="stat-number">${microsoftUsersData.length}</p>
                    </div>
                </div>
                
                <div class="summary-stat-card">
                    <div class="stat-icon-box green">
                        <i class="fas fa-user-tie"></i>
                    </div>
                    <div class="stat-info">
                        <h3>Internal Users</h3>
                        <p class="stat-number">${internalUsers}</p>
                    </div>
                </div>
                
                <div class="summary-stat-card">
                    <div class="stat-icon-box orange">
                        <i class="fas fa-user-secret"></i>
                    </div>
                    <div class="stat-info">
                        <h3>External Users</h3>
                        <p class="stat-number">${externalUsers}</p>
                    </div>
                </div>
                
                <div class="summary-stat-card">
                    <div class="stat-icon-box red">
                        <i class="fas fa-exclamation-circle"></i>
                    </div>
                    <div class="stat-info">
                        <h3>Missing Data</h3>
                        <p class="stat-number">${missingData}</p>
                    </div>
                </div>
            </div>

            <!-- Charts Section -->
            <div class="charts-container">
                <div class="chart-card" id="identity-pie-chart-container">
                    <h3 class="chart-title">User Distribution</h3>
                    <div class="chart-wrapper">
                        <canvas id="identityPieChart"></canvas>
                    </div>
                </div>
                
                <div class="chart-card" id="identity-line-chart-container">
                    <h3 class="chart-title">User Activity Trend</h3>
                    <div class="chart-wrapper">
                        <canvas id="identityLineChart"></canvas>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function initializeIdentityCharts() {
    console.log('[Identity Charts] Initializing charts...');
    
    // Calculate statistics
    const internalUsers = microsoftUsersData.filter(u => !u.isExternal).length;
    const externalUsers = microsoftUsersData.filter(u => u.isExternal).length;
    
    // Destroy existing charts if they exist and are valid Chart objects
    if (window.identityPieChart && typeof window.identityPieChart.destroy === 'function') {
        try {
            window.identityPieChart.destroy();
            console.log('[Identity Charts] Previous pie chart destroyed');
        } catch (e) {
            console.warn('[Identity Charts] Error destroying pie chart:', e.message);
        }
    }
    if (window.identityLineChart && typeof window.identityLineChart.destroy === 'function') {
        try {
            window.identityLineChart.destroy();
            console.log('[Identity Charts] Previous line chart destroyed');
        } catch (e) {
            console.warn('[Identity Charts] Error destroying line chart:', e.message);
        }
    }
    
    // Pie Chart - User Distribution
    const pieCtx = document.getElementById('identityPieChart');
    if (pieCtx) {
        window.identityPieChart = new Chart(pieCtx, {
            type: 'doughnut',
            data: {
                labels: ['Internal Users', 'External Users'],
                datasets: [{
                    data: [internalUsers, externalUsers],
                    backgroundColor: [
                        'rgba(0, 110, 255, 0.8)',
                        'rgba(255, 159, 64, 0.8)'
                    ],
                    borderColor: [
                        'rgba(0, 110, 255, 1)',
                        'rgba(255, 159, 64, 1)'
                    ],
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        labels: {
                            color: '#94a3b8',
                            font: { size: 12 }
                        }
                    }
                }
            }
        });
        console.log('[Identity Charts] Pie chart initialized');
    }
    
    // Line Chart - User Activity Trend (Mock data if not available)
    const lineCtx = document.getElementById('identityLineChart');
    if (lineCtx) {
        const generateTrendData = () => {
            const today = new Date();
            const labels = [];
            const data = [];
            let baseValue = microsoftUsersData.length - 10;
            
            for (let i = 6; i >= 0; i--) {
                const date = new Date(today);
                date.setDate(date.getDate() - i);
                labels.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
                data.push(Math.max(baseValue + Math.floor(Math.random() * 8) + i, 0));
            }
            
            return { labels, data };
        };
        
        const { labels, data } = generateTrendData();
        
        window.identityLineChart = new Chart(lineCtx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Total Users',
                    data: data,
                    borderColor: 'rgba(0, 110, 255, 1)',
                    backgroundColor: 'rgba(0, 110, 255, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 3,
                    pointBackgroundColor: 'rgba(0, 110, 255, 1)',
                    pointBorderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        labels: {
                            color: '#94a3b8',
                            font: { size: 12 }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { color: '#94a3b8' },
                        grid: { color: 'rgba(255, 255, 255, 0.05)' }
                    },
                    x: {
                        ticks: { color: '#94a3b8' },
                        grid: { color: 'rgba(255, 255, 255, 0.05)' }
                    }
                }
            }
        });
        console.log('[Identity Charts] Line chart initialized');
    }
}

function populateIdentityTable() {
    console.log('[Identity Table] Populating users table...');
    console.log(`[Identity Table] Total users in microsoftUsersData: ${microsoftUsersData.length}`);
    
    const tableBody = document.getElementById('users-table-body');
    const searchInput = document.getElementById('user-search-input');
    const filterSelect = document.getElementById('user-type-filter');
    
    if (!tableBody) {
        console.error('[Identity Table] Table body not found');
        return;
    }
    
    console.log('[Identity Table] Table body found, proceeding with population');
    
    // Function to render table
    const renderTable = () => {
        let filteredUsers = [...microsoftUsersData];
        
        // Apply search filter
        if (searchInput && searchInput.value) {
            const searchTerm = searchInput.value.toLowerCase();
            filteredUsers = filteredUsers.filter(u =>
                u.displayName.toLowerCase().includes(searchTerm) ||
                u.mail.toLowerCase().includes(searchTerm)
            );
        }
        
        // Apply type filter
        if (filterSelect && filterSelect.value !== 'all') {
            if (filterSelect.value === 'internal') {
                filteredUsers = filteredUsers.filter(u => !u.isExternal);
            } else if (filterSelect.value === 'external') {
                filteredUsers = filteredUsers.filter(u => u.isExternal);
            } else if (filterSelect.value === 'missing-data') {
                filteredUsers = filteredUsers.filter(u => !u.jobTitle || !u.mobilePhone);
            }
        }
        
        tableBody.innerHTML = '';
        
        if (filteredUsers.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 20px;">No users found</td></tr>`;
            return;
        }
        
        filteredUsers.forEach((user, index) => {
            const row = document.createElement('tr');
            const jobTitle = (user.jobTitle && user.jobTitle !== 'No Title') ? user.jobTitle : '<span style="color: #f87171;">Missing</span>';
            const phone = (user.mobilePhone && user.mobilePhone !== 'N/A') ? user.mobilePhone : '<span style="color: #f87171;">Missing</span>';
            row.innerHTML = `
                <td>${user.displayName || 'N/A'}</td>
                <td>${user.mail || user.userPrincipalName || 'N/A'}</td>
                <td>${jobTitle}</td>
                <td>${phone}</td>
                <td>
                    <span class="user-type-badge ${user.isExternal ? 'external' : 'internal'}">
                        ${user.isExternal ? 'External' : 'Internal'}
                    </span>
                </td>
                <td>
                    <span class="user-status-badge active">Active</span>
                </td>
            `;
            tableBody.appendChild(row);
            if (index === 0) {
                console.log('[Identity Table] First user added:', user.displayName);
            }
        });
        console.log(`[Identity Table] Total rows added: ${filteredUsers.length}`);
        console.log(`[Identity Table] Rendered ${filteredUsers.length} users`);
    };
    
    // Initial render
    renderTable();
    
    // Add event listeners
    if (searchInput) {
        searchInput.addEventListener('input', renderTable);
    }
    
    if (filterSelect) {
        filterSelect.addEventListener('change', renderTable);
    }
}

function initializeProjectsList() {
    const projectsGrid = document.getElementById('projects-grid');
    projectsGrid.innerHTML = '';
    
    document.getElementById('project-total').textContent = mockProjects.length;
    currentProjectIndex = 0;
    selectedProjectId = null;
    previewLockedByClick = false;
    
    displayCurrentProject();
    fetchDuoStats();
    fetchIdentityAccessData(); // Fetch Microsoft Graph users for the card preview
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
                const allCards = document.querySelectorAll('.project-card');
                allCards.forEach(card => card.classList.remove('glow-selected'));
                
                previewLockedByClick = true;
                selectedProjectId = project.id;
                projectCard.classList.add('glow-selected');
                showProjectPreview(project);
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
    document.getElementById('dashboard-view').style.display = 'block';
    
    // If this is the Identity & Access card, fetch API data
    if (project.isIdentityCard) {
        fetchIdentityData(project);
    } else {
        updateDashboardData(project);
        initializeCharts(project);
        initializeTabs();
    }
}

// Fetch Identity & Access data from API
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
        showNotification('Failed to load Identity & Access data', false);
        updateDashboardData(project);
    }
}

function goBackToProjects() {
    document.getElementById('dashboard-view').style.display = 'none';
    document.getElementById('projects-view').style.display = 'block';
    currentProject = null;
    destroyCharts();
}

function resetDashboard() {
    document.getElementById('projects-view').style.display = 'block';
    document.getElementById('dashboard-view').style.display = 'none';
    currentProject = null;
    destroyCharts();
    
    previewLockedByClick = false;
    selectedProjectId = null;
    const projectCard = document.querySelector('.project-card');
    if (projectCard) {
        projectCard.classList.remove('glow-selected');
    }
    hideProjectPreview();
}

/* DASHBOARD DATA */
function updateDashboardData(project) {
    // For Identity & Access, data is shown in the summary-stats section generated by generateIdentityDashboardHTML
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

/* BILLING & GOVERNANCE CARDS */
async function initializeBillingCard() {
    const billingCard = document.getElementById('billing-card');
    if (!billingCard) return;
    
    const token = localStorage.getItem('authToken');
    
    if (!token) {
        billingCard.innerHTML = '<p style="color: #bdbdbd; text-align: center; padding: 20px;">Please log in to view billing information.</p>';
        return;
    }
    
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
    
    const governanceData = [
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

function initializeSupportCard() {
    const supportCard = document.getElementById('support-card');
    
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
    if (currentProject && currentProject.hasTabs) {
        dashboardTabs.style.display = 'block';
        
        // Add event listeners to tab buttons
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const tabId = btn.getAttribute('data-tab');
                switchTab(tabId, tabBtns, tabContents);
                
                // Fetch Microsoft users when switching to identity tab
                if (tabId === 'identity-tab' && currentProject.microsoftGraphEnabled) {
                    fetchMicrosoftUsersData();
                }
            });
        });
        
        // Set default tab to "all"
        switchTab('all-tab', tabBtns, tabContents);
    } else {
        dashboardTabs.style.display = 'none';
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
            <td>${user.email}</td>
            <td>${user.jobTitle}</td>
            <td>${user.phone}</td>
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

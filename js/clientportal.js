/* Client Portal JavaScript */

let currentProject = null;
let charts = {};
let currentProjectIndex = 0;
let selectedProjectId = null;
let previewLockedByClick = false;

const mockProjects = [
    {
        id: 1,
        name: "Cisco Duo Licences",
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
        name: "Microsoft 365 security & health",
        type: "Proactive tenant security insights",
        status: "inactive",
        risks: { critical: 2, high: 3, medium: 5 },
        securityScore: 92,
        uptime: 99.8,
        lastUpdate: "2 hours ago",
        icon: "fas fa-globe",
        cardMetrics: [
            { label: "Licences", value: ": 92%", icon: "fas fa-shield-alt" },
            { label: "Usage", value: "99.8%", icon: "fas fa-server" }
        ],
        cardFooter: "IT budget saving: 12"
    },
    {
        id: 3,
        name: "Support & Service desk",
        type: "Real-time support visibility and tracking",
        status: "inactive",
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
        name: "Backup & recovery",
        type: "Automated protection and restore readiness",
        status: "inactive",
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
    }
];

/* INITIALIZATION */
document.addEventListener('DOMContentLoaded', function() {
    setupEventListeners();
    setupSessionManagement();
    initializeProjectsList();
    initializeBillingCard();
    initializeGovernanceCard();
    initializeSupportCard();
    updateCopyrightYear();
});

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
            
            // Switch to dashboard
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


// Updated: fetchDuoStats - Now with better error handling, loading states, and retries
async function fetchDuoStats(retryCount = 0) {
    const token = localStorage.getItem('authToken');
    if (!token) {
        console.warn('[Duo Sync] No auth token found. Skipping fetch.');
        return;
    }

    const duoProject = mockProjects.find(p => p.name === "Cisco Duo Licences");
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

function initializeProjectsList() {
    const projectsGrid = document.getElementById('projects-grid');
    projectsGrid.innerHTML = '';
    
    document.getElementById('project-total').textContent = mockProjects.length;
    currentProjectIndex = 0;
    selectedProjectId = null;
    previewLockedByClick = false;
    
    displayCurrentProject();
    fetchDuoStats();
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
    
    updateDashboardData(project);
    initializeCharts(project);
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
        
        // Show first 2 items, rest in dropdown if more than 2
        const visibleItems = items.slice(0, 2);
        const hiddenItems = items.slice(2);
        const showMoreButton = items.length > 2;
        
        const visibleItemsHtml = visibleItems.map(item => {
            const itemTotal = (parseFloat(item.Quantity || 0) * parseFloat(item.UnitPrice || 0)).toFixed(2);
            return `
                <div class="billing-item">
                    <span class="billing-item-name">${item.Description || 'Service'}</span>
                    <span class="billing-item-cost">${currency}${parseFloat(itemTotal).toLocaleString()}</span>
                </div>
            `;
        }).join('');
        
        const hiddenItemsHtml = hiddenItems.map(item => {
            const itemTotal = (parseFloat(item.Quantity || 0) * parseFloat(item.UnitPrice || 0)).toFixed(2);
            return `
                <div class="billing-item">
                    <span class="billing-item-name">${item.Description || 'Service'}</span>
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
                ${visibleItemsHtml}
                ${showMoreButton ? `
                    <div class="billing-items-more" id="billing-items-more" style="display: none;">
                        ${hiddenItemsHtml}
                    </div>
                    <button class="billing-see-more" id="billing-see-more-btn" onclick="toggleBillingItems()">
                        <span>See More</span>
                        <i class="fas fa-chevron-down"></i>
                    </button>
                ` : ''}
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
            <i class="fas fa-times-circle" style="color: red;"></i>
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

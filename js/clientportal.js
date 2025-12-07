/* Client Portal JavaScript */

let currentProject = null;
let charts = {};
let currentProjectIndex = 0;
let selectedProjectId = null;
let previewLockedByClick = false;

const mockProjects = [
    {
        id: 1,
        name: "Microsoft 365 security & health",
        type: "Proactive tenant security insights",
        status: "Active",
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
        id: 2,
        name: "Support & Service desk",
        type: "Real-time support visibility and tracking",
        status: "Active",
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
        id: 3,
        name: "Projects",
        type: "Project Activity Feed",
        status: "Active",
        risks: { critical: 0, high: 1, medium: 2 },
        securityScore: 95,
        uptime: 99.9,
        lastUpdate: "3 hours ago",
        icon: "fas fa-network-wired",
        cardMetrics: [
            { label: "0365 Security Audit", value: "", icon: "fas fa-file-alt" },
            { label: "0365 Identity and access management", value: "", icon: "fas fa-wrench"}
        ],
        cardFooter: "Last project update: 2 days ago"
    }/*,
    {
        id: 4,
        name: "Backup & recovery",
        type: "Automated protection and restore readiness",
        status: "Active",
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
        id: 5,
        name: "Cloud data services",
        type: "Optomized cloud storage & Database health",
        status: "Active",
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
    } */
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

    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
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
function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    if (!email || !password) {
        showError('Please fill in all fields');
        return;
    }

    if (!validateEmail(email)) {
        showError('Please enter a valid email address');
        return;
    }

    // Simulate API call
    setTimeout(() => {
        // Store user session
        sessionStorage.setItem('userEmail', email);
        sessionStorage.setItem('isLoggedIn', 'true');
        sessionStorage.setItem('loginTime', new Date().getTime());
        
        // Update UI
        const userName = email.split('@')[0];
        document.getElementById('user-name').textContent = userName;
        const userNameMobile = document.getElementById('user-name-mobile');
        if (userNameMobile) {
            userNameMobile.textContent = userName;
        }
        
        // Switch to dashboard
        document.getElementById('login-section').classList.remove('active');
        document.getElementById('dashboard-section').classList.add('active');
        
        // Clear form
        document.getElementById('login-form').reset();
    }, 500);
}

function handleLogout() {
    if (confirm('Are you sure you want to logout?')) {
        sessionStorage.removeItem('userEmail');
        sessionStorage.removeItem('isLoggedIn');
        sessionStorage.removeItem('loginTime');
        
        document.getElementById('dashboard-section').classList.remove('active');
        document.getElementById('login-section').classList.add('active');
        
        resetDashboard();
    }
}

function setupSessionManagement() {
    const isLoggedIn = sessionStorage.getItem('isLoggedIn');
    const userEmail = sessionStorage.getItem('userEmail');
    
    if (isLoggedIn === 'true' && userEmail) {
        document.getElementById('login-section').classList.remove('active');
        document.getElementById('dashboard-section').classList.add('active');
        const userName = userEmail.split('@')[0];
        document.getElementById('user-name').textContent = userName;
        const userNameMobile = document.getElementById('user-name-mobile');
        if (userNameMobile) {
            userNameMobile.textContent = userName;
        }
    }
}

function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function showError(message) {
    alert(message);
}

/* PROJECTS */
function initializeProjectsList() {
    const projectsGrid = document.getElementById('projects-grid');
    projectsGrid.innerHTML = '';
    
    document.getElementById('project-total').textContent = mockProjects.length;
    currentProjectIndex = 0;
    selectedProjectId = null;
    previewLockedByClick = false;
    
    displayCurrentProject();
}

function displayCurrentProject() {
    if (mockProjects.length === 0) return;
    
    const projectsGrid = document.getElementById('projects-grid');
    projectsGrid.innerHTML = '';
    
    // Display 3 projects at a time
    const visibleProjects = mockProjects.slice(currentProjectIndex, currentProjectIndex + 3);
    
    visibleProjects.forEach((project, index) => {
        const projectCard = createProjectCard(project);
        
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

function createProjectCards(projects) {
    const card = document.createElement('div');
    card.className = 'project-card';

    const risksCount = projects.risks.critical + projects.risks.high + projects.risks.medium;

    card.innerHTML = `
        <div class="project-card-header">
            <div class="project-icon">
                <i class="${projects.icon}"></i>
            </div>
            <div class="project-title">
                <h3${projects.name}</h3>
                <p class="project-type">${projects.type}</p>
            </div>
            <span class="project-status-badge">${projects.status}</span>
        </div>
        <div class="project-info">
            <div class="project-info-item">
                <i class="fas fa-shield-alt"></i>
                <span>Security score: ${projects.securityScore}%</span>
                <i class="fas fa-server"></i>
                <span>Usage: ${projects.uptime}%</span>
        <div class="project-risks">
            <span>S: ${risksCount}</span>
                        <div class="risk-indicator">
                <div class="risk-dot critical" title="${projects.risks.critical} Critical"></div>
                <div class="risk-dot high" title="${projects.risks.high} High"></div>
                <div class="risk-dot medium" title="${projects.risks.medium} Medium"></div>
            </div>
        </div>
         `;      
         
        return card;
}

function createProjectCard(project) {
    const card = document.createElement('div');
    card.className = 'project-card';
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
                <i class="${project.icon}"></i>
            </div>
            <div class="project-title">
                <h3>${project.name}</h3>
                <p class="project-type">${project.type}</p>
            </div>
            <span class="project-status-badge">${project.status}</span>
        </div>
        <div class="project-info">
            ${metricsHTML}
        </div>
        <div class="project-risks">
            <span>${project.cardFooter || 'Risks: ' + risksCount}</span>
            <div class="risk-indicator">
                <div class="risk-dot ${project.risks.critical > 0 ? 'critical' : project.risks.high > 0 ? 'high' : 'medium'}" 
                     title="${project.risks.critical > 0 ? project.risks.critical + ' Critical' : project.risks.high > 0 ? project.risks.high + ' High' : project.risks.medium + ' Medium'}"></div>
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
    document.getElementById('copyright-year').textContent = new Date().getFullYear();
}

/* BILLING & GOVERNANCE CARDS */
function initializeBillingCard() {
    const billingCard = document.getElementById('billing-card');
    
    const billingData = {
        totalAmount: 4250,
        currency: 'R',
        items: [
            { name: 'Cloud Infrastructure', cost: 1200 },
            { name: 'Security Monitoring', cost: 850 },


        ]
    };
    
    const today = new Date();
    const dueDate = new Date(today.getFullYear(), today.getMonth() + 1, today.getDate());
    const dueDateString = dueDate.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
    
    const itemsHtml = billingData.items.map(item => `
        <div class="billing-item">
            <span class="billing-item-name">${item.name}</span>
            <span class="billing-item-cost">${billingData.currency}${item.cost}</span>
        </div>
    `).join('');
    
    billingCard.innerHTML = `
        <div class="billing-card-header">
            <i class="fas fa-credit-card"></i>
            <h3>Billing Statement</h3>
        </div>
        <div class="billing-amount">
            <span class="billing-currency">${billingData.currency}</span>${billingData.totalAmount.toLocaleString()}
        </div>
        <div class="billing-summary">
            <div class="billing-summary-item">
                <span class="billing-summary-label">Monthly Subscription</span>
                <span class="billing-summary-value">${billingData.currency}${billingData.totalAmount}</span>
            </div>
            <div class="billing-summary-item">
                <span class="billing-summary-label">Total Services</span>
                <span class="billing-summary-value">${billingData.items.length}</span>
            </div>
            <div class="billing-summary-item">
                <span class="billing-summary-label">Due Date</span>
                <span class="billing-summary-value" style="color: var(--primary);">${dueDateString}</span>
            </div>
        </div>
        <div class="billing-items">
            ${itemsHtml}
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
}

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
                <span class="governance-item-text"><strong>24/7 Priority Support</strong> - Response in 30 minutes</span>
            </div>
            <div class="governance-item">
                <i class="fas fa-phone"></i>
                <span class="governance-item-text"><strong>Dedicated Support Team</strong> - 2 assigned engineers</span>
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

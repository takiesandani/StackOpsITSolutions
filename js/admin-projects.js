document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('authToken');
    if (!token) {
        window.location.href = 'signin.html';
        return;
    }

    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };

    const companyFilter = document.getElementById('company-filter');
    const userFilter = document.getElementById('user-filter');

    // Load companies for filter
    const loadCompanies = async () => {
        try {
            const response = await fetch('/api/admin/companies', { headers });
            if (response.ok) {
                const companies = await response.json();
                companies.forEach(company => {
                    const option = document.createElement('option');
                    option.value = company.ID;
                    option.textContent = company.CompanyName;
                    companyFilter.appendChild(option);
                });
            }
        } catch (error) {
            console.error('Error loading companies:', error);
        }
    };

    // Load users for filter
    const loadUsers = async () => {
        try {
            const response = await fetch('/api/admin/clients', { headers });
            if (response.ok) {
                const users = await response.json();
                users.forEach(user => {
                    const option = document.createElement('option');
                    option.value = user.id;
                    option.textContent = `${user.firstname} ${user.lastname}`;
                    userFilter.appendChild(option);
                });
            }
        } catch (error) {
            console.error('Error loading users:', error);
        }
    };

    // Load projects
    const loadProjects = async () => {
        try {
            let url = '/api/admin/projects';
            const params = new URLSearchParams();
            if (companyFilter.value) params.append('companyId', companyFilter.value);
            if (params.toString()) url += '?' + params.toString();

            const response = await fetch(url, { headers });
            if (!response.ok) throw new Error('Failed to load projects');

            const projects = await response.json();
            const tbody = document.querySelector('#projects-table tbody');
            tbody.innerHTML = '';

            if (projects.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="text-center">No projects found</td></tr>';
            } else {
                projects.forEach(project => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${project.ProjectName || '-'}</td>
                        <td>${project.CompanyName || '-'}</td>
                        <td><span class="status-badge">${project.Status || 'Active'}</span></td>
                        <td>${project.AssignedToName || '-'}</td>
                        <td>${project.DueDate ? new Date(project.DueDate).toLocaleDateString() : '-'}</td>
                        <td>
                            <button class="btn btn-sm btn-secondary" onclick="viewProject(${project.ProjectID})">View</button>
                        </td>
                    `;
                    tbody.appendChild(row);
                });
            }
        } catch (error) {
            console.error('Error loading projects:', error);
            document.querySelector('#projects-table tbody').innerHTML = 
                '<tr><td colspan="6" class="text-center">Error loading projects or Projects table does not exist</td></tr>';
        }
    };

    window.viewProject = (projectId) => {
        window.location.href = `admin-project-details.html?id=${projectId}`;
    };

    if (companyFilter) companyFilter.addEventListener('change', loadProjects);
    if (userFilter) userFilter.addEventListener('change', loadProjects);

    await loadCompanies();
    await loadUsers();
    await loadProjects();
});


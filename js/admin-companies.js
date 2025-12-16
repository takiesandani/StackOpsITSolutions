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

    const loadCompanies = async () => {
        try {
            const response = await fetch('/api/admin/companies', { headers });
            if (!response.ok) throw new Error('Failed to load companies');

            const companies = await response.json();
            const tbody = document.querySelector('#companies-table tbody');
            tbody.innerHTML = '';

            if (companies.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center">No companies found</td></tr>';
            } else {
                companies.forEach(company => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${company.CompanyName || '-'}</td>
                        <td>${company.Industry || '-'}</td>
                        <td>${company.City || '-'}</td>
                        <td><span class="status-badge">Active</span></td>
                        <td>
                            <button class="btn btn-sm btn-secondary" onclick="viewCompany(${company.ID})">View</button>
                            <button class="btn btn-sm btn-secondary" onclick="editCompany(${company.ID})">Edit</button>
                        </td>
                    `;
                    tbody.appendChild(row);
                });
            }
        } catch (error) {
            console.error('Error loading companies:', error);
            document.querySelector('#companies-table tbody').innerHTML = 
                '<tr><td colspan="5" class="text-center">Error loading companies</td></tr>';
        }
    };

    window.viewCompany = (companyId) => {
        window.location.href = `admin-company-details.html?id=${companyId}`;
    };

    window.editCompany = (companyId) => {
        // TODO: Implement edit company
        alert('Edit company functionality coming soon');
    };

    loadCompanies();
});


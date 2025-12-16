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

    // Load clients
    const loadClients = async () => {
        try {
            let url = '/api/admin/clients';
            if (companyFilter.value) {
                url += `?companyId=${companyFilter.value}`;
            }

            const response = await fetch(url, { headers });
            if (!response.ok) throw new Error('Failed to load clients');

            const clients = await response.json();
            const tbody = document.querySelector('#clients-table tbody');
            tbody.innerHTML = '';

            if (clients.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="text-center">No clients found</td></tr>';
            } else {
                clients.forEach(client => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${client.firstname} ${client.lastname}</td>
                        <td>${client.email}</td>
                        <td>${client.CompanyName || '-'}</td>
                        <td>${client.role || '-'}</td>
                        <td><span class="status-badge">${client.isactive ? 'Active' : 'Inactive'}</span></td>
                        <td>
                            <button class="btn btn-sm btn-secondary" onclick="viewClient(${client.id})">View</button>
                            <button class="btn btn-sm btn-secondary" onclick="editClient(${client.id})">Edit</button>
                            <button class="btn btn-sm btn-primary" onclick="createInvoice(${client.id}, ${client.CompanyID})">Create Invoice</button>
                        </td>
                    `;
                    tbody.appendChild(row);
                });
            }
        } catch (error) {
            console.error('Error loading clients:', error);
            document.querySelector('#clients-table tbody').innerHTML = 
                '<tr><td colspan="6" class="text-center">Error loading clients</td></tr>';
        }
    };

    window.viewClient = (clientId) => {
        window.location.href = `admin-client-view.html?id=${clientId}`;
    };

    window.editClient = (clientId) => {
        window.location.href = `admin-client-form.html?id=${clientId}`;
    };

    window.createInvoice = (userId, companyId) => {
        sessionStorage.setItem('invoiceClientData', JSON.stringify({
            userId,
            companyId
        }));
        window.location.href = 'admin-invoice-create-step1.html';
    };

    if (companyFilter) {
        companyFilter.addEventListener('change', loadClients);
    }

    await loadCompanies();
    await loadClients();
});


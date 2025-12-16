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
    const clientFilter = document.getElementById('client-filter');

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

    // Load clients for filter
    const loadClients = async () => {
        try {
            const response = await fetch('/api/admin/clients', { headers });
            if (response.ok) {
                const clients = await response.json();
                clients.forEach(client => {
                    const option = document.createElement('option');
                    option.value = client.id;
                    option.textContent = `${client.firstname} ${client.lastname}`;
                    clientFilter.appendChild(option);
                });
            }
        } catch (error) {
            console.error('Error loading clients:', error);
        }
    };

    // Load invoices
    const loadInvoices = async () => {
        try {
            let url = '/api/admin/invoices';
            const params = new URLSearchParams();
            if (companyFilter.value) params.append('companyId', companyFilter.value);
            if (clientFilter.value) params.append('userId', clientFilter.value);
            if (params.toString()) url += '?' + params.toString();

            const response = await fetch(url, { headers });
            if (!response.ok) throw new Error('Failed to load invoices');

            const invoices = await response.json();
            const tbody = document.querySelector('#invoices-table tbody');
            tbody.innerHTML = '';

            if (invoices.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="text-center">No invoices found</td></tr>';
            } else {
                invoices.forEach(inv => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${inv.InvoiceNumber || inv.InvoiceID}</td>
                        <td>${inv.ClientName || '-'}</td>
                        <td>${inv.CompanyName || '-'}</td>
                        <td>R${parseFloat(inv.TotalAmount || 0).toFixed(2)}</td>
                        <td><span class="status-badge status-${(inv.Status || 'Pending').toLowerCase()}">${inv.Status || 'Pending'}</span></td>
                        <td>${inv.DueDate ? new Date(inv.DueDate).toLocaleDateString() : '-'}</td>
                        <td>
                            <button class="btn btn-sm btn-secondary" onclick="viewInvoice(${inv.InvoiceID})">View</button>
                            <button class="btn btn-sm btn-primary" onclick="addPayment(${inv.InvoiceID})">Add Payment</button>
                        </td>
                    `;
                    tbody.appendChild(row);
                });
            }
        } catch (error) {
            console.error('Error loading invoices:', error);
            document.querySelector('#invoices-table tbody').innerHTML = 
                '<tr><td colspan="7" class="text-center">Error loading invoices</td></tr>';
        }
    };

    window.viewInvoice = (invoiceId) => {
        // TODO: Implement view invoice details
        alert('View invoice functionality coming soon');
    };

    window.addPayment = (invoiceId) => {
        window.location.href = `admin-payment-form.html?invoiceId=${invoiceId}`;
    };

    if (companyFilter) companyFilter.addEventListener('change', loadInvoices);
    if (clientFilter) clientFilter.addEventListener('change', loadInvoices);

    await loadCompanies();
    await loadClients();
    await loadInvoices();
});


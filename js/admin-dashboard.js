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

    try {
        // Fetch dashboard stats
        const [companiesRes, clientsRes, invoicesRes, paymentsRes] = await Promise.all([
            fetch('/api/admin/companies', { headers }),
            fetch('/api/admin/clients', { headers }),
            fetch('/api/admin/invoices', { headers }),
            fetch('/api/admin/payments', { headers })
        ]);

        const companies = companiesRes.ok ? await companiesRes.json() : [];
        const clients = clientsRes.ok ? await clientsRes.json() : [];
        const invoices = invoicesRes.ok ? await invoicesRes.json() : [];
        const payments = paymentsRes.ok ? await paymentsRes.json() : [];

        // Update stats
        document.getElementById('total-companies').textContent = companies.length || 0;
        document.getElementById('total-clients').textContent = clients.length || 0;
        document.getElementById('total-invoices').textContent = invoices.length || 0;

        // Calculate total revenue
        const totalRevenue = payments.reduce((sum, p) => sum + parseFloat(p.AmountPaid || 0), 0);
        document.getElementById('total-revenue').textContent = `R${totalRevenue.toFixed(2)}`;

        // Display recent invoices
        const recentInvoices = invoices.slice(0, 10);
        const tbody = document.querySelector('#recent-invoices tbody');
        tbody.innerHTML = '';

        if (recentInvoices.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center">No invoices found</td></tr>';
        } else {
            recentInvoices.forEach(inv => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${inv.InvoiceNumber || inv.InvoiceID}</td>
                    <td>${inv.CompanyName || '-'}</td>
                    <td>R${parseFloat(inv.TotalAmount || 0).toFixed(2)}</td>
                    <td><span class="status-badge status-${inv.Status?.toLowerCase()}">${inv.Status || 'Pending'}</span></td>
                    <td>${inv.DueDate ? new Date(inv.DueDate).toLocaleDateString() : '-'}</td>
                `;
                tbody.appendChild(row);
            });
        }
    } catch (error) {
        console.error('Error loading dashboard:', error);
    }
});


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

    // WhatsApp Overdue Reminders Handler
    const sendOverdueRemindersBtn = document.getElementById('send-overdue-reminders');
    if (sendOverdueRemindersBtn) {
        sendOverdueRemindersBtn.addEventListener('click', async () => {
            const statusDiv = document.getElementById('whatsapp-status');
            const originalButtonText = sendOverdueRemindersBtn.innerHTML;
            
            try {
                sendOverdueRemindersBtn.disabled = true;
                sendOverdueRemindersBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
                statusDiv.style.display = 'block';
                statusDiv.className = 'status-info';
                statusDiv.innerHTML = '<i class="fas fa-info-circle"></i> Fetching overdue invoices...';

                // Fetch overdue invoices
                const invoicesRes = await fetch('/api/admin/invoices', { headers });
                const invoices = await invoicesRes.json();

                // Filter overdue invoices
                const today = new Date();
                const overdueInvoices = invoices.filter(inv => {
                    return inv.Status !== 'Paid' && inv.DueDate && new Date(inv.DueDate) < today;
                });

                if (overdueInvoices.length === 0) {
                    statusDiv.className = 'status-success';
                    statusDiv.innerHTML = '<i class="fas fa-check-circle"></i> No overdue invoices found!';
                    sendOverdueRemindersBtn.innerHTML = originalButtonText;
                    sendOverdueRemindersBtn.disabled = false;
                    return;
                }

                // Send reminders
                statusDiv.innerHTML = `<i class="fas fa-info-circle"></i> Sending reminders to ${overdueInvoices.length} overdue invoice(s)...`;

                const response = await fetch('/api/whatsapp/send-overdue-reminders', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ invoices: overdueInvoices })
                });

                if (response.ok) {
                    const result = await response.json();
                    statusDiv.className = 'status-success';
                    statusDiv.innerHTML = `<i class="fas fa-check-circle"></i> Success! Sent ${result.sent || overdueInvoices.length} WhatsApp reminder(s).`;
                } else {
                    const error = await response.json();
                    statusDiv.className = 'status-error';
                    statusDiv.innerHTML = `<i class="fas fa-exclamation-circle"></i> Error: ${error.message || 'Failed to send reminders'}`;
                }
            } catch (error) {
                console.error('Error sending overdue reminders:', error);
                statusDiv.className = 'status-error';
                statusDiv.innerHTML = `<i class="fas fa-exclamation-circle"></i> Error: ${error.message}`;
            } finally {
                sendOverdueRemindersBtn.innerHTML = originalButtonText;
                sendOverdueRemindersBtn.disabled = false;
            }
        });
    }
});


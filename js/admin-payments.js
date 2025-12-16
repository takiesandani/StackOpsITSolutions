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

    const invoiceFilter = document.getElementById('invoice-filter');

    // Load invoices for filter
    const loadInvoices = async () => {
        try {
            const response = await fetch('/api/admin/invoices', { headers });
            if (response.ok) {
                const invoices = await response.json();
                invoices.forEach(invoice => {
                    const option = document.createElement('option');
                    option.value = invoice.InvoiceID;
                    option.textContent = `Invoice #${invoice.InvoiceNumber || invoice.InvoiceID} - R${parseFloat(invoice.TotalAmount || 0).toFixed(2)}`;
                    invoiceFilter.appendChild(option);
                });
            }
        } catch (error) {
            console.error('Error loading invoices:', error);
        }
    };

    // Load payments
    const loadPayments = async () => {
        try {
            let url = '/api/admin/payments';
            if (invoiceFilter.value) {
                url += `?invoiceId=${invoiceFilter.value}`;
            }

            const response = await fetch(url, { headers });
            if (!response.ok) throw new Error('Failed to load payments');

            const payments = await response.json();
            const tbody = document.querySelector('#payments-table tbody');
            tbody.innerHTML = '';

            if (payments.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="text-center">No payments found</td></tr>';
            } else {
                payments.forEach(payment => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${payment.PaymentDate ? new Date(payment.PaymentDate).toLocaleDateString() : '-'}</td>
                        <td>${payment.InvoiceNumber || payment.InvoiceID}</td>
                        <td>${payment.ClientName || '-'}</td>
                        <td>R${parseFloat(payment.AmountPaid || 0).toFixed(2)}</td>
                        <td>${payment.Method || '-'}</td>
                        <td>
                            <button class="btn btn-sm btn-secondary" onclick="viewPayment(${payment.PaymentID})">View</button>
                        </td>
                    `;
                    tbody.appendChild(row);
                });
            }
        } catch (error) {
            console.error('Error loading payments:', error);
            document.querySelector('#payments-table tbody').innerHTML = 
                '<tr><td colspan="6" class="text-center">Error loading payments</td></tr>';
        }
    };

    window.viewPayment = (paymentId) => {
        // TODO: Implement view payment
        alert('View payment functionality coming soon');
    };

    if (invoiceFilter) {
        invoiceFilter.addEventListener('change', loadPayments);
    }

    await loadInvoices();
    await loadPayments();
});


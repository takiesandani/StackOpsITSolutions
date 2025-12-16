document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('authToken');
    if (!token) {
        window.location.href = 'signin.html';
        return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const companyId = urlParams.get('id');

    if (!companyId) {
        window.location.href = 'admin-companies.html';
        return;
    }

    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };

    const loadCompanyDetails = async () => {
        try {
            const response = await fetch(`/api/admin/companies/${companyId}/details`, { headers });
            if (!response.ok) throw new Error('Failed to load company details');

            const data = await response.json();
            const { company, clients, invoices, payments } = data;

            // Update company info
            document.getElementById('company-name').textContent = company.CompanyName;
            document.getElementById('info-company-name').textContent = company.CompanyName || '-';
            document.getElementById('info-industry').textContent = company.Industry || '-';
            document.getElementById('info-website').textContent = company.Website || '-';
            document.getElementById('info-address').textContent = company.Address || '-';
            document.getElementById('info-city').textContent = company.City || '-';
            document.getElementById('info-state').textContent = company.State || '-';
            document.getElementById('info-zipcode').textContent = company.ZipCode || '-';
            document.getElementById('info-country').textContent = company.Country || '-';

            // Update clients table
            const clientsTbody = document.querySelector('#clients-table tbody');
            clientsTbody.innerHTML = '';
            if (clients.length === 0) {
                clientsTbody.innerHTML = '<tr><td colspan="6" class="text-center">No clients found</td></tr>';
            } else {
                clients.forEach(client => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${client.firstname} ${client.lastname}</td>
                        <td>${client.email}</td>
                        <td>${company.CompanyName || '-'}</td>
                        <td>${client.role || '-'}</td>
                        <td><span class="status-badge">${client.isactive ? 'Active' : 'Inactive'}</span></td>
                        <td>
                            <button class="btn btn-sm btn-secondary" onclick="editClient(${client.id})">Edit</button>
                        </td>
                    `;
                    clientsTbody.appendChild(row);
                });
            }

            // Update invoices table
            const invoicesTbody = document.querySelector('#invoices-table tbody');
            invoicesTbody.innerHTML = '';
            if (invoices.length === 0) {
                invoicesTbody.innerHTML = '<tr><td colspan="6" class="text-center">No invoices found</td></tr>';
            } else {
                invoices.forEach(inv => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${inv.InvoiceNumber || inv.InvoiceID}</td>
                        <td>-</td>
                        <td>R${parseFloat(inv.TotalAmount || 0).toFixed(2)}</td>
                        <td><span class="status-badge status-${(inv.Status || 'Pending').toLowerCase()}">${inv.Status || 'Pending'}</span></td>
                        <td>${inv.DueDate ? new Date(inv.DueDate).toLocaleDateString() : '-'}</td>
                        <td>
                            <button class="btn btn-sm btn-secondary" onclick="viewInvoice(${inv.InvoiceID})">View</button>
                        </td>
                    `;
                    invoicesTbody.appendChild(row);
                });
            }

            // Update payments table
            const paymentsTbody = document.querySelector('#payments-table tbody');
            paymentsTbody.innerHTML = '';
            if (payments.length === 0) {
                paymentsTbody.innerHTML = '<tr><td colspan="4" class="text-center">No payments found</td></tr>';
            } else {
                payments.forEach(payment => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${payment.PaymentDate ? new Date(payment.PaymentDate).toLocaleDateString() : '-'}</td>
                        <td>${payment.InvoiceNumber || '-'}</td>
                        <td>R${parseFloat(payment.AmountPaid || 0).toFixed(2)}</td>
                        <td>${payment.Method || '-'}</td>
                    `;
                    paymentsTbody.appendChild(row);
                });
            }

            // Update projects table
            const projectsTbody = document.querySelector('#projects-table tbody');
            if (projectsTbody) {
                try {
                    const projectsRes = await fetch(`/api/admin/projects?companyId=${companyId}`, { headers });
                    if (projectsRes.ok) {
                        const projects = await projectsRes.json();
                        projectsTbody.innerHTML = '';
                        if (projects.length === 0) {
                            projectsTbody.innerHTML = '<tr><td colspan="5" class="text-center">No projects found</td></tr>';
                        } else {
                            projects.forEach(project => {
                                const row = document.createElement('tr');
                                row.innerHTML = `
                                    <td>${project.ProjectName || '-'}</td>
                                    <td><span class="status-badge">${project.Status || 'Active'}</span></td>
                                    <td>${project.AssignedToName || '-'}</td>
                                    <td>${project.DueDate ? new Date(project.DueDate).toLocaleDateString() : '-'}</td>
                                    <td>
                                        <button class="btn btn-sm btn-secondary" onclick="viewProject(${project.ProjectID})">View</button>
                                    </td>
                                `;
                                projectsTbody.appendChild(row);
                            });
                        }
                    }
                } catch (error) {
                    projectsTbody.innerHTML = '<tr><td colspan="5" class="text-center">No projects found</td></tr>';
                }
            }
        } catch (error) {
            console.error('Error loading company details:', error);
        }
    };

    window.editClient = (clientId) => {
        window.location.href = `admin-client-form.html?id=${clientId}`;
    };

    window.viewInvoice = (invoiceId) => {
        window.location.href = `admin-invoice-view.html?id=${invoiceId}`;
    };

    window.viewProject = (projectId) => {
        window.location.href = `admin-project-details.html?id=${projectId}`;
    };

    loadCompanyDetails();
});


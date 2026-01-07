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

    // Step 1: Load companies and clients
    const companySelect = document.getElementById('company-select');
    const clientSelect = document.getElementById('client-select');
    const selectClientForm = document.getElementById('select-client-form');

    if (companySelect) {
        // Load companies
        try {
            const response = await fetch('/api/admin/companies', { headers });
            if (response.ok) {
                const companies = await response.json();
                companies.forEach(company => {
                    const option = document.createElement('option');
                    option.value = company.ID;
                    option.textContent = company.CompanyName;
                    companySelect.appendChild(option);
                });
            }
        } catch (error) {
            console.error('Error loading companies:', error);
        }

        // When company is selected, load clients
        companySelect.addEventListener('change', async (e) => {
            const companyId = e.target.value;
            clientSelect.innerHTML = '<option value="">Select a client...</option>';
            clientSelect.disabled = !companyId;

            if (companyId) {
                try {
                    const response = await fetch(`/api/admin/clients?companyId=${companyId}`, { headers });
                    if (response.ok) {
                        const clients = await response.json();
                        clients.forEach(client => {
                            const option = document.createElement('option');
                            option.value = client.id;
                            option.textContent = `${client.firstname} ${client.lastname} (${client.email})`;
                            clientSelect.appendChild(option);
                        });
                    }
                } catch (error) {
                    console.error('Error loading clients:', error);
                }
            }
        });
    }

    // Step 1 form submission
    if (selectClientForm) {
        selectClientForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const companyId = companySelect.value;
            const userId = clientSelect.value;
            const companyName = companySelect.options[companySelect.selectedIndex].textContent;
            const clientName = clientSelect.options[clientSelect.selectedIndex].textContent;

            if (!companyId || !userId) {
                alert('Please select both company and client');
                return;
            }

            // Store in sessionStorage for next step
            sessionStorage.setItem('invoiceClientData', JSON.stringify({
                companyId,
                userId,
                companyName,
                clientName
            }));

            window.location.href = 'admin-invoice-create-step2.html';
        });
    }

    // Step 2: Invoice details form
    const invoiceDetailsForm = document.getElementById('invoice-details-form');
    if (invoiceDetailsForm) {
        invoiceDetailsForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const invoiceData = {
                companyId: formData.get('companyId'),
                userId: formData.get('userId'),
                invoiceDate: formData.get('invoiceDate'),
                dueDate: formData.get('dueDate'),
                status: formData.get('status')
            };

            // Get client data from step 1
            const clientData = JSON.parse(sessionStorage.getItem('invoiceClientData') || '{}');
            invoiceData.clientName = clientData.clientName;
            invoiceData.companyName = clientData.companyName;

            // Store for step 3
            sessionStorage.setItem('invoiceData', JSON.stringify(invoiceData));
            window.location.href = 'admin-invoice-create-step3.html';
        });
    }

    // Step 3: Invoice items
    let invoiceItems = JSON.parse(sessionStorage.getItem('invoiceItems') || '[]');
    const addItemBtn = document.getElementById('add-item-btn');
    const addItemForm = document.getElementById('add-item-form');
    const addItemModal = document.getElementById('add-item-modal');
    const closeModal = document.getElementById('close-modal');
    const cancelItemBtn = document.getElementById('cancel-item-btn');
    const itemsTbody = document.getElementById('items-tbody');
    const totalAmountEl = document.getElementById('total-amount');
    const invoiceItemsForm = document.getElementById('invoice-items-form');

    const updateItemsTable = () => {
        if (!itemsTbody) return;
        itemsTbody.innerHTML = '';
        if (invoiceItems.length === 0) {
            itemsTbody.innerHTML = '<tr><td colspan="5" class="text-center">No items added yet. Click "Add Item" to get started.</td></tr>';
        } else {
            invoiceItems.forEach((item, index) => {
                const row = document.createElement('tr');
                const amount = item.quantity * item.unitPrice;
                row.innerHTML = `
                    <td>${item.description}</td>
                    <td>${item.quantity}</td>
                    <td>R${parseFloat(item.unitPrice).toFixed(2)}</td>
                    <td>R${amount.toFixed(2)}</td>
                    <td>
                        <button class="btn btn-sm btn-danger" onclick="removeItem(${index})">Remove</button>
                    </td>
                `;
                itemsTbody.appendChild(row);
            });
        }

        // Update total
        const total = invoiceItems.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
        if (totalAmountEl) {
            totalAmountEl.textContent = `R${total.toFixed(2)}`;
        }
        
        // Save to sessionStorage
        sessionStorage.setItem('invoiceItems', JSON.stringify(invoiceItems));
    };

    window.removeItem = (index) => {
        invoiceItems.splice(index, 1);
        updateItemsTable();
    };

    if (addItemBtn) {
        addItemBtn.addEventListener('click', () => {
            addItemModal.classList.add('active');
        });
    }

    if (closeModal) {
        closeModal.addEventListener('click', () => {
            addItemModal.classList.remove('active');
            addItemForm.reset();
        });
    }

    if (cancelItemBtn) {
        cancelItemBtn.addEventListener('click', () => {
            addItemModal.classList.remove('active');
            addItemForm.reset();
        });
    }

    if (addItemForm) {
        addItemForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const description = document.getElementById('item-description').value;
            const quantity = parseInt(document.getElementById('item-quantity').value);
            const unitPrice = parseFloat(document.getElementById('item-unit-price').value);

            invoiceItems.push({ description, quantity, unitPrice });
            updateItemsTable();
            addItemModal.classList.remove('active');
            addItemForm.reset();
        });
    }

    // Step 3 form submission -> Go to Preview
    if (invoiceItemsForm) {
        invoiceItemsForm.addEventListener('submit', (e) => {
            e.preventDefault();
            if (invoiceItems.length === 0) {
                alert('Please add at least one item to the invoice');
                return;
            }
            
            // Items are already saved to sessionStorage in updateItemsTable
            window.location.href = 'admin-invoice-create-preview.html';
        });
    }

    // Preview Page Logic
    const pdfPreview = document.getElementById('pdf-preview');
    if (pdfPreview && window.location.pathname.includes('admin-invoice-create-preview.html')) {
        const loadingOverlay = document.getElementById('loading-overlay');
        const previewSendBtn = document.getElementById('preview-send-btn');
        const previewEditBtn = document.getElementById('preview-edit-btn');
        const previewCancelBtn = document.getElementById('preview-cancel-btn');
        const previewBackBtn = document.getElementById('preview-back-btn');

        const invoiceData = JSON.parse(sessionStorage.getItem('invoiceData') || '{}');
        const clientData = JSON.parse(sessionStorage.getItem('invoiceClientData') || '{}');
        const items = JSON.parse(sessionStorage.getItem('invoiceItems') || '[]');
        const totalAmount = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);

        const generatePreview = async () => {
            loadingOverlay.classList.add('active');
            try {
                const response = await fetch('/api/admin/invoices/preview', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        CompanyID: invoiceData.companyId,
                        UserID: clientData.userId,
                        InvoiceDate: invoiceData.invoiceDate,
                        DueDate: invoiceData.dueDate,
                        TotalAmount: totalAmount,
                        Items: items.map(item => ({
                            Description: item.description,
                            Quantity: item.quantity,
                            UnitPrice: item.unitPrice
                        }))
                    })
                });

                if (!response.ok) {
                    throw new Error('Failed to generate preview');
                }

                const result = await response.json();
                const pdfBase64 = result.pdf;
                pdfPreview.src = `data:application/pdf;base64,${pdfBase64}`;
            } catch (error) {
                console.error('Error generating preview:', error);
                alert('Error generating preview. Please try again.');
            } finally {
                loadingOverlay.classList.remove('active');
            }
        };

        generatePreview();

        previewSendBtn.addEventListener('click', async () => {
            if (!confirm('Are you sure you want to send this invoice to the client?')) return;

            previewSendBtn.disabled = true;
            previewSendBtn.textContent = 'Sending...';
            loadingOverlay.classList.add('active');
            document.getElementById('loading-text').textContent = 'Creating & Sending Invoice...';

            try {
                const response = await fetch('/api/admin/invoices', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        CompanyID: invoiceData.companyId,
                        UserID: clientData.userId,
                        InvoiceDate: invoiceData.invoiceDate,
                        DueDate: invoiceData.dueDate,
                        TotalAmount: totalAmount,
                        Status: invoiceData.status,
                        Items: items.map(item => ({
                            Description: item.description,
                            Quantity: item.quantity,
                            UnitPrice: item.unitPrice
                        }))
                    })
                });

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error || 'Failed to create invoice');
                }
                
                const result = await response.json();
                alert(`Invoice #${result.InvoiceNumber} created and sent successfully!`);
                
                sessionStorage.removeItem('invoiceData');
                sessionStorage.removeItem('invoiceClientData');
                sessionStorage.removeItem('invoiceItems');
                window.location.href = 'admin-invoices.html';
            } catch (error) {
                console.error('Error creating invoice:', error);
                alert(`Error: ${error.message}`);
                previewSendBtn.disabled = false;
                previewSendBtn.textContent = 'Send to Client';
                loadingOverlay.classList.remove('active');
            }
        });

        previewEditBtn.addEventListener('click', () => {
            window.location.href = 'admin-invoice-create-step2.html';
        });

        previewBackBtn.addEventListener('click', () => {
            window.location.href = 'admin-invoice-create-step3.html';
        });

        previewCancelBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to cancel? All progress will be lost.')) {
                sessionStorage.removeItem('invoiceData');
                sessionStorage.removeItem('invoiceClientData');
                sessionStorage.removeItem('invoiceItems');
                window.location.href = 'admin-invoices.html';
            }
        });
    }

    updateItemsTable();
});


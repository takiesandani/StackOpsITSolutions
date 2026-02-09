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

    // ==================== STEP 1: CLIENT SELECTION & CREATION ====================
    
    const companySelect = document.getElementById('company-select');
    const clientSelect = document.getElementById('client-select');
    const selectClientForm = document.getElementById('select-client-form');
    const createNewClientBtn = document.getElementById('create-new-client-btn');
    const createClientModal = document.getElementById('create-client-modal');
    const closeClientModal = document.getElementById('close-client-modal');
    const cancelClientBtn = document.getElementById('cancel-client-btn');
    const quickAddClientForm = document.getElementById('quick-add-client-form');

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

    // Create New Client Modal - Open
    if (createNewClientBtn) {
        createNewClientBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (!companySelect.value) {
                alert('Please select a company first');
                return;
            }
            document.getElementById('new-client-company').value = companySelect.value;
            createClientModal.classList.add('active');
        });
    }

    // Create New Client Modal - Close
    if (closeClientModal) {
        closeClientModal.addEventListener('click', () => {
            createClientModal.classList.remove('active');
            quickAddClientForm.reset();
        });
    }

    if (cancelClientBtn) {
        cancelClientBtn.addEventListener('click', () => {
            createClientModal.classList.remove('active');
            quickAddClientForm.reset();
        });
    }

    // Quick Add Client Form Submission
    if (quickAddClientForm) {
        quickAddClientForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const clientName = document.getElementById('new-client-name').value;
            const clientEmail = document.getElementById('new-client-email').value;
            const clientPhone = document.getElementById('new-client-phone').value;
            const companyId = companySelect.value;

            try {
                const response = await fetch('/api/admin/clients/quick-add', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        name: clientName.trim(),
                        email: clientEmail?.trim() || null,
                        companyId: companyId
                    })
                });


                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error || 'Failed to create client');
                }

                const result = await response.json();
                
                // Add the new client to the dropdown and select it
                const client = result.client;

                const option = document.createElement('option');
                option.value = client.id;
                option.textContent = `${client.firstname} ${client.lastname} (${client.email || 'N/A'})`;

                clientSelect.appendChild(option);
                clientSelect.value = client.id;
                clientSelect.disabled = false;


                alert(`Client "${clientName}" created successfully!`);
                createClientModal.classList.remove('active');
                quickAddClientForm.reset();
            } catch (error) {
                console.error('Error creating client:', error);
                alert(`Error: ${error.message}`);
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

    // ==================== STEP 3: INVOICE ITEMS ====================

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
            itemsTbody.innerHTML = '<tr><td colspan="6" class="text-center">No items added yet. Click "Add Item" to get started.</td></tr>';
        } else {
            invoiceItems.forEach((item, index) => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${item.serviceCategory}</td>
                    <td>${item.deliverables}</td>
                    <td>${item.frequency}</td>
                    <td>${item.rate}</td>
                    <td>R${parseFloat(item.total).toFixed(2)}</td>
                    <td>
                        <button class="btn btn-sm btn-danger" onclick="removeItem(${index})">Remove</button>
                    </td>
                `;
                itemsTbody.appendChild(row);
            });
        }

        // Update total
        const total = invoiceItems.reduce((sum, item) => sum + parseFloat(item.total), 0);
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
            const serviceCategory = document.getElementById('item-service-category').value;
            const deliverables = document.getElementById('item-deliverables').value;
            const frequency = document.getElementById('item-frequency').value;
            const rate = document.getElementById('item-rate').value;
            const total = parseFloat(document.getElementById('item-total').value);

            invoiceItems.push({ 
                serviceCategory, 
                deliverables, 
                frequency, 
                rate, 
                total 
            });
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

    // ==================== PREVIEW PAGE LOGIC ====================

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
        const totalAmount = items.reduce((sum, item) => sum + parseFloat(item.total), 0);

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
                            ServiceCategory: item.serviceCategory,
                            Deliverables: item.deliverables,
                            Frequency: item.frequency,
                            Rate: item.rate,
                            Total: item.total
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

        if (pdfPreview) {
            generatePreview();
        }

        if (previewSendBtn) {
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
                                ServiceCategory: item.serviceCategory,
                                Deliverables: item.deliverables,
                                Frequency: item.frequency,
                                Rate: item.rate,
                                Total: item.total
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
        }

        if (previewEditBtn) {
            previewEditBtn.addEventListener('click', () => {
                window.location.href = 'admin-invoice-create-step2.html';
            });
        }

        if (previewBackBtn) {
            previewBackBtn.addEventListener('click', () => {
                window.location.href = 'admin-invoice-create-step3.html';
            });
        }

        if (previewCancelBtn) {
            previewCancelBtn.addEventListener('click', () => {
                if (confirm('Are you sure you want to cancel? All progress will be lost.')) {
                    sessionStorage.removeItem('invoiceData');
                    sessionStorage.removeItem('invoiceClientData');
                    sessionStorage.removeItem('invoiceItems');
                    window.location.href = 'admin-invoices.html';
                }
            });
        }
    }

    updateItemsTable();
});


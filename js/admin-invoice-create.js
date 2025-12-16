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
    let invoiceItems = [];
    const addItemBtn = document.getElementById('add-item-btn');
    const addItemForm = document.getElementById('add-item-form');
    const addItemModal = document.getElementById('add-item-modal');
    const closeModal = document.getElementById('close-modal');
    const cancelItemBtn = document.getElementById('cancel-item-btn');
    const itemsTbody = document.getElementById('items-tbody');
    const totalAmountEl = document.getElementById('total-amount');
    const invoiceItemsForm = document.getElementById('invoice-items-form');

    const updateItemsTable = () => {
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
        totalAmountEl.textContent = `R${total.toFixed(2)}`;
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

    // Final form submission
    if (invoiceItemsForm) {
        invoiceItemsForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (invoiceItems.length === 0) {
                alert('Please add at least one item to the invoice');
                return;
            }

            const invoiceData = JSON.parse(sessionStorage.getItem('invoiceData') || '{}');
            const totalAmount = invoiceItems.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);

            try {
                // Create invoice
                const invoiceResponse = await fetch('/api/admin/invoices', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        CompanyID: invoiceData.companyId,
                        InvoiceDate: invoiceData.invoiceDate,
                        DueDate: invoiceData.dueDate,
                        TotalAmount: totalAmount,
                        Status: invoiceData.status
                    })
                });

                if (!invoiceResponse.ok) throw new Error('Failed to create invoice');
                const invoice = await invoiceResponse.json();

                // Add invoice items
                for (const item of invoiceItems) {
                    await fetch('/api/admin/invoice-items', {
                        method: 'POST',
                        headers,
                        body: JSON.stringify({
                            InvoiceID: invoice.InvoiceID,
                            Description: item.description,
                            Quantity: item.quantity,
                            UnitPrice: item.unitPrice
                        })
                    });
                }

                alert('Invoice created successfully!');
                sessionStorage.removeItem('invoiceData');
                sessionStorage.removeItem('invoiceClientData');
                window.location.href = 'admin-invoices.html';
            } catch (error) {
                console.error('Error creating invoice:', error);
                alert('Failed to create invoice. Please try again.');
            }
        });
    }

    updateItemsTable();
});


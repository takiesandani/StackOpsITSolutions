/* Admin Appointments Management */

let allAppointments = [];
let filteredAppointments = [];

document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    loadAppointments();
});

function setupEventListeners() {
    // Refresh button
    document.getElementById('refresh-btn').addEventListener('click', loadAppointments);
    
    // Clear all button
    document.getElementById('clear-all-btn').addEventListener('click', () => {
        if (confirm('Are you sure you want to clear ALL appointments? This cannot be undone!')) {
            clearAllAppointments();
        }
    });
    
    // Filter listeners
    document.getElementById('date-filter').addEventListener('change', applyFilters);
    document.getElementById('search-filter').addEventListener('keyup', applyFilters);

    // Modal close listeners
    const modal = document.getElementById('appointment-modal');
    document.querySelector('.close').addEventListener('click', () => {
        modal.style.display = 'none';
    });
    document.getElementById('close-modal-btn').addEventListener('click', () => {
        modal.style.display = 'none';
    });

    // Sidebar toggle
    const hamburger = document.getElementById('hamburger');
    const sidebar = document.getElementById('admin-sidebar');
    const sidebarToggle = document.getElementById('sidebar-toggle');
    
    if (hamburger) {
        hamburger.addEventListener('click', () => {
            sidebar.classList.toggle('active');
        });
    }
    
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', () => {
            sidebar.classList.remove('active');
        });
    }

    // Sign out
    const signOut = document.getElementById('admin-signout');
    if (signOut) {
        signOut.addEventListener('click', (e) => {
            e.preventDefault();
            localStorage.removeItem('authToken');
            window.location.href = 'signin.html';
        });
    }
}

async function loadAppointments() {
    try {
        const token = localStorage.getItem('authToken');
        
        // Load pending appointments
        const pendingResponse = await fetch('/api/admin/appointments', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (pendingResponse.status === 401) {
            window.location.href = 'signin.html';
            return;
        }

        if (!pendingResponse.ok) {
            throw new Error('Failed to load appointments');
        }

        allAppointments = await pendingResponse.json();
        applyFilters();
        renderAppointments();
        
        // Load completed appointments
        loadCompletedAppointments();
    } catch (error) {
        console.error('Error loading appointments:', error);
        document.getElementById('appointments-tbody').innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; color: red;">
                    Error loading appointments: ${error.message}
                </td>
            </tr>
        `;
    }
}

async function loadCompletedAppointments() {
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch('/api/admin/appointments/completed', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            throw new Error('Failed to load completed appointments');
        }

        const completed = await response.json();
        renderCompletedAppointments(completed);
    } catch (error) {
        console.error('Error loading completed appointments:', error);
    }
}

function applyFilters() {
    const dateFilter = document.getElementById('date-filter').value;
    const searchFilter = document.getElementById('search-filter').value.toLowerCase();

    filteredAppointments = allAppointments.filter(apt => {
        // Date filter
        if (dateFilter && apt.date !== dateFilter) return false;

        // Search filter
        if (searchFilter) {
            const searchableText = `
                ${apt.clientName || ''} 
                ${apt.email || ''} 
                ${apt.phone || ''} 
                ${apt.companyName || ''}
            `.toLowerCase();
            if (!searchableText.includes(searchFilter)) return false;
        }

        return true;
    });

    renderAppointments();
}

function renderAppointments() {
    const tbody = document.getElementById('appointments-tbody');

    if (filteredAppointments.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 20px;">
                    No appointments found
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = filteredAppointments.map(apt => `
        <tr>
            <td>${formatDate(apt.date)}</td>
            <td>${apt.time}</td>
            <td>${apt.clientName || '-'}</td>
            <td>${apt.companyName || '-'}</td>
            <td>${apt.email || '-'}</td>
            <td>${apt.phone || '-'}</td>
            <td>${apt.service || '-'}</td>
            <td>
                <button class="btn btn-small" onclick="viewAppointment(${apt.id})">
                    <i class="fas fa-eye"></i> View
                </button>
                <button class="btn btn-small btn-success" onclick="markComplete(${apt.id})">
                    <i class="fas fa-check"></i> Complete
                </button>
            </td>
        </tr>
    `).join('');
}

function viewAppointment(appointmentId) {
    const appointment = allAppointments.find(apt => apt.id === appointmentId);
    if (!appointment) return;

    // Fill modal
    document.getElementById('modal-date').textContent = formatDate(appointment.date);
    document.getElementById('modal-time').textContent = appointment.time;
    document.getElementById('modal-clientName').textContent = appointment.clientName || 'N/A';
    document.getElementById('modal-company').textContent = appointment.companyName || 'N/A';
    document.getElementById('modal-title').textContent = appointment.title || 'N/A';
    document.getElementById('modal-email').textContent = appointment.email || 'N/A';
    document.getElementById('modal-phone').textContent = appointment.phone || 'N/A';
    document.getElementById('modal-service').textContent = appointment.service || 'N/A';
    document.getElementById('modal-message').textContent = appointment.message || 'No additional notes';

    // Setup complete button - all appointments in this tab are booked
    const completeBtn = document.getElementById('complete-btn');
    if (completeBtn) {
        completeBtn.style.display = 'inline-block';
        completeBtn.onclick = () => markComplete(appointmentId);
    }

    // Setup delete button
    const deleteBtn = document.getElementById('delete-btn');
    deleteBtn.onclick = () => deleteAppointment(appointmentId);

    // Show modal
    document.getElementById('appointment-modal').style.display = 'block';
}

async function markComplete(appointmentId) {
    if (!confirm('Mark this appointment as complete? It will be deleted from the system.')) {
        return;
    }

    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`/api/admin/appointments/${appointmentId}/complete`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            alert('Appointment marked as complete');
            document.getElementById('appointment-modal').style.display = 'none';
            loadAppointments();
        } else {
            alert('Failed to mark appointment as complete');
        }
    } catch (error) {
        console.error('Error marking appointment complete:', error);
        alert('Error marking appointment complete');
    }
}

async function deleteAppointment(appointmentId) {
    if (!confirm('Are you sure you want to delete this appointment?')) {
        return;
    }

    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`/api/admin/appointments/${appointmentId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            alert('Appointment deleted successfully');
            document.getElementById('appointment-modal').style.display = 'none';
            loadAppointments();
        } else {
            alert('Failed to delete appointment');
        }
    } catch (error) {
        console.error('Error deleting appointment:', error);
        alert('Error deleting appointment');
    }
}

function renderCompletedAppointments(completed) {
    const tbody = document.getElementById('completed-tbody');

    if (!tbody) return;

    if (completed.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 20px; color: #999;">
                    No completed appointments yet
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = completed.map(apt => `
        <tr>
            <td>${formatDate(apt.date)}</td>
            <td>${apt.time}</td>
            <td>${apt.clientName || '-'}</td>
            <td>${apt.companyName || '-'}</td>
            <td>${apt.email || '-'}</td>
            <td>${apt.phone || '-'}</td>
            <td>${apt.service || '-'}</td>
            <td>
                <button class="btn btn-small" onclick="viewAppointment(${apt.id})">
                    <i class="fas fa-eye"></i> View
                </button>
            </td>
        </tr>
    `).join('');
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-ZA', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

async function clearAllAppointments() {
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch('/api/admin/appointments/clear-all', {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            alert('All appointments cleared successfully');
            loadAppointments();
        } else {
            alert('Failed to clear appointments');
        }
    } catch (error) {
        console.error('Error clearing appointments:', error);
        alert('Error clearing appointments');
    }
}

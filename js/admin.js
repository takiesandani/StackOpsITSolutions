document.addEventListener("DOMContentLoaded", () => {
    let currentDate = new Date();
    let selectedDate = null;
    const calendarGrid = document.getElementById("calendar-grid");
    const monthYearSpan = document.getElementById("current-month-year");
    const prevMonthBtn = document.getElementById("prev-month-btn");
    const nextMonthBtn = document.getElementById("next-month-btn");
    const timeSlotsContainer = document.getElementById("time-slots-container");
    const timeSlotsEl = document.getElementById("admin-time-slots");
    const selectedDateDisplay = document.getElementById("selected-date-display");
    const bookingsListEl = document.getElementById("bookings-list"); 
    const BASE_URL = ""; // Use relative paths for API calls

    const getAuthHeaders = (includeContentType = true) => {
        // FIXED: Changed from 'accessToken' to 'authToken' for consistency with signin.html and consultation.html
        const token = localStorage.getItem('authToken');
        const headers = {};
        
        if (includeContentType) {
             headers["Content-Type"] = "application/json";
        }
        
        if (token) {
            headers["Authorization"] = `Bearer ${token}`;
        }
        return headers;
    };

    const renderCalendar = () => {
        const oldDays = calendarGrid.querySelectorAll('.calendar-day');
        oldDays.forEach(day => day.remove());

        const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        const lastDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

        monthYearSpan.textContent = firstDayOfMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

        for (let i = 0; i < firstDayOfMonth.getDay(); i++) {
            const emptyDay = document.createElement("div");
            emptyDay.classList.add("calendar-day", "empty");
            calendarGrid.appendChild(emptyDay);
        }

        for (let i = 1; i <= lastDayOfMonth.getDate(); i++) {
            const dayDiv = document.createElement("div");
            dayDiv.classList.add("calendar-day");
            dayDiv.textContent = i;
            dayDiv.onclick = () => selectDayToManage(new Date(currentDate.getFullYear(), currentDate.getMonth(), i));
            
            const fullDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), i);
            if (selectedDate && fullDate.toDateString() === selectedDate.toDateString()) {
                dayDiv.classList.add('selected');
            }

            calendarGrid.appendChild(dayDiv);
        }

        timeSlotsContainer.style.display = 'none';
    };

    const selectDayToManage = async (date) => {
        calendarGrid.querySelectorAll('.calendar-day.selected').forEach(day => day.classList.remove('selected'));

        selectedDate = date;
        
        const formattedDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        
        selectedDateDisplay.textContent = formattedDate;
        timeSlotsEl.innerHTML = "";

        const response = await fetch(`${BASE_URL}/api/schedule?date=${formattedDate}`);
        
        if (!response.ok) {
            console.error("Failed to fetch schedule:", response.statusText);
            timeSlotsEl.innerHTML = "<p>Error loading schedule data. Check server console.</p>";
            timeSlotsContainer.style.display = 'block';
            return;
        }
        
        try {
            const availableTimes = await response.json();

            const allTimes = ["09:00:00", "10:00:00", "11:00:00", "12:00:00", "13:00:00", "14:00:00", "15:00:00", "16:00:00", "17:00:00"];
            
            allTimes.forEach(time => {
                const timeDisplay = time.substring(0, 5);
                const isAvailable = availableTimes.includes(time);
                const button = document.createElement("button");
                
                button.textContent = isAvailable ? `${timeDisplay} (Open)` : `${timeDisplay} (Blocked)`;
                button.className = isAvailable ? "available" : "unavailable";
                
                button.onclick = () => toggleAvailability(formattedDate, time, !isAvailable); 
                
                timeSlotsEl.appendChild(button);
            });
            
        } catch (jsonError) {
            console.error("Error parsing schedule JSON:", jsonError);
            timeSlotsEl.innerHTML = "<p>Error processing schedule data. Server returned invalid format.</p>";
        }

        timeSlotsContainer.style.display = 'block';
    };

    const toggleAvailability = async (date, time, newIsAvailable) => {
        try {
            // FIXED: Changed from 'accessToken' to 'authToken'
            const token = localStorage.getItem('authToken'); 
            if (!token) {
                alert("Authentication required. Please ensure you are logged in to manage availability.");
                return;
            }

            const response = await fetch(`${BASE_URL}/api/admin/availability`, {
                method: "POST",
                headers: getAuthHeaders(),
                body: JSON.stringify({ date, time, isAvailable: newIsAvailable }) 
            });

            if (response.ok) {
                selectDayToManage(selectedDate); 
                fetchBookings(); 
            } else if (response.status === 401 || response.status === 403) {
                 alert("Session expired or unauthorized access. Please log in again.");
                 // FIXED: Changed from 'accessToken' to 'authToken'
                 localStorage.removeItem('authToken'); 
            } else {
                const errorText = await response.text();
                alert(`Failed to update availability: ${errorText}`);
            }
        } catch (error) {
            console.error("Error updating availability:", error);
            alert("Failed to update availability. Check console for details.");
        }
    };
    
    const fetchBookings = async () => {
        try {
            // FIXED: Changed from 'accessToken' to 'authToken'
            const token = localStorage.getItem('authToken'); 
            
            if (!token) {
                bookingsListEl.innerHTML = '<li>Please sign in to view bookings.</li>';
                return;
            }

            const response = await fetch(`${BASE_URL}/api/admin/bookings`, {
                method: "GET",
                headers: getAuthHeaders(false)
            });

            if (response.status === 401 || response.status === 403) {
                 bookingsListEl.innerHTML = '<li>Access Denied. Please ensure you are logged in as an administrator.</li>';
                 // FIXED: Changed from 'accessToken' to 'authToken'
                 localStorage.removeItem('authToken');
                 return;
            }
            
            if (!response.ok) {
                 const errorText = await response.text();
                 throw new Error(`Server returned status ${response.status}: ${errorText}`);
            }

            const bookings = await response.json();

            bookingsListEl.innerHTML = '';
            if (bookings.length === 0) {
                const li = document.createElement('li');
                li.textContent = "No new bookings.";
                bookingsListEl.appendChild(li);
                return;
            }
            
            bookings.forEach(booking => {
                const li = document.createElement('li');
                li.innerHTML = `<strong>${booking.clientname}</strong><br>Email: ${booking.email}<br>Date: ${booking.date}<br>Time: ${booking.time}<br>Service: ${booking.service || 'N/A'}<br>Notes: ${booking.message || 'N/A'}`;
                bookingsListEl.appendChild(li);
            });
        } catch (error) {
            console.error("Failed to fetch bookings:", error);
            bookingsListEl.innerHTML = '<li>Error loading bookings.</li>'; 
        }
    };
    
    prevMonthBtn.onclick = () => {
        currentDate.setMonth(currentDate.getMonth() - 1);
        renderCalendar();
    };

    nextMonthBtn.onclick = () => {
        currentDate.setMonth(currentDate.getMonth() + 1);
        renderCalendar();
    };

    renderCalendar();
    fetchBookings();
});

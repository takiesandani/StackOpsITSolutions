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
        selectedDate = date;
        renderCalendar(); // Re-render to highlight the selected day

        const formattedDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        
        selectedDateDisplay.textContent = formattedDate;
        timeSlotsEl.innerHTML = "";

        const response = await fetch(`api/schedule?date=${formattedDate}`);
        const availableTimes = await response.json();

        const allTimes = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"];
        allTimes.forEach(time => {
            const isAvailable = availableTimes.includes(time);
            const button = document.createElement("button");
            button.textContent = time;
            button.className = isAvailable ? "available" : "unavailable";
            button.onclick = () => toggleAvailability(formattedDate, time, !isAvailable);
            timeSlotsEl.appendChild(button);
        });

        timeSlotsContainer.style.display = 'block';
    };

    const toggleAvailability = async (date, time, isAvailable) => {
        try {
            const response = await fetch("/api/admin/availability", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ date, time, isAvailable })
            });

            if (response.ok) {
                selectDayToManage(selectedDate);
                fetchBookings();
            } else {
                alert("Failed to update availability.");
            }
        } catch (error) {
            console.error("Error updating availability:", error);
            alert("Failed to update availability.");
        }
    };
    
    const fetchBookings = async () => {
        try {
            const response = await fetch("/api/admin/bookings");
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
                li.innerHTML = `<strong>${booking.name}</strong><br>Email: ${booking.email}<br>Date: ${booking.date}<br>Time: ${booking.time}<br>Service: ${booking.service || 'N/A'}<br>Notes: ${booking.message || 'N/A'}`;
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

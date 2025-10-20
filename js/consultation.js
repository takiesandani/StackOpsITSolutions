function showMinimalMenu() {
    let minimalMenu = document.getElementById('minimal-menu');
    if (!minimalMenu) {
        minimalMenu = document.createElement('div');
        minimalMenu.id = 'minimal-menu';
        minimalMenu.innerHTML = `
            <ul>
                <li><a href="Home.html">Home</a></li>
                <li><a href="about.html">About</a></li>
                <li><a href="service.html">Services</a></li>
                <li><a href="approach.html">Our Approach</a></li>
                <li><a href="contact.html">Contact Us</a></li>
                <li><a href="consultation.html">Book a consultation</a></li>
                <li><a href="#" id="client-portal-link-mini" class="button-like">Client portal</a></li>
            </ul>
            <button id="close-minimal-menu" type="button">Close</button>
        `;
        document.body.appendChild(minimalMenu);
        minimalMenu.style.position = 'fixed';
        minimalMenu.style.top = '70px';
        minimalMenu.style.right = '10px';
        minimalMenu.style.width = '340px';
        minimalMenu.style.maxHeight = '260px';
        minimalMenu.style.background = 'rgba(0,0,0,0.97)';
        minimalMenu.style.color = '#fff';
        minimalMenu.style.zIndex = '9999';
        minimalMenu.style.padding = '8px 0';
        minimalMenu.style.borderRadius = '8px';
        minimalMenu.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
        minimalMenu.style.overflowY = 'auto';
        minimalMenu.querySelectorAll('a').forEach(a => {
            a.style.color = '#fff';
            a.style.textDecoration = 'none';
            a.style.display = 'block';
            a.style.padding = '6px 12px';
            a.style.fontSize = '15px';
            a.style.borderRadius = '4px';
            a.onmouseover = function() { a.style.background = 'rgba(0,110,255,0.15)'; };
            a.onmouseout = function() { a.style.background = 'none'; };
        });
        const closeBtn = minimalMenu.querySelector('#close-minimal-menu');
        closeBtn.style.margin = '8px 12px 0 12px';
        closeBtn.style.background = '#222';
        closeBtn.style.color = '#fff';
        closeBtn.style.border = 'none';
        closeBtn.style.padding = '4px 8px';
        closeBtn.style.borderRadius = '6px';
        closeBtn.style.cursor = 'pointer';
        closeBtn.style.width = 'calc(100% - 24px)';
        closeBtn.style.fontSize = '14px';
        closeBtn.onmouseover = function() { closeBtn.style.background = '#444'; };
        closeBtn.onmouseout = function() { closeBtn.style.background = '#222'; };
        closeBtn.onclick = function() { minimalMenu.remove(); };
        const portalLink = minimalMenu.querySelector('#client-portal-link-mini');
        if (portalLink) {
            portalLink.onclick = function(e) {
                e.preventDefault();
                const authToken = localStorage.getItem('authToken');
                if (authToken) {
                    window.location.href = '/ClientPortal.html';
                } else {
                    window.location.href = '/signin.html';
                    alert('Please sign in to access the client portal.');
                }
            };
        }
    }
}

class Calendar {
    constructor(containerId, timeSlotsId) {
        this.container = document.getElementById(containerId);
        this.timeSlotsContainer = document.getElementById(timeSlotsId);
        this.date = new Date();
        this.selectedDate = null;
        this.generateCalendar();
    }

    generateCalendar() {
        this.container.innerHTML = "";
        
        const header = document.createElement("div");
        header.classList.add("calendar-header");

        const prevBtn = document.createElement("button");
        prevBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
        prevBtn.onclick = () => this.changeMonth(-1);

        const nextBtn = document.createElement("button");
        nextBtn.innerHTML = '<i class="fas fa-chevron-right"></i>';
        nextBtn.onclick = () => this.changeMonth(1);

        const monthYear = document.createElement("h2");
        monthYear.textContent = this.date.toLocaleDateString("en-US", {
            month: "long",
            year: "numeric"
        });
        
        const monthNav = document.createElement("div");
        monthNav.classList.add("month-nav");
        monthNav.appendChild(prevBtn);
        monthNav.appendChild(nextBtn);

        header.appendChild(monthYear);
        header.appendChild(monthNav);
        this.container.appendChild(header);

        const weekdays = document.createElement("div");
        weekdays.classList.add("weekdays");
        const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        weekdayNames.forEach(name => {
            const div = document.createElement("div");
            div.textContent = name;
            weekdays.appendChild(div);
        });
        this.container.appendChild(weekdays);
        
        const daysContainer = document.createElement("div");
        daysContainer.classList.add("days");

        const firstDay = new Date(this.date.getFullYear(), this.date.getMonth(), 1).getDay();
        const daysInMonth = new Date(this.date.getFullYear(), this.date.getMonth() + 1, 0).getDate();

        for (let i = 0; i < firstDay; i++) {
            const empty = document.createElement("div");
            daysContainer.appendChild(empty);
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const dayElem = document.createElement("div");
            dayElem.textContent = day;
            dayElem.classList.add("day");
            const fullDate = new Date(this.date.getFullYear(), this.date.getMonth(), day);
            
            if (fullDate < new Date().setHours(0,0,0,0)) {
                dayElem.classList.add('unavailable');
            } else {
                dayElem.onclick = () => this.selectDate(fullDate, dayElem);
            }

            if (
                this.selectedDate &&
                day === this.selectedDate.getDate() &&
                this.date.getMonth() === this.selectedDate.getMonth() &&
                this.date.getFullYear() === this.selectedDate.getFullYear()
            ) {
                dayElem.classList.add("selected");
            }

            const today = new Date();
            if (
                day === today.getDate() &&
                this.date.getMonth() === today.getMonth() &&
                this.date.getFullYear() === today.getFullYear()
            ) {
                dayElem.classList.add("today");
            }
            
            daysContainer.appendChild(dayElem);
        }
        this.container.appendChild(daysContainer);
    }

    changeMonth(offset) {
        this.date.setMonth(this.date.getMonth() + offset);
        this.selectedDate = null;
        this.generateCalendar();
        this.timeSlotsContainer.innerHTML = '';
        this.timeSlotsContainer.textContent = "Select a date to view available times.";
    }

    selectDate(date, dayElem) {
        document.querySelectorAll(".day").forEach(d => d.classList.remove("selected"));
        dayElem.classList.add("selected");
        this.selectedDate = date;
        this.updateTimeSlots();
    }
    
    async updateTimeSlots() {
        this.timeSlotsContainer.innerHTML = "";
        if (!this.selectedDate) {
            this.timeSlotsContainer.textContent = "Select a date first.";
            return;
        }

        const formattedDate = `${this.selectedDate.getFullYear()}-${String(this.selectedDate.getMonth() + 1).padStart(2, "0")}-${String(this.selectedDate.getDate()).padStart(2, "0")}`;
        
        try {
            const response = await fetch(`http://localhost:8080/api/schedule?date=${formattedDate}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const availableTimes = await response.json();

            if (availableTimes.length === 0 || this.selectedDate.getDay() === 0 || this.selectedDate.getDay() === 6) {
                this.timeSlotsContainer.textContent = "No available times for this day.";
                return;
            }

            availableTimes.forEach(time => {
                const slot = document.createElement("div");
                slot.classList.add("time-slot");
                slot.textContent = time;
                slot.onclick = () => this.selectTimeSlot(slot, formattedDate, time);
                this.timeSlotsContainer.appendChild(slot);
            });
        } catch (error) {
            this.timeSlotsContainer.textContent = "Failed to load time slots.";
            console.error("Error fetching time slots:", error);
        }
    }

    selectTimeSlot(slotElement, date, time) {
        document.querySelectorAll(".time-slot").forEach(slot => {
            slot.classList.remove("selected");
        });
        slotElement.classList.add("selected");
        
        document.getElementById("selectedDate").value = date;
        document.getElementById("selectedTime").value = time;
    }
}

class BookingForm {
    constructor(formId) {
        this.form = document.getElementById(formId);
        this.init();
    }

    init() {
        this.form.addEventListener("submit", (event) => {
            event.preventDefault();
            this.submitForm();
        });
    }

    async submitForm() {
        const formData = new FormData(this.form);
        const data = Object.fromEntries(formData.entries());

        if (!data.date || !data.time) {
            alert("Please select a date and time slot.");
            return;
        }

        try {
            const response = await fetch("http://localhost:8080/api/book", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data)
            });

            if (response.ok) {
                alert("Booking confirmed! Check your email for details.");
                this.form.reset();
                window.location.reload();
            } else {
                const errorText = await response.text();
                alert(`Booking failed: ${errorText}`);
            }
        } catch (error) {
            console.error("Error submitting booking:", error);
            alert("Error sending booking request. Please try again later.");
        }
    }
}

document.addEventListener("DOMContentLoaded", () => {
    const calendar = new Calendar("calendar-container", "timeSlots");
    const bookingForm = new BookingForm("bookingForm");
    const hamburger = document.getElementById('hamburger');
    if (hamburger) {
        hamburger.addEventListener('click', function(e) {
            e.stopPropagation();
            showMinimalMenu();
        });
        const hamburgerIcon = hamburger.querySelector('i');
        if (hamburgerIcon) {
            hamburgerIcon.addEventListener('click', function(e) {
                e.stopPropagation();
                showMinimalMenu();
            });
        }
    }
});
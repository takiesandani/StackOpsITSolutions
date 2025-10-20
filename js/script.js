// Sticky Header
window.addEventListener('scroll', function() {
    const header = document.querySelector('header');
    header.classList.toggle('sticky', window.scrollY > 0);
});

// Mobile Menu Toggle
const hamburger = document.getElementById('hamburger');
const navLinks = document.getElementById('nav-links');

function showMinimalMenu() {
    let minimalMenu = document.getElementById('minimal-menu');
    if (!minimalMenu) {
        minimalMenu = document.createElement('div');
        minimalMenu.id = 'minimal-menu';
        minimalMenu.style.position = 'fixed';
        minimalMenu.style.top = '70px';
        minimalMenu.style.right = '10px';
        minimalMenu.style.width = '140px';
        minimalMenu.style.height = 'auto';
        minimalMenu.style.maxHeight = '220px';
        minimalMenu.style.overflowY = 'auto';
        minimalMenu.style.background = 'rgba(0,0,0,0.97)';
        minimalMenu.style.color = '#fff';
        minimalMenu.style.zIndex = '9999';
        minimalMenu.style.padding = '8px 0 8px 0';
        minimalMenu.style.borderRadius = '8px';
        minimalMenu.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
        minimalMenu.innerHTML = '<ul style="list-style:none;padding:0;margin:0;text-align:left;">' +
            '<li><a href="Home.html" style="color:#fff;text-decoration:none;display:block;padding:6px 12px;font-size:15px;">Home</a></li>' +
            '<li><a href="about.html" style="color:#fff;text-decoration:none;display:block;padding:6px 12px;font-size:15px;">About</a></li>' +
            '<li><a href="service.html" style="color:#fff;text-decoration:none;display:block;padding:6px 12px;font-size:15px;">Services</a></li>' +
            '<li><a href="contact.html" style="color:#fff;text-decoration:none;display:block;padding:6px 12px;font-size:15px;">Contact</a></li>' +
            '</ul>' +
            '<button id="close-minimal-menu" style="margin:8px 12px 0 12px;background:#222;color:#fff;border:none;padding:4px 8px;border-radius:6px;cursor:pointer;width:calc(100% - 24px);font-size:14px;">Close</button>';
        document.body.appendChild(minimalMenu);
        document.getElementById('close-minimal-menu').onclick = function() {
            minimalMenu.remove();
        };
    }
}

if (hamburger) {
    hamburger.addEventListener('click', () => {
        if (navLinks) {
            navLinks.classList.toggle('active');
            hamburger.innerHTML = navLinks.classList.contains('active') ? 
                '<i class="fas fa-times"></i>' : '<i class="fas fa-bars"></i>';
        } else {
            showMinimalMenu();
        }
    });
}

// Close mobile menu when clicking on a link
document.querySelectorAll('.nav-links a').forEach(link => {
    link.addEventListener('click', () => {
        if (navLinks.classList.contains('active')) {
            navLinks.classList.remove('active');
            hamburger.innerHTML = '<i class="fas fa-bars"></i>';
        }
    });
});

document.addEventListener('DOMContentLoaded', () => {
    const contactForm = document.getElementById('contactForm');
    if (!contactForm) return;

    const statusMessage = document.createElement('div');
    statusMessage.style.textAlign = 'center';
    contactForm.parentNode.insertBefore(statusMessage, contactForm.nextSibling);

    contactForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Use FormData to collect all fields
        const formData = new FormData(contactForm);
        const data = {};
        for (const [key, value] of formData.entries()) {
            data[key] = value.trim();
        }

        // Check for missing fields before sending
        const requiredFields = ['firstName', 'lastName', 'company', 'email', 'contact', 'service', 'message'];
        for (const field of requiredFields) {
            if (!data[field]) {
                statusMessage.innerHTML = `Error: All fields are required.`;
                statusMessage.style.color = 'red';
                return;
            }
        }

        try {
            statusMessage.innerHTML = 'Sending... ⏳';
            const response = await fetch('/api/contact-message', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });

            let result = {};
            try {
                result = await response.json();
            } catch (err) {
                result = {};
            }

            if (response.ok && result.success) {
                statusMessage.innerHTML = 'Message sent successfully! Thank you.';
                statusMessage.style.color = 'green';
                contactForm.reset();
            } else {
                statusMessage.innerHTML = `Error: ${result.message || 'Failed to send message.'}`;
                statusMessage.style.color = 'red';
            }
        } catch (error) {
            console.error('Submission error:', error);
            statusMessage.innerHTML = 'An unexpected error occurred. Please try again.';
            statusMessage.style.color = 'red';
        }
    });
});

// Scroll Animations
function checkScroll() {
    const elements = document.querySelectorAll('.service-card, .stat-item, .about-image, .about-content, .contact-form, .value-item, .team-member');
    
    elements.forEach(element => {
        const elementPosition = element.getBoundingClientRect().top;
        const screenPosition = window.innerHeight / 1.3;
        
        if (elementPosition < screenPosition) {
            element.classList.add('show');
        }
    });
}

window.addEventListener('scroll', checkScroll);
window.addEventListener('load', checkScroll);


// Animate Stats Counter
function animateCounter() {
    const counters = document.querySelectorAll('.stat-item h3');
    const speed = 200;
    
    counters.forEach(counter => {
        const target = +counter.getAttribute('data-target');
        const count = +counter.innerText;
        const increment = Math.ceil(target / speed);
        
        if (count < target) {
            counter.innerText = Math.min(count + increment, target);
            setTimeout(animateCounter, 1);
        }
    });
}

// Start counter animation when stats are in view
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            animateCounter();
            observer.unobserve(entry.target);
        }
    });
}, { threshold: 0.5 });

const statsSection = document.querySelector('.stats');
if (statsSection) {
    observer.observe(statsSection);
}

// FAQ Accordion
const faqItems = document.querySelectorAll('.faq-item');
if (faqItems.length > 0) {
    faqItems.forEach(item => {
        const question = item.querySelector('.faq-question');
        question.addEventListener('click', () => {
            item.classList.toggle('active');
        });
    });
}

// Set active navigation link based on current page
function setActiveNavLink() {
    const currentPage = window.location.pathname.split('/').pop();
    const navLinks = document.querySelectorAll('.nav-links a');
    
    navLinks.forEach(link => {
        const linkPage = link.getAttribute('href');
        if (linkPage === currentPage || (currentPage === '' && linkPage === 'index.html')) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    setActiveNavLink();
    checkScroll();
});

// Update copyright year automatically
document.addEventListener('DOMContentLoaded', function() {
    const yearSpan = document.querySelector('#copyright-year');
    if (yearSpan) {
        yearSpan.textContent = new Date().getFullYear();
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const calendarDays = document.getElementById('calendarDays');
    const currentMonthEl = document.getElementById('currentMonth');
    const prevMonthBtn = document.getElementById('prevMonth');
    const nextMonthBtn = document.getElementById('nextMonth');

    let currentDate = new Date();
    let selectedDate = null;

    const renderCalendar = () => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const firstDayOfMonth = new Date(year, month, 1).getDay();
        const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
        const daysInMonth = lastDayOfMonth;

        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        currentMonthEl.textContent = `${monthNames.slice(month, month + 1)} ${year}`;
        calendarDays.innerHTML = '';

        for (let i = 0; i < firstDayOfMonth; i++) {
            const emptyDay = document.createElement('div');
            emptyDay.classList.add('inactive');
            calendarDays.appendChild(emptyDay);
        }

        for (let i = 1; i <= daysInMonth; i++) {
            const day = document.createElement('div');
            day.textContent = i;
            day.addEventListener('click', () => {
                const clickedDate = new Date(year, month, i);
                if (clickedDate < new Date().setHours(0, 0, 0, 0)) { // Prevent selecting past dates
                    return;
                }
                document.querySelectorAll('.calendar-days div').forEach(d => d.classList.remove('selected'));
                day.classList.add('selected');
                selectedDate = clickedDate;
                console.log('Selected Date:', selectedDate);
                // You might want to display a message or enable the form further here
            });

            if (i === new Date().getDate() && month === new Date().getMonth() && year === new Date().getFullYear()) {
                day.classList.add('today');
            }

            calendarDays.appendChild(day);
        }
    };

    prevMonthBtn.addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() - 1);
        renderCalendar();
    });

    nextMonthBtn.addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() + 1);
        renderCalendar();
    });

    renderCalendar();
});

// Calendar functionality
class Calendar {
    constructor() {
        this.date = new Date();
        this.currentMonth = this.date.getMonth();
        this.currentYear = this.date.getFullYear();
        this.selectedDate = null;
        this.availableDates = new Set(); // Mock data for available dates
        
        // Initialize calendar
        this.init();
    }

    init() {
        // Set up event listeners
        document.getElementById('prevMonth').addEventListener('click', () => this.previousMonth());
        document.getElementById('nextMonth').addEventListener('click', () => this.nextMonth());
        
        // Generate mock available dates
        this.generateMockDates();
        
        // Render initial calendar
        this.renderCalendar();
    }

    generateMockDates() {
        const today = new Date();
        for (let i = 0; i < 30; i++) {
            const date = new Date(today);
            date.setDate(today.getDate() + i);
            if (date.getDay() !== 0 && date.getDay() !== 6) { // Exclude weekends
                this.availableDates.add(date.toDateString());
            }
        }
    }

    renderCalendar() {
        const firstDay = new Date(this.currentYear, this.currentMonth, 1);
        const lastDay = new Date(this.currentYear, this.currentMonth + 1, 0);
        const startingDay = firstDay.getDay();
        const monthLength = lastDay.getDate();
        
        // Update month and year display
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                          'July', 'August', 'September', 'October', 'November', 'December'];
        document.getElementById('currentMonth').textContent = 
            `${monthNames[this.currentMonth]} ${this.currentYear}`;
        
        // Clear previous calendar
        const calendarDays = document.getElementById('calendarDays');
        calendarDays.innerHTML = '';
        
        // Add empty cells for days before the first day of the month
        for (let i = 0; i < startingDay; i++) {
            const emptyDay = document.createElement('div');
            emptyDay.className = 'calendar-day disabled';
            calendarDays.appendChild(emptyDay);
        }
        
        // Add days of the month
        for (let day = 1; day <= monthLength; day++) {
            const dayElement = document.createElement('div');
            dayElement.className = 'calendar-day';
            dayElement.textContent = day;
            
            const currentDate = new Date(this.currentYear, this.currentMonth, day);
            const dateString = currentDate.toDateString();
            
            // Check if date is available
            if (!this.availableDates.has(dateString)) {
                dayElement.classList.add('disabled');
            } else {
                dayElement.addEventListener('click', () => this.selectDate(currentDate));
            }
            
            // Highlight selected date
            if (this.selectedDate && 
                this.selectedDate.getDate() === day && 
                this.selectedDate.getMonth() === this.currentMonth && 
                this.selectedDate.getFullYear() === this.currentYear) {
                dayElement.classList.add('selected');
            }
            
            calendarDays.appendChild(dayElement);
        }
    }

    selectDate(date) {
        this.selectedDate = date;
        this.renderCalendar();
        this.updateTimeSlots();
    }

    previousMonth() {
        this.currentMonth--;
        if (this.currentMonth < 0) {
            this.currentMonth = 11;
            this.currentYear--;
        }
        this.renderCalendar();
    }

    nextMonth() {
        this.currentMonth++;
        if (this.currentMonth > 11) {
            this.currentMonth = 0;
            this.currentYear++;
        }
        this.renderCalendar();
    }

    updateTimeSlots() {
        const timeSlots = document.getElementById('timeSlots');
        timeSlots.innerHTML = '';
        
        if (!this.selectedDate) return;
        
        // Generate time slots (9 AM to 5 PM)
        const slots = [];
        for (let hour = 9; hour < 17; hour++) {
            slots.push(`${hour}:00`);
            slots.push(`${hour}:30`);
        }
        
        // Mock data for booked slots
        const bookedSlots = new Set(['10:00', '11:30', '14:00']);
        
        slots.forEach(slot => {
            const slotElement = document.createElement('div');
            slotElement.className = 'time-slot';
            slotElement.textContent = slot;
            
            if (bookedSlots.has(slot)) {
                slotElement.classList.add('disabled');
            } else {
                slotElement.addEventListener('click', () => this.selectTimeSlot(slotElement));
            }
            
            timeSlots.appendChild(slotElement);
        });
    }

    selectTimeSlot(slotElement) {
        // Remove selection from other slots
        document.querySelectorAll('.time-slot').forEach(slot => {
            slot.classList.remove('selected');
        });
        
        // Add selection to clicked slot
        slotElement.classList.add('selected');
    }
}

// Booking form functionality
class BookingForm {
    constructor() {
        this.form = document.getElementById('bookingForm');
        this.setupForm();
    }

    setupForm() {
        this.form.addEventListener('submit', (e) => {
            e.preventDefault();
            if (this.validateForm()) {
                this.submitBooking();
            }
        });
    }

    validateForm() {
        let isValid = true;
        const inputs = this.form.querySelectorAll('input, select, textarea');
        
        inputs.forEach(input => {
            if (input.hasAttribute('required') && !input.value.trim()) {
                this.showError(input, 'This field is required');
                isValid = false;
            } else if (input.type === 'email' && input.value) {
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(input.value)) {
                    this.showError(input, 'Please enter a valid email address');
                    isValid = false;
                }
            } else {
                this.clearError(input);
            }
        });
        
        return isValid;
    }

    showError(input, message) {
        input.classList.add('error');
        let errorElement = input.parentElement.querySelector('.error-message');
        if (!errorElement) {
            errorElement = document.createElement('div');
            errorElement.className = 'error-message';
            input.parentElement.appendChild(errorElement);
        }
        errorElement.textContent = message;
    }

    clearError(input) {
        input.classList.remove('error');
        const errorElement = input.parentElement.querySelector('.error-message');
        if (errorElement) {
            errorElement.remove();
        }
    }

    submitBooking() {
        // Mock API call
        const formData = new FormData(this.form);
        const bookingData = Object.fromEntries(formData.entries());
        
        // Simulate API delay
        setTimeout(() => {
            this.showSuccessMessage();
            this.form.reset();
        }, 1000);
    }

    showSuccessMessage() {
        const successMessage = document.createElement('div');
        successMessage.className = 'success-message';
        successMessage.textContent = 'Your consultation has been booked successfully! We will contact you shortly.';
        
        this.form.parentElement.appendChild(successMessage);
        successMessage.classList.add('show');
        
        setTimeout(() => {
            successMessage.remove();
        }, 5000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const clientPortalLink = document.getElementById('client-portal-link');

    clientPortalLink.addEventListener('click', (e) => {
        e.preventDefault(); // Prevent the default link behavior
        const authToken = localStorage.getItem('authToken');

        if (authToken) {
            // User is logged in, allow them to access the portal
            window.location.href = '/ClientPortal.html';
        } else {
            // User is not logged in, redirect them to the sign-in page
            window.location.href = '/signin.html'; 
            alert('Please sign in to access the client portal.');
        }
    });
});

/*======================================================================================================*/
/* Roadmap Animation JavaScript                                                                         */
/*======================================================================================================*/
document.addEventListener('DOMContentLoaded', () => {
    // Select all elements we want to animate
    const nodes = document.querySelectorAll('.roadmap-node');
    const connectors = document.querySelectorAll('.roadmap-connector');

    // Mobile fallback: Show all elements immediately on small screens
    if (window.innerWidth <= 768) {
        nodes.forEach(node => {
            node.classList.add('is-visible');
        });
        connectors.forEach(connector => {
            connector.classList.add('is-visible');
        });
        return; // Exit early, no need for observers on mobile
    }

    // Create an Intersection Observer for the nodes
    const nodeObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                // If the element is visible in the viewport
                entry.target.classList.add('is-visible');
                // We can stop observing it after it's animated
                nodeObserver.unobserve(entry.target);
            }
        });
    }, {
        // Options: start the animation when 10% of the element is visible (reduced for better mobile support)
        threshold: 0.1
    });

    // Create an Intersection Observer for the connectors (optional, but nice)
    const connectorObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
                connectorObserver.unobserve(entry.target);
            }
        });
    }, {
        // Options: start the animation when 10% of the element is visible (reduced for better mobile support)
        threshold: 0.1
    });

    // Start observing all nodes and connectors
    nodes.forEach(node => {
        nodeObserver.observe(node);
    });

    connectors.forEach(connector => {
        connectorObserver.observe(connector);
    });
});

// Initialize calendar and booking form
document.addEventListener('DOMContentLoaded', () => {
    const calendar = new Calendar();
    const bookingForm = new BookingForm();
});
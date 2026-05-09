// Configuration for the country/state/city API
const config = {
    cUrl: 'https://api.countrystatecity.in/v1/countries',
    ckey: 'NHhvOEcyWk50N2Vna3VFTE00bFp3MjFKR0ZEOUhkZlg4RTk1MlJlaA=='
};

// Select the dropdown elements
const countrySelect = document.querySelector('.country');
const stateSelect = document.querySelector('.state');
const citySelect = document.querySelector('.city');
const form = document.getElementById('admin-register-form');
const notification = document.getElementById('notification');
const registerBtn = document.getElementById('register-btn');

// Notification function for user feedback
const showNotification = (message, isSuccess) => {
    notification.textContent = message;
    notification.className = `notification ${isSuccess ? 'success' : 'error'} show`;
    setTimeout(() => notification.classList.remove('show'), 3000);
};

// Password generation function
const generatePassword = () => {
    const firstName = document.getElementById('firstName').value.trim();
    const companyName = document.getElementById('companyName').value.trim();
    const date = new Date();
    const year = date.getFullYear();

    // Use the first part of the first name, capitalized
    const namePart = firstName.length >= 3 ? firstName.substring(0, 3) : 'User';
    const capitalizedNamePart = namePart.charAt(0).toUpperCase() + namePart.slice(1).toLowerCase();

    // Use a part of the company name
    const companyPart = companyName.length >= 5 ? companyName.substring(0, 5) : 'Comp';
    const capitalizedCompanyPart = companyPart.charAt(0).toUpperCase() + companyPart.slice(1).toLowerCase();

    // Generate a random special character
    const specialChars = "!@#$%^&*()_+";
    const randomSpecialChar = specialChars.charAt(Math.floor(Math.random() * specialChars.length));

    // Combine parts into the final password
    const generatedPassword = `@${capitalizedNamePart}${capitalizedCompanyPart}${year}${randomSpecialChar}`;
    
    document.getElementById('password').value = generatedPassword;
};

// Dropdown population functions (your original working code)
const loadCountries = () => {
    countrySelect.disabled = false;
    stateSelect.disabled = true;
    citySelect.disabled = true;
    stateSelect.style.pointerEvents = 'none';
    citySelect.style.pointerEvents = 'none';
    countrySelect.innerHTML = '<option selected>Select Country</option>';

    fetch(config.cUrl, { headers: { "X-CSCAPI-KEY": config.ckey } })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            countrySelect.innerHTML = '<option value="">Select Country</option>';
            if (data && Array.isArray(data)) {
                data.forEach(country => {
                    const option = document.createElement('option');
                    option.value = country.iso2;
                    option.textContent = country.name;
                    countrySelect.appendChild(option);
                });
            } else {
                console.error('Invalid data format from API:', data);
            }
        })
        .catch(error => {
            console.error('Error loading countries:', error);
            countrySelect.innerHTML = '<option value="">Error loading countries - Please refresh</option>';
        });
};

const loadStates = () => {
    const selectedCountryCode = countrySelect.value;
    stateSelect.innerHTML = '<option value="">Select State</option>';
    citySelect.innerHTML = '<option value="">Select City</option>';
    
    if (!selectedCountryCode) {
        stateSelect.disabled = true;
        citySelect.disabled = true;
        stateSelect.style.pointerEvents = 'none';
        citySelect.style.pointerEvents = 'none';
        return;
    }

    stateSelect.disabled = false;
    citySelect.disabled = true;
    stateSelect.style.pointerEvents = 'auto';
    citySelect.style.pointerEvents = 'none';
    stateSelect.innerHTML = '<option selected>Select State</option>';
    citySelect.innerHTML = '<option selected>Select City</option>';

    fetch(`${config.cUrl}/${selectedCountryCode}/states`, { headers: { "X-CSCAPI-KEY": config.ckey } })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            stateSelect.innerHTML = '<option value="">Select State</option>';
            if (data && Array.isArray(data)) {
                data.forEach(state => {
                    const option = document.createElement('option');
                    option.value = state.iso2;
                    option.textContent = state.name;
                    stateSelect.appendChild(option);
                });
            } else {
                console.error('Invalid states data:', data);
            }
        })
        .catch(error => {
            console.error('Error loading states:', error);
            stateSelect.innerHTML = '<option value="">Error loading states</option>';
        });
};

const loadCities = () => {
    const selectedCountryCode = countrySelect.value;
    const selectedStateCode = stateSelect.value;
    citySelect.innerHTML = '<option value="">Select City</option>';

    if (!selectedCountryCode || !selectedStateCode) {
        citySelect.disabled = true;
        citySelect.style.pointerEvents = 'none';
        return;
    }

    citySelect.disabled = false;
    citySelect.style.pointerEvents = 'auto';
    citySelect.innerHTML = '<option selected>Select City</option>';

    fetch(`${config.cUrl}/${selectedCountryCode}/states/${selectedStateCode}/cities`, { headers: { "X-CSCAPI-KEY": config.ckey } })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            citySelect.innerHTML = '<option value="">Select City</option>';
            if (data && Array.isArray(data)) {
                data.forEach(city => {
                    const option = document.createElement('option');
                    option.value = city.name;
                    option.textContent = city.name;
                    citySelect.appendChild(option);
                });
            } else {
                console.error('Invalid cities data:', data);
            }
        })
        .catch(error => {
            console.error('Error loading cities:', error);
            citySelect.innerHTML = '<option value="">Error loading cities</option>';
        });
};

// Event listeners and initial load
document.addEventListener('DOMContentLoaded', () => {
    // Attach event listeners to the dropdowns
    countrySelect.addEventListener('change', loadStates);
    stateSelect.addEventListener('change', loadCities);

    // Attach event listener for the generate password button
    document.getElementById('generate-password-btn').addEventListener('click', generatePassword);

    // Form submission handler
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Validate address fields
        if (!countrySelect.value) {
            showNotification('Please select a country', false);
            return;
        }
        if (!stateSelect.value) {
            showNotification('Please select a state', false);
            return;
        }
        if (!citySelect.value) {
            showNotification('Please select a city', false);
            return;
        }
        
        registerBtn.disabled = true;
        registerBtn.textContent = 'Registering...';

        const data = {
            firstName: form.firstName.value,
            lastName: form.lastName.value,
            email: form.email.value,
            contact: form.contact.value,
            password: form.password.value,
            companyName: form.companyName.value,
            website: form.website.value,
            industry: form.industry.value,
            address: form.address.value,
            city: citySelect.options[citySelect.selectedIndex].textContent,
            state: stateSelect.options[stateSelect.selectedIndex].textContent,
            zipCode: form.zipCode.value,
            country: countrySelect.options[countrySelect.selectedIndex].textContent
        };

        try {
            const response = await fetch('/api/admin/register-client', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            const result = await response.json();
            if (response.ok) {
                showNotification(result.message, true);
                form.reset();
                document.getElementById('password').value = '';
                loadCountries(); // Re-populate to reset dropdowns
            } else {
                showNotification(result.message || 'An unknown error occurred.', false);
            }
        } catch (error) {
            console.error('Registration failed:', error);
            showNotification('An error occurred. Please check the server logs.', false);
        } finally {
            registerBtn.disabled = false;
            registerBtn.textContent = 'Register Client';
        }
    });

    // Initial load of countries
    loadCountries();
});
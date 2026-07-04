// Configuration for APIs
const config = {
    // RestCountries API (more reliable, no rate limits)
    countriesUrl: 'https://restcountries.com/v3.1/all',
    // Fallback: Nominatim API for geographic data (no key needed)
    nominatimUrl: 'https://nominatim.openstreetmap.org'
};

// Fallback countries list in case API fails
const fallbackCountries = [
    { iso2: 'US', name: 'United States' },
    { iso2: 'CA', name: 'Canada' },
    { iso2: 'GB', name: 'United Kingdom' },
    { iso2: 'AU', name: 'Australia' },
    { iso2: 'IN', name: 'India' },
    { iso2: 'ZA', name: 'South Africa' },
    { iso2: 'NG', name: 'Nigeria' },
    { iso2: 'DE', name: 'Germany' },
    { iso2: 'FR', name: 'France' },
    { iso2: 'JP', name: 'Japan' },
    { iso2: 'BR', name: 'Brazil' },
    { iso2: 'MX', name: 'Mexico' },
    { iso2: 'SG', name: 'Singapore' },
    { iso2: 'NZ', name: 'New Zealand' },
    { iso2: 'NL', name: 'Netherlands' }
];

// Retry configuration
const retryConfig = {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 5000
};

// Fetch with retry logic
const fetchWithRetry = async (url, options, retries = 0) => {
    try {
        const response = await fetch(url, options);
        if (!response.ok) {
            if (response.status === 429 && retries < retryConfig.maxRetries) {
                // Exponential backoff for 429 errors
                const delay = Math.min(retryConfig.initialDelay * Math.pow(2, retries), retryConfig.maxDelay);
                await new Promise(resolve => setTimeout(resolve, delay));
                return fetchWithRetry(url, options, retries + 1);
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response;
    } catch (error) {
        if (retries < retryConfig.maxRetries) {
            const delay = Math.min(retryConfig.initialDelay * Math.pow(2, retries), retryConfig.maxDelay);
            await new Promise(resolve => setTimeout(resolve, delay));
            return fetchWithRetry(url, options, retries + 1);
        }
        throw error;
    }
};

// Cache management for API data
const cache = {
    setCountries: (data) => sessionStorage.setItem('countries_cache', JSON.stringify(data)),
    getCountries: () => {
        const cached = sessionStorage.getItem('countries_cache');
        return cached ? JSON.parse(cached) : null;
    },
    setStates: (countryCode, data) => sessionStorage.setItem(`states_${countryCode}`, JSON.stringify(data)),
    getStates: (countryCode) => {
        const cached = sessionStorage.getItem(`states_${countryCode}`);
        return cached ? JSON.parse(cached) : null;
    },
    setCities: (countryCode, stateCode, data) => sessionStorage.setItem(`cities_${countryCode}_${stateCode}`, JSON.stringify(data)),
    getCities: (countryCode, stateCode) => {
        const cached = sessionStorage.getItem(`cities_${countryCode}_${stateCode}`);
        return cached ? JSON.parse(cached) : null;
    }
};
const countrySelect = document.querySelector('.country');
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

// Dropdown population functions
const loadCountries = async () => {
    countrySelect.disabled = false;
    countrySelect.innerHTML = '<option value="">Select Country</option>';

    // Check cache first
    const cachedCountries = cache.getCountries();
    if (cachedCountries) {
        populateCountries(cachedCountries);
        return;
    }

    countrySelect.innerHTML = '<option value="">Loading countries...</option>';

    try {
        const response = await fetchWithRetry(config.countriesUrl, {});
        const data = await response.json();
        
        // Transform RestCountries data to our format
        const countries = data.map(country => ({
            iso2: country.cca2,
            name: country.name.common
        })).sort((a, b) => a.name.localeCompare(b.name));
        
        cache.setCountries(countries);
        populateCountries(countries);
    } catch (error) {
        console.error('Error loading countries from API, using fallback:', error);
        // Use fallback countries
        cache.setCountries(fallbackCountries);
        populateCountries(fallbackCountries);
        showNotification('Using limited country list.', false);
    }
};

const populateCountries = (data) => {
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
};

// Get reference to state and city inputs (now text inputs instead of selects)
const stateInput = document.getElementById('state');
const cityInput = document.getElementById('city');

// Event listeners and initial load
document.addEventListener('DOMContentLoaded', () => {
    // Note: state and city are now text inputs, no dropdown loading needed
    
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
        if (!stateInput.value.trim()) {
            showNotification('Please enter a state or province', false);
            return;
        }
        if (!cityInput.value.trim()) {
            showNotification('Please enter a city', false);
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
            city: cityInput.value.trim(),
            state: stateInput.value.trim(),
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
document.addEventListener('DOMContentLoaded', function () {
    const signupForm = document.getElementById('signup-form');
    const signinForm = document.getElementById('signin-form');

    // WCF Service Base URL
    // Make sure this matches the address where your WCF service is running.
    const serviceUrl = 'http://localhost:51923/AuthService.svc/rest';
    
    //------------------------------------------
    // Password Toggle Functionality
    //------------------------------------------
    function setupPasswordToggle() {
        const toggles = document.querySelectorAll('.password-toggle');
        toggles.forEach(toggle => {
            toggle.addEventListener('click', function () {
                const input = this.previousElementSibling;
                const type = input.getAttribute('type') === 'password' ? 'text' : 'password';
                input.setAttribute('type', type);
                this.classList.toggle('fa-eye-slash');
            });
        });
    }
    
    //------------------------------------------
    // Handle Sign-Up Logic
    //------------------------------------------
    if (signupForm) {
        setupPasswordToggle();
        
        const passwordInput = document.getElementById('password');
        const confirmPasswordInput = document.getElementById('confirm-password');

        // Real-time password requirement validation
        const lengthReq = document.getElementById('length-req');
        const uppercaseReq = document.getElementById('uppercase-req');
        const lowercaseReq = document.getElementById('lowercase-req');
        const numberReq = document.getElementById('number-req');
        const specialReq = document.getElementById('special-req');

        function updateRequirement(element, isValid) {
            const icon = element.querySelector('i');
            if (isValid) {
                element.classList.add('valid');
                element.classList.remove('invalid');
                icon.classList.remove('fa-times');
                icon.classList.add('fa-check');
            } else {
                element.classList.add('invalid');
                element.classList.remove('valid');
                icon.classList.remove('fa-check');
                icon.classList.add('fa-times');
            }
        }

        passwordInput.addEventListener('keyup', function () {
            const value = this.value;
            // The regular expression below is corrected to fix the "Unterminated literal" error.
            updateRequirement(lengthReq, value.length >= 8);
            updateRequirement(uppercaseReq, /[A-Z]/.test(value));
            updateRequirement(lowercaseReq, /[a-z]/.test(value));
            updateRequirement(numberReq, /[0-9]/.test(value));
            updateRequirement(specialReq, /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(value));
        });

        // Form submission handler
        signupForm.addEventListener('submit', async function (event) {
            event.preventDefault();

            // Client-side validation
            const password = passwordInput.value;
            const confirmPassword = confirmPasswordInput.value;
            if (password !== confirmPassword) {
                document.getElementById('confirm-password-error').style.display = 'block';
                return;
            } else {
                document.getElementById('confirm-password-error').style.display = 'none';
            }
            
            // Check if all password requirements are met
            const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]).{8,}$/;
            if (!passwordRegex.test(password)) {
                 document.getElementById('password-error').style.display = 'block';
                 return;
            } else {
                 document.getElementById('password-error').style.display = 'none';
            }

            // Prepare data for WCF service
            const formData = {
                firstName: document.getElementById('FirstName').value,
                lastName: document.getElementById('LastName').value,
                title: document.getElementById('category').value,
                email: document.getElementById('email').value,
                contacts: document.getElementById('phone').value,
                password: passwordInput.value
            };

            try {
                const response = await fetch(`${serviceUrl}/SignUp`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(formData)
                });
                const data = await response.json();

                if (data.SignUpResult) {
                    alert('Sign up successful!');
                    window.location.href = 'signin.html'; // Redirect to sign in page on success
                } else {
                    alert('An account with this email already exists. Please use a different email.');
                }
            } catch (error) {
                console.error('Error during sign up:', error);
                alert('An unexpected error occurred. Please try again.');
            }
        });
    }

    //------------------------------------------
    // Handle Sign-In Logic
    //------------------------------------------
    if (signinForm) {
        setupPasswordToggle();

        signinForm.addEventListener('submit', async function (event) {
            event.preventDefault();

            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;

            try {
                const response = await fetch(`${serviceUrl}/Login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: email, password: password })
                });
                const data = await response.json();

                if (data.LoginResult) {
                    alert('Sign in successful!');
                    window.location.href = 'index.html'; // Redirect to home page on success
                } else {
                    alert('Invalid email or password.');
                }
            } catch (error) {
                console.error('Error during sign in:', error);
                alert('An unexpected error occurred. Please try again.');
            }
        });
    }
});
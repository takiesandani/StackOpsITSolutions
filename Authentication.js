document.addEventListener('DOMContentLoaded', function() {
  const signinForm = document.getElementById('signin-form');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const mfaCodeInput = document.getElementById('mfa-code');
  const mfaSection = document.querySelector('.mfa-section');
  const submitBtn = document.getElementById('submit-btn');
  const verifyBtn = document.getElementById('verify-btn');
  const emailError = document.getElementById('email-error');
  const passwordError = document.getElementById('password-error');
  const mfaError = document.getElementById('mfa-error');
  const togglePassword = document.getElementById('toggle-password');
  
  let currentEmail = '';
  
  // Toggle password visibility
  togglePassword.addEventListener('click', function() {
    const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
    passwordInput.setAttribute('type', type);
    this.classList.toggle('fa-eye');
    this.classList.toggle('fa-eye-slash');
  });
  
  // Handle form submission
  signinForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    
    // Reset error messages
    emailError.style.display = 'none';
    passwordError.style.display = 'none';
    mfaError.style.display = 'none';
    
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    
    // Basic validation
    let isValid = true;
    
    if (!validateEmail(email)) {
      emailError.style.display = 'block';
      isValid = false;
    }
    
    if (password.length < 8) {
      passwordError.style.display = 'block';
      isValid = false;
    }
    
    if (!isValid) return;
    
    currentEmail = email;
    
    try {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Signing in...';
      
      const response = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        // Show MFA section
        mfaSection.style.display = 'block';
        submitBtn.style.display = 'none';
      } else {
        alert(data.message || 'Sign-in failed. Please try again.');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('An error occurred. Please try again.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Sign In';
    }
  });
  
  // Handle MFA verification
  verifyBtn.addEventListener('click', async function() {
    const code = mfaCodeInput.value.trim();
    
    if (code.length !== 6 || !/^\d+$/.test(code)) {
      mfaError.textContent = 'Please enter a valid 6-digit code.';
      mfaError.style.display = 'block';
      return;
    }
    
    try {
      verifyBtn.disabled = true;
      verifyBtn.textContent = 'Verifying...';
      
      const response = await fetch('/api/auth/verify-mfa', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email: currentEmail, code })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        // Redirect to admin page
        window.location.href = data.redirect;
      } else {
        mfaError.textContent = data.message || 'Invalid code. Please try again.';
        mfaError.style.display = 'block';
      }
    } catch (error) {
      console.error('Error:', error);
      mfaError.textContent = 'An error occurred. Please try again.';
      mfaError.style.display = 'block';
    } finally {
      verifyBtn.disabled = false;
      verifyBtn.textContent = 'Verify Code';
    }
  });
  
  // Email validation function
  function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  }
});
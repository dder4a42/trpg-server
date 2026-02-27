/**
 * Authentication Form Handler
 * Handles login and register form submissions
 */
export class AuthFormHandler {
  constructor() {
    this.initLoginForm();
    this.initRegisterForm();
  }

  /**
   * Initialize login form handler
   */
  initLoginForm() {
    const form = document.getElementById('loginForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errorDiv = document.getElementById('loginError');
      errorDiv.classList.remove('visible');

      const formData = new FormData(e.target);
      const data = {
        usernameOrEmail: formData.get('usernameOrEmail'),
        password: formData.get('password'),
      };

      try {
        const response = await fetch('/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });

        const result = await response.json();

        if (response.ok && result.success) {
          e.target.reset();
          document.getElementById('usernameOrEmail').value = '';
          document.getElementById('password').value = '';
          window.location.href = '/';
        } else {
          errorDiv.textContent = result.error?.message || 'Login failed';
          errorDiv.classList.add('visible');
        }
      } catch (error) {
        errorDiv.textContent = 'Network error. Please try again.';
        errorDiv.classList.add('visible');
      }
    });
  }

  /**
   * Initialize register form handler
   */
  initRegisterForm() {
    const form = document.getElementById('registerForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errorDiv = document.getElementById('registerError');
      errorDiv.classList.remove('visible');

      const formData = new FormData(e.target);
      const data = {
        username: formData.get('username'),
        email: formData.get('email'),
        password: formData.get('password'),
      };

      try {
        const response = await fetch('/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });

        const result = await response.json();

        if (response.ok && result.success) {
          e.target.reset();
          document.getElementById('regUsername').value = '';
          document.getElementById('regEmail').value = '';
          document.getElementById('regPassword').value = '';
          window.location.href = '/';
        } else {
          errorDiv.textContent = result.error?.message || 'Registration failed';
          errorDiv.classList.add('visible');
        }
      } catch (error) {
        errorDiv.textContent = 'Network error. Please try again.';
        errorDiv.classList.add('visible');
      }
    });
  }
}

/**
 * Initialize logout handler
 */
export function initLogout() {
  const form = document.getElementById('logoutForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await fetch('/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  });
}

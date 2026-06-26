const API_URL = 'http://localhost:3000/api';

class App {
    constructor() {
        this.root = document.getElementById('app-root');
        this.currentUser = null;
        this.currentView = null;
        this.init();
    }

    async init() {
        // Check if user is logged in
        await this.checkAuthStatus();
        
        // Handle initial route
        const hash = window.location.hash.replace('#', '') || 'login';
        this.navigate(hash, true);

        // Listen for hash changes
        window.addEventListener('hashchange', () => {
            const newHash = window.location.hash.replace('#', '') || 'login';
            this.navigate(newHash, true);
        });
    }

    async checkAuthStatus() {
        try {
            const res = await fetch(`${API_URL}/user/profile`, {
                credentials: 'include',
                headers: { 'Accept': 'application/json' }
            });
            if (res.ok) {
                const data = await res.json();
                this.currentUser = data.user;
                this.updateNav();
            } else {
                this.currentUser = null;
                this.updateNav();
            }
        } catch (error) {
            console.error('Auth check failed', error);
            this.currentUser = null;
            this.updateNav();
        }
    }

    updateNav() {
        const unauthNav = document.getElementById('nav-unauthenticated');
        const authNav = document.getElementById('nav-authenticated');
        
        if (this.currentUser) {
            unauthNav.style.display = 'none';
            authNav.style.display = 'flex';
            
            // Update User Menu
            document.getElementById('nav-user-avatar').textContent = this.currentUser.full_name.charAt(0).toUpperCase();
            document.getElementById('dropdown-name').textContent = this.currentUser.full_name;
            document.getElementById('dropdown-email').textContent = this.currentUser.email;
        } else {
            unauthNav.style.display = 'flex';
            authNav.style.display = 'none';
        }
    }

    navigate(view, skipHistory = false) {
        // Protected routes check
        const protectedRoutes = ['dashboard', 'profile', 'settings'];
        if (protectedRoutes.includes(view) && !this.currentUser) {
            view = 'login';
        }
        
        // Redirect logged-in users away from auth pages
        const authRoutes = ['login', 'register'];
        if (authRoutes.includes(view) && this.currentUser) {
            view = 'dashboard';
        }

        if (!skipHistory) {
            window.location.hash = view;
        }

        this.currentView = view;
        this.render();
    }

    render() {
        const template = document.getElementById(`tpl-${this.currentView}`);
        if (!template) {
            this.root.innerHTML = '<div class="auth-container"><h2>404 - View Not Found</h2></div>';
            return;
        }
        
        // Clone and mount
        this.root.innerHTML = '';
        this.root.appendChild(template.content.cloneNode(true));

        // View specific initializations
        if (this.currentView === 'dashboard') {
            this.initDashboard();
        } else if (this.currentView === 'profile') {
            this.initProfile();
        }
    }

    // ==========================================
    // AUTH ACTIONS
    // ==========================================

    togglePassword(inputId) {
        const input = document.getElementById(inputId);
        if (input.type === 'password') {
            input.type = 'text';
        } else {
            input.type = 'password';
        }
    }

    checkPasswordStrength(password) {
        const strengthFill = document.getElementById('strength-fill');
        const strengthText = document.getElementById('strength-text');
        
        let strength = 0;
        if (password.length >= 8) strength += 20;
        if (/[A-Z]/.test(password)) strength += 20;
        if (/[a-z]/.test(password)) strength += 20;
        if (/[0-9]/.test(password)) strength += 20;
        if (/[@$!%*?&]/.test(password)) strength += 20;
        
        strengthFill.style.width = `${strength}%`;
        
        if (strength < 40) {
            strengthFill.style.background = 'var(--red)';
            strengthText.textContent = 'Weak Password';
        } else if (strength < 80) {
            strengthFill.style.background = 'var(--yellow)';
            strengthText.textContent = 'Moderate Password';
        } else {
            strengthFill.style.background = 'var(--green)';
            strengthText.textContent = 'Strong Password';
        }
    }

    async handleLogin(e) {
        e.preventDefault();
        const usernameOrEmail = document.getElementById('login-username').value;
        const password = document.getElementById('login-password').value;
        const rememberMe = document.getElementById('remember-me')?.checked || false;
        const btn = document.getElementById('btn-login-submit');
        const errorDiv = document.getElementById('login-error');

        btn.disabled = true;
        btn.querySelector('.btn-text').textContent = 'Logging In...';
        errorDiv.style.display = 'none';

        try {
            const res = await fetch(`${API_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ usernameOrEmail, password, rememberMe })
            });

            const data = await res.json();
            
            if (res.ok) {
                await this.checkAuthStatus();
                this.navigate('dashboard');
            } else {
                errorDiv.textContent = data.error || 'Login failed';
                errorDiv.style.display = 'block';
            }
        } catch (err) {
            errorDiv.textContent = 'Network error. Please try again.';
            errorDiv.style.display = 'block';
        } finally {
            btn.disabled = false;
            btn.querySelector('.btn-text').textContent = 'Log In';
        }
    }

    async handleRegister(e) {
        e.preventDefault();
        const fullName = document.getElementById('reg-fullname').value;
        const username = document.getElementById('reg-username').value;
        const email = document.getElementById('reg-email').value;
        const phone = document.getElementById('reg-phone')?.value || '';
        const password = document.getElementById('reg-password').value;
        const confirmPassword = document.getElementById('reg-confirm-password').value;
        const termsAccepted = document.getElementById('reg-terms')?.checked || false;
        
        const btn = document.getElementById('btn-register-submit');
        const errorDiv = document.getElementById('register-error');

        btn.disabled = true;
        btn.querySelector('.btn-text').textContent = 'Creating Account...';
        errorDiv.style.display = 'none';

        try {
            const res = await fetch(`${API_URL}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ fullName, username, email, phone, password, confirmPassword, termsAccepted })
            });

            const data = await res.json();
            
            if (res.ok) {
                await this.checkAuthStatus();
                this.navigate('dashboard');
            } else {
                errorDiv.textContent = data.error || 'Registration failed';
                errorDiv.style.display = 'block';
            }
        } catch (err) {
            errorDiv.textContent = 'Network error. Please try again.';
            errorDiv.style.display = 'block';
        } finally {
            btn.disabled = false;
            btn.querySelector('.btn-text').textContent = 'Create Account';
        }
    }

    async logout() {
        try {
            await fetch(`${API_URL}/auth/logout`, { method: 'POST', credentials: 'include' });
            this.currentUser = null;
            this.updateNav();
            this.navigate('login');
        } catch (err) {
            console.error('Logout failed', err);
        }
    }

    async handleForgotPassword(e) {
        e.preventDefault();
        const email = document.getElementById('forgot-email').value;
        const btn = document.getElementById('btn-forgot-submit');
        const errorDiv = document.getElementById('forgot-error');
        const successDiv = document.getElementById('forgot-success');
        
        btn.disabled = true;
        btn.textContent = 'Sending...';
        errorDiv.style.display = 'none';
        successDiv.style.display = 'none';

        try {
            const res = await fetch(`${API_URL}/auth/forgot-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });
            const data = await res.json();
            if (res.ok) {
                successDiv.textContent = data.message;
                successDiv.style.display = 'block';
                document.getElementById('forgot-email').value = '';
            } else {
                errorDiv.textContent = data.error || 'Failed to send reset link';
                errorDiv.style.display = 'block';
            }
        } catch (err) {
            errorDiv.textContent = 'Network error. Please try again.';
            errorDiv.style.display = 'block';
        } finally {
            btn.disabled = false;
            btn.textContent = 'Send Reset Link';
        }
    }

    // ==========================================
    // VIEW INITIALIZERS
    // ==========================================

    initProfile() {
        if (!this.currentUser) return;
        document.getElementById('prof-fullname').value = this.currentUser.full_name;
        document.getElementById('prof-username').value = this.currentUser.username;
        document.getElementById('prof-email').value = this.currentUser.email;
        document.getElementById('prof-created').value = new Date(this.currentUser.created_at).toLocaleString();
    }

    initDashboard() {
        if (!this.currentUser) return;
        document.getElementById('dash-user-name').textContent = this.currentUser.full_name.split(' ')[0];
        
        this.fetchDashboardStats();
        
        // Dynamically load the analyzer modules if not loaded
        if (!window.ImageAnalyzer) {
            this.loadScript('/src/js/exif-reader.js', () => {
                this.loadScript('/src/js/analyzer.js', () => {
                    this.loadScript('/src/js/app.js', () => {
                        if (window.AppController) window.AppController.init();
                    });
                });
            });
        } else {
            if (window.AppController) window.AppController.init();
        }
    }

    async fetchDashboardStats() {
        if (!this.currentUser) return;
        try {
            const res = await fetch(`${API_URL}/user/stats`, { credentials: 'include' });
            if (res.ok) {
                const stats = await res.json();
                const elTotal = document.getElementById('stat-total');
                const elAi = document.getElementById('stat-ai');
                const elReal = document.getElementById('stat-real');
                if (elTotal) elTotal.textContent = stats.total || 0;
                if (elAi) elAi.textContent = stats.ai || 0;
                if (elReal) elReal.textContent = stats.authentic || 0;
            }
        } catch (err) {
            console.error('Failed to fetch stats', err);
        }
    }

    loadScript(src, callback) {
        const script = document.createElement('script');
        script.src = src;
        if (callback) script.onload = callback;
        document.body.appendChild(script);
    }
}

// Initialize App
window.app = new App();

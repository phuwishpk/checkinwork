document.addEventListener('DOMContentLoaded', async () => {
    await protectRoute();
    setupLogout();

    const loginForm = document.getElementById('login-form');
    const errorEl = document.getElementById('login-error');
    if (!loginForm) return;

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorEl?.classList.add('hidden');
        try {
            const data = await apiCall('/api/login', 'POST', {
                username: loginForm.username.value,
                password: loginForm.password.value,
            });
            window.location.href = data.user.role === 'admin' ? '/manager' : '/dashboard';
        } catch (err) {
            if (errorEl) {
                errorEl.textContent = err.message;
                errorEl.classList.remove('hidden');
            }
        }
    });
});

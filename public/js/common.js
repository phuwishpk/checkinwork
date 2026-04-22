// Shared utilities — included on every page

async function apiCall(url, method = 'GET', body = null) {
    const options = {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
    };
    if (body) options.body = JSON.stringify(body);
    const res = await fetch(url, options);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'API error');
    return data;
}

async function checkSession() {
    try {
        const data = await apiCall('/api/session');
        return data.user;
    } catch (e) {
        return null;
    }
}

async function protectRoute() {
    const user = await checkSession();
    const path = window.location.pathname;

    if (!user) {
        if (path !== '/' && path !== '/index.html') {
            window.location.href = '/';
        }
        return null;
    }

    // Redirect away from login page
    if (path === '/' || path === '/index.html' || path === '') {
        window.location.href = user.role === 'admin' ? '/manager' : '/dashboard';
        return user;
    }

    // Role guards
    if (user.role === 'intern' && path.startsWith('/manager')) {
        window.location.href = '/dashboard';
        return user;
    }
    if (user.role === 'admin' && (path === '/dashboard' || path === '/daily-log' || path === '/attendance')) {
        window.location.href = '/manager';
        return user;
    }

    // Update UI user info present on page
    if (document.getElementById('user-name'))
        document.getElementById('user-name').textContent = user.full_name || user.username;
    if (document.getElementById('user-role'))
        document.getElementById('user-role').textContent = user.role;
    if (document.getElementById('greeting-name')) {
        const h = new Date().getHours();
        const greeting = (h >= 5 && h < 12) ? 'Good morning' : 'Good evening';
        document.getElementById('greeting-name').textContent = `${greeting}, ${user.full_name || user.username} 👋`;
    }
    if (document.getElementById('profile-card-name'))
        document.getElementById('profile-card-name').textContent = user.full_name || user.username;
    if (document.getElementById('profile-card-role'))
        document.getElementById('profile-card-role').textContent = user.role === 'admin' ? 'Manager' : 'Intern';
    if (document.getElementById('dynamic-greeting')) {
        const h = new Date().getHours();
        document.getElementById('dynamic-greeting').textContent =
            h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    }

    window.currentUser = user;
    return user;
}

function setupLogout() {
    const btn = document.getElementById('logout-btn');
    if (btn) {
        btn.addEventListener('click', async () => {
            try { await apiCall('/api/logout', 'POST'); } catch(e) {}
            window.location.href = '/';
        });
    }
}

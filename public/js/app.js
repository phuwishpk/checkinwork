// Basic utility to make API calls
async function apiCall(url, method = 'GET', body = null) {
    const options = {
        method,
        headers: { 'Content-Type': 'application/json' },
    };
    if (body) {
        options.body = JSON.stringify(body);
    }
    const res = await fetch(url, options);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'API error');
    return data;
}

// Check session on load
async function checkSession() {
    try {
        const data = await apiCall('/api/session');
        return data.user;
    } catch (e) {
        return null;
    }
}

// Protect routes
async function protectRoute() {
    const user = await checkSession();
    const path = window.location.pathname;

    if (!user) {
        if (path !== '/' && path !== '/index.html') {
            window.location.href = '/';
        }
    } else {
        if (path === '/' || path === '/index.html' || path === '') {
            window.location.href = user.role === 'admin' ? '/manager-dashboard.html' : '/intern-dashboard.html';
        } else if (user.role === 'admin' && (path.includes('intern-dashboard') || path.includes('daily-log'))) {
            window.location.href = '/manager-dashboard.html';
        } else if (user.role === 'intern' && path.includes('manager-dashboard')) {
            window.location.href = '/intern-dashboard.html';
        }

        // Update UI user info
        const nameEl = document.getElementById('user-name');
        const roleEl = document.getElementById('user-role');
        const greetingEl = document.getElementById('greeting-name');
        if (nameEl) nameEl.textContent = user.full_name;
        if (roleEl) roleEl.textContent = user.role;
        if (greetingEl) greetingEl.textContent = `Good morning, ${user.full_name.split(' ')[0]}`;
    }
    return user;
}

// Logic depending on page
document.addEventListener('DOMContentLoaded', async () => {
    const path = window.location.pathname;
    const user = await protectRoute();

    // Setup Logout
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await apiCall('/api/logout', 'POST');
            window.location.href = '/';
        });
    }

    if (path === '/' || path === '/index.html' || path === '') {
        const loginForm = document.getElementById('login-form');
        const errorEl = document.getElementById('login-error');
        if (loginForm) {
            loginForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const username = loginForm.username.value;
                const password = loginForm.password.value;
                try {
                    const data = await apiCall('/api/login', 'POST', { username, password });
                    window.location.href = data.user.role === 'admin' ? '/manager-dashboard.html' : '/intern-dashboard.html';
                } catch (err) {
                    errorEl.textContent = err.message;
                    errorEl.classList.remove('hidden');
                }
            });
        }
    }

    if (path.includes('intern-dashboard')) {
        let isClockedIn = false;
        let clockInTime = null;
        let timerInterval = null;

        const loadInternData = async () => {
            try {
                const data = await apiCall('/api/intern/dashboard');
                
                // Set progress
                document.getElementById('progress-hours').textContent = data.totalHours;
                const pct = Math.min((data.totalHours / 400) * 100, 100);
                document.getElementById('progress-bar').style.width = `${pct}%`;

                // Set attendance
                const today = new Date().toISOString().slice(0, 10);
                const attList = document.getElementById('weekly-attendance-list');
                attList.innerHTML = '';
                
                data.attendance.forEach(att => {
                    const isToday = att.date.startsWith(today);
                    if (isToday && !att.clock_out_time) {
                        isClockedIn = true;
                        clockInTime = new Date(`1970-01-01T${att.clock_in_time}Z`);
                    }

                    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                    const dateObj = new Date(att.date);
                    const dayName = days[dateObj.getDay()];
                    
                    attList.innerHTML += `
                    <div class="flex items-center justify-between p-4 ${isToday ? 'bg-primary-container/10' : 'bg-surface'} rounded-lg">
                        <div class="flex items-center space-x-4 w-1/4">
                            <div class="w-10 h-10 rounded-full ${isToday ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface'} flex items-center justify-center font-bold text-sm">${dayName}</div>
                            <span class="font-medium text-sm ${isToday ? 'text-primary' : 'text-on-surface'}">${isToday ? 'Today' : dateObj.toLocaleDateString()}</span>
                        </div>
                        <div class="flex-1 flex justify-center space-x-8 text-sm">
                            <div class="flex flex-col items-center">
                                <span class="text-on-surface-variant text-xs mb-1">Arrival</span>
                                <span class="font-medium">${att.clock_in_time || '--'}</span>
                            </div>
                            <div class="flex flex-col items-center">
                                <span class="text-on-surface-variant text-xs mb-1">Departure</span>
                                <span class="font-medium ${!att.clock_out_time && isToday ? 'text-on-surface-variant italic' : ''}">${att.clock_out_time || (isToday ? 'In Progress' : '--')}</span>
                            </div>
                        </div>
                        <div class="w-1/4 flex justify-end items-center space-x-3">
                            <span class="text-xs px-2 py-1 ${!att.clock_out_time && isToday ? 'bg-secondary-fixed text-on-secondary-fixed flex items-center space-x-1' : 'bg-tertiary-container text-on-tertiary-container'} rounded-full font-medium">
                                ${!att.clock_out_time && isToday ? '<span class="w-1.5 h-1.5 rounded-full bg-primary inline-block"></span><span>Active</span>' : (att.total_hours + ' hrs')}
                            </span>
                        </div>
                    </div>`;
                });

                // Set recent logs
                const logList = document.getElementById('recent-logs-list');
                logList.innerHTML = '';
                data.logs.forEach(log => {
                    logList.innerHTML += `
                    <div class="p-4 bg-surface rounded-lg">
                        <div class="flex justify-between items-start mb-2">
                            <h4 class="font-medium text-sm text-on-surface">${log.task_category}</h4>
                            <span class="text-xs text-on-surface-variant">${new Date(log.date).toLocaleDateString()}</span>
                        </div>
                        <p class="text-xs text-on-surface-variant leading-relaxed line-clamp-2">${log.description}</p>
                        <div class="mt-3 flex gap-2">
                            <span class="text-[10px] px-2 py-0.5 bg-surface-container-highest text-on-surface rounded-full">${log.hours_spent} hrs</span>
                            <span class="text-[10px] px-2 py-0.5 bg-surface-container-highest text-on-surface rounded-full capitalize">${log.status}</span>
                        </div>
                    </div>`;
                });

                updateClockUI();

            } catch (err) {
                console.error('Error loading intern data:', err);
            }
        };

        const updateClockUI = () => {
            const btn = document.getElementById('clock-btn');
            const icon = document.getElementById('clock-icon');
            const text = document.getElementById('clock-text');
            const timer = document.getElementById('session-timer');
            const info = document.getElementById('clock-in-info');
            const timeSpan = document.getElementById('clock-in-time');

            if (isClockedIn) {
                btn.className = "w-32 h-32 rounded-full bg-gradient-to-br from-red-200 to-red-500 text-white flex flex-col items-center justify-center shadow-lg hover:opacity-90 transition-all transform hover:scale-105 active:scale-95";
                icon.textContent = "stop_circle";
                text.textContent = "Clock Out";
                info.classList.remove('hidden');
                
                // Assuming clockInTime is GMT, just format logic for demo
                const hrs = clockInTime.getUTCHours().toString().padStart(2, '0');
                const mins = clockInTime.getUTCMinutes().toString().padStart(2, '0');
                timeSpan.textContent = `Clocked in at ${hrs}:${mins}`;

                // start timer
                if (timerInterval) clearInterval(timerInterval);
                timerInterval = setInterval(() => {
                    const now = new Date();
                    // calculate difference in ms
                    const nowMs = now.getTime() - (now.getTimezoneOffset() * 60000); // local to utc approx
                    // For UI demo, just run a dummy timer based on now time
                    const h = String(now.getHours()).padStart(2, '0');
                    const m = String(now.getMinutes()).padStart(2, '0');
                    const s = String(now.getSeconds()).padStart(2, '0');
                    timer.textContent = `${h}:${m}:${s}`;
                }, 1000);
            } else {
                btn.className = "w-32 h-32 rounded-full bg-gradient-to-br from-primary to-primary-container text-on-primary flex flex-col items-center justify-center shadow-lg hover:opacity-90 transition-all transform hover:scale-105 active:scale-95";
                icon.textContent = "play_circle";
                text.textContent = "Clock In";
                info.classList.add('hidden');
                timer.textContent = "00:00:00";
                if (timerInterval) clearInterval(timerInterval);
            }
        };

        document.getElementById('clock-btn').addEventListener('click', async () => {
            try {
                if (isClockedIn) {
                    await apiCall('/api/clock-out', 'POST');
                    isClockedIn = false;
                } else {
                    await apiCall('/api/clock-in', 'POST');
                    isClockedIn = true;
                }
                loadInternData();
            } catch (err) {
                alert(err.message);
            }
        });

        loadInternData();
    }

    if (path.includes('daily-log')) {
        const logForm = document.getElementById('log-form');
        const msgEl = document.getElementById('log-message');
        const saveDraftBtn = document.getElementById('btn-save-draft');
        let isDraft = false;

        if (saveDraftBtn) {
            saveDraftBtn.addEventListener('click', () => {
                isDraft = true;
                logForm.dispatchEvent(new Event('submit'));
            });
        }

        if (logForm) {
            // Set today's date
            document.getElementById('log-date').valueAsDate = new Date();

            logForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const payload = {
                    date: logForm.date.value,
                    hours_spent: logForm.hours_spent.value,
                    task_category: logForm.task_category.value,
                    description: logForm.description.value,
                    is_draft: isDraft
                };

                try {
                    await apiCall('/api/intern/log', 'POST', payload);
                    msgEl.textContent = 'Log saved successfully!';
                    msgEl.className = 'text-sm font-medium text-green-600';
                    msgEl.classList.remove('hidden');
                    logForm.reset();
                    document.getElementById('log-date').valueAsDate = new Date();
                    loadRecentLogs(); // Reload sidebar logs
                } catch (err) {
                    msgEl.textContent = err.message;
                    msgEl.className = 'text-sm font-medium text-red-600';
                    msgEl.classList.remove('hidden');
                }
                isDraft = false;
            });
        }

        const loadRecentLogs = async () => {
            try {
                const data = await apiCall('/api/intern/dashboard');
                const logList = document.getElementById('recent-logs-list');
                if (logList) {
                    logList.innerHTML = '';
                    data.logs.forEach(log => {
                        logList.innerHTML += `
                        <div class="bg-surface-container-lowest p-4 rounded-xl ambient-shadow">
                            <div class="flex justify-between items-start mb-2">
                                <span class="text-sm font-label font-medium text-on-surface">${new Date(log.date).toLocaleDateString()}</span>
                                <span class="${log.status === 'pending' ? 'bg-tertiary-container text-on-tertiary-container' : 'bg-surface-container text-on-surface-variant'} text-xs font-label px-2 py-1 rounded-full capitalize">${log.status}</span>
                            </div>
                            <h4 class="font-headline font-bold text-on-surface text-base mb-1">${log.task_category}</h4>
                            <p class="text-sm text-on-surface-variant font-body line-clamp-2 mb-3">${log.description}</p>
                            <div class="flex items-center text-xs text-secondary font-label">
                                <span class="material-symbols-outlined text-sm mr-1">schedule</span>
                                <span>${log.hours_spent} Hours</span>
                            </div>
                        </div>`;
                    });
                }
            } catch(e) {}
        };
        loadRecentLogs();
    }

    if (path.includes('manager-dashboard')) {
        const loadManagerData = async () => {
            try {
                const data = await apiCall('/api/manager/dashboard');

                // Total hours
                document.getElementById('total-program-hours').textContent = data.totalProgramHours;

                // Roster
                const rosterList = document.getElementById('live-roster');
                rosterList.innerHTML = '';
                data.roster.forEach(r => {
                    const initials = r.full_name.split(' ').map(n => n[0]).join('');
                    rosterList.innerHTML += `
                    <div class="flex items-center justify-between bg-surface-container-lowest p-3 rounded-xl ambient-shadow">
                        <div class="flex items-center space-x-3">
                            <div class="w-10 h-10 rounded-full bg-primary text-on-primary flex items-center justify-center font-bold text-sm">${initials}</div>
                            <div>
                                <p class="font-label text-sm font-semibold text-on-surface">${r.full_name}</p>
                                <p class="font-label text-xs text-on-surface-variant capitalize">Intern</p>
                            </div>
                        </div>
                        <span class="px-3 py-1 rounded-full text-xs font-label font-medium ${r.status === 'online' ? 'bg-tertiary-container text-on-tertiary-container' : 'bg-secondary-fixed text-on-secondary-container'} capitalize">${r.status === 'online' ? 'Clocked In' : 'Offline'}</span>
                    </div>`;
                });

                // Overview Table
                const overviewBody = document.getElementById('overview-table-body');
                overviewBody.innerHTML = '';
                data.overview.forEach(o => {
                    const initials = o.full_name.split(' ').map(n => n[0]).join('');
                    overviewBody.innerHTML += `
                    <tr class="hover:bg-surface-bright transition-colors group">
                        <td class="py-5 px-8 font-medium flex items-center space-x-3">
                            <div class="w-8 h-8 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center text-xs font-bold">${initials}</div>
                            <span>${o.full_name}</span>
                        </td>
                        <td class="py-5 px-8 text-on-surface-variant capitalize">${o.role}</td>
                        <td class="py-5 px-8 font-semibold">${o.total_hours}</td>
                        <td class="py-5 px-8">${o.days_present} days</td>
                        <td class="py-5 px-8"><span class="px-3 py-1 rounded-full text-xs font-medium bg-secondary-fixed text-on-secondary-container">Active</span></td>
                    </tr>`;
                });

                // Recent Logs
                const logList = document.getElementById('recent-logs-list');
                logList.innerHTML = '';
                data.recentLogs.forEach(log => {
                    logList.innerHTML += `
                    <div class="bg-surface-container-lowest rounded-xl p-6 ambient-shadow cursor-pointer hover:-translate-y-1 transition-transform duration-300">
                        <div class="flex justify-between items-start mb-4">
                            <div class="flex items-center space-x-2">
                                <span class="material-symbols-outlined text-outline-variant text-sm">calendar_today</span>
                                <span class="text-xs font-label text-on-surface-variant">${new Date(log.date).toLocaleDateString()}</span>
                            </div>
                            <span class="px-2 py-1 rounded-full text-[10px] font-label font-bold uppercase tracking-wide bg-tertiary-container text-on-tertiary-container capitalize">${log.status}</span>
                        </div>
                        <h4 class="font-headline font-semibold text-on-surface mb-2">${log.task_category}</h4>
                        <p class="text-sm font-label text-on-surface-variant line-clamp-2 mb-4">${log.description}</p>
                        <div class="flex items-center justify-between pt-4 border-t border-outline/15">
                            <span class="text-sm font-label font-medium text-on-surface">${log.full_name}</span>
                            <span class="text-sm font-label font-bold text-primary">${log.hours_spent} hrs</span>
                        </div>
                    </div>`;
                });

            } catch (err) {
                console.error('Error loading manager data:', err);
            }
        };

        loadManagerData();
    }
});

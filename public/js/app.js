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
            if (document.getElementById('user-name')) {
                document.getElementById('user-name').textContent = user.full_name || user.username;
            }
            if (document.getElementById('user-role')) {
                document.getElementById('user-role').textContent = user.role;
            }
            if (document.getElementById('greeting-name')) {
                document.getElementById('greeting-name').textContent = `Good morning, ${user.full_name || user.username} 👋`;
            }
            if (document.getElementById('profile-card-name')) {
                document.getElementById('profile-card-name').textContent = user.full_name || user.username;
            }
            if (document.getElementById('profile-card-role')) {
                document.getElementById('profile-card-role').textContent = user.role === 'admin' ? 'Manager' : 'Intern';
            }
            
            // Render auth buttons
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
                const totalHrs = parseFloat(data.totalHours || 0).toFixed(2);
                document.getElementById('progress-hours').textContent = totalHrs;
                const pct = (parseFloat(totalHrs) / 400) * 100;
                document.getElementById('progress-bar').style.width = `${Math.min(pct, 100)}%`;
                
                const pctEl = document.getElementById('progress-pct');
                if (pctEl) pctEl.textContent = `${pct.toFixed(2)}% complete`;

                // OT Card - just show accumulated hours, no bar or %
                const totalOtHrs = parseFloat(data.totalOtHours || 0).toFixed(2);
                const otTotalEl = document.getElementById('ot-total-hours');
                if (otTotalEl) otTotalEl.textContent = totalOtHrs;

                // Update Profile Card stats
                if (document.getElementById('profile-hours')) {
                    document.getElementById('profile-hours').textContent = totalHrs;
                }
                if (document.getElementById('profile-days')) {
                    document.getElementById('profile-days').textContent = data.attendance.filter(a => a.clock_out_time).length; 
                }
                if (document.getElementById('profile-pct')) {
                    document.getElementById('profile-pct').textContent = `${pct.toFixed(1)}%`;
                }

                // Set attendance
                const today = new Date().toISOString().slice(0, 10);
                let activeAttendance = data.attendance.find(a => !a.clock_out_time && new Date(a.date).toDateString() === new Date().toDateString());
                if (activeAttendance) {
                    isClockedIn = true;
                    // Parse clock in time accurately in local time
                    const timeParts = activeAttendance.clock_in_time.split(':');
                    clockInTime = new Date();
                    clockInTime.setHours(parseInt(timeParts[0], 10), parseInt(timeParts[1], 10), parseInt(timeParts[2], 10), 0);
                } else {
                    isClockedIn = false;
                    clockInTime = null;
                }
                const attList = document.getElementById('weekly-attendance-list');
                attList.innerHTML = '';
                
                data.attendance.forEach(att => {
                    const isToday = att.date.startsWith(today);

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
            const otContainer = document.getElementById('ot-container');
            const otTimer = document.getElementById('ot-timer');
            const dailyBarContainer = document.getElementById('daily-bar-container');
            const dailyBar = document.getElementById('daily-progress-bar');
            const dailyLabel = document.getElementById('daily-bar-label');

            if (isClockedIn) {
                btn.className = "relative z-10 w-32 h-32 rounded-full bg-gradient-to-br from-red-200 to-red-500 text-white flex flex-col items-center justify-center shadow-lg hover:opacity-90 transition-all transform hover:scale-105 active:scale-95 group-hover:-translate-y-1";
                icon.textContent = "stop_circle";
                text.textContent = "Clock Out";
                info.classList.remove('hidden');
                if (dailyBarContainer) dailyBarContainer.classList.remove('hidden');
                
                const hrs = clockInTime.getHours().toString().padStart(2, '0');
                const mins = clockInTime.getMinutes().toString().padStart(2, '0');
                timeSpan.textContent = `Clocked in at ${hrs}:${mins}`;

                if (timerInterval) clearInterval(timerInterval);
                timerInterval = setInterval(() => {
                    const now = new Date();
                    const diffMs = now.getTime() - clockInTime.getTime();
                    
                    // 17:00 limit for regular hours
                    const limit17 = new Date();
                    limit17.setHours(17, 0, 0, 0);
                    const maxRegularMs = Math.max(0, limit17.getTime() - clockInTime.getTime());
                    
                    let regularMs = diffMs;
                    let otMs = 0;
                    
                    if (now.getTime() > limit17.getTime()) {
                        regularMs = maxRegularMs;
                        otMs = now.getTime() - limit17.getTime();
                    }

                    // Avoid negative times if clock in is somehow after 17
                    if (regularMs < 0) regularMs = 0;

                    const formatMs = (ms) => {
                        const totalSecs = Math.floor(ms / 1000);
                        const h = String(Math.floor(totalSecs / 3600)).padStart(2, '0');
                        const m = String(Math.floor((totalSecs % 3600) / 60)).padStart(2, '0');
                        const s = String(totalSecs % 60).padStart(2, '0');
                        return `${h}:${m}:${s}`;
                    };

                    if (timer) timer.textContent = formatMs(regularMs);

                    if (otMs > 0 && otContainer && otTimer) {
                        otContainer.classList.remove('hidden');
                        otContainer.classList.add('flex');
                        otTimer.textContent = formatMs(otMs);
                    } else if (otContainer) {
                        otContainer.classList.add('hidden');
                        otContainer.classList.remove('flex');
                    }

                    // Daily Time Bar (09:00 - 17:00)
                    const start9 = new Date();
                    start9.setHours(9, 0, 0, 0);
                    const totalDailyMs = limit17.getTime() - start9.getTime();
                    let passedDailyMs = now.getTime() - start9.getTime();
                    if (passedDailyMs < 0) passedDailyMs = 0;
                    if (passedDailyMs > totalDailyMs) passedDailyMs = totalDailyMs;
                    
                    const dailyPct = (passedDailyMs / totalDailyMs) * 100;
                    if (dailyBar && dailyLabel) {
                        dailyBar.style.width = `${dailyPct}%`;
                        dailyLabel.textContent = `${dailyPct.toFixed(0)}%`;
                    }
                }, 1000);
            } else {
                btn.className = "relative z-10 w-32 h-32 rounded-full bg-gradient-to-br from-primary to-primary-container text-on-primary flex flex-col items-center justify-center shadow-[0_12px_24px_rgba(0,83,220,0.25)] hover:shadow-[0_16px_32px_rgba(0,83,220,0.35)] transition-all transform hover:scale-105 active:scale-95 group-hover:-translate-y-1";
                icon.textContent = "play_circle";
                text.textContent = "Clock In";
                info.classList.add('hidden');
                if (timer) timer.textContent = "00:00:00";
                if (otContainer) {
                    otContainer.classList.add('hidden');
                    otContainer.classList.remove('flex');
                }
                if (dailyBarContainer) dailyBarContainer.classList.add('hidden');
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
        const STATUS_STYLE = {
            'Plan':        'status-plan',
            'To Do':       'status-todo',
            'In Progress': 'status-inprogress',
            'Done':        'status-done',
        };

        let allLogs = [];
        let currentFilter = 'all';

        // --- Modal helpers ---
        const modal = document.getElementById('log-modal');
        const openModal = (log = null) => {
            const form = document.getElementById('log-form');
            const msgEl = document.getElementById('log-message');
            const editingId = document.getElementById('editing-log-id');
            const title = document.getElementById('modal-title');
            const submitText = document.getElementById('modal-submit-text');
            form.reset();
            msgEl.classList.add('hidden');
            if (log) {
                title.textContent = 'Edit Log';
                submitText.textContent = 'Update Log';
                editingId.value = log.id;
                document.getElementById('log-description').value = log.description || '';
                document.getElementById('log-category').value = log.task_category || 'Plan';
                document.getElementById('log-status').value = log.status || 'Plan';
                document.getElementById('log-date-start').value = log.date_start || '';
                document.getElementById('log-date-finish').value = log.date_finish || '';
            } else {
                title.textContent = 'New Log Entry';
                submitText.textContent = 'Save Log';
                editingId.value = '';
                document.getElementById('log-date-start').value = new Date().toISOString().slice(0, 10);
            }
            modal.classList.remove('opacity-0', 'pointer-events-none');
        };
        const closeModal = () => modal.classList.add('opacity-0', 'pointer-events-none');

        ['open-log-modal-btn', 'open-log-modal-btn2'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('click', () => openModal());
        });
        document.getElementById('close-modal-btn').addEventListener('click', closeModal);
        document.getElementById('cancel-modal-btn').addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

        // --- Form Submit (Create / Update) ---
        document.getElementById('log-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const msgEl = document.getElementById('log-message');
            const editingId = document.getElementById('editing-log-id').value;
            const payload = {
                date_start:    document.getElementById('log-date-start').value,
                date_finish:   document.getElementById('log-date-finish').value,
                task_category: document.getElementById('log-category').value,
                description:   document.getElementById('log-description').value,
                status:        document.getElementById('log-status').value,
            };
            try {
                if (editingId) {
                    await apiCall(`/api/intern/log/${editingId}`, 'PUT', payload);
                } else {
                    await apiCall('/api/intern/log', 'POST', payload);
                }
                closeModal();
                loadLogs();
            } catch (err) {
                msgEl.textContent = err.message;
                msgEl.className = 'text-sm font-medium text-red-600';
                msgEl.classList.remove('hidden');
            }
        });

        // --- Filter Buttons ---
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                currentFilter = btn.dataset.filter;
                document.querySelectorAll('.filter-btn').forEach(b => {
                    b.className = 'filter-btn px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600';
                });
                btn.className = 'filter-btn px-3 py-1 rounded-full text-xs font-semibold bg-primary text-white';
                renderTable();
            });
        });

        // --- Render Table ---
        const renderTable = () => {
            const body = document.getElementById('logs-table-body');
            const filtered = currentFilter === 'all' ? allLogs : allLogs.filter(l => l.status === currentFilter || l.task_category === currentFilter);
            if (filtered.length === 0) {
                body.innerHTML = `<tr><td colspan="6" class="py-12 text-center text-on-surface-variant text-sm">No logs found.</td></tr>`;
                return;
            }
            body.innerHTML = filtered.map(log => {
                const cls = STATUS_STYLE[log.status] || STATUS_STYLE['Plan'];
                const catCls = STATUS_STYLE[log.task_category] || STATUS_STYLE['Plan'];
                const dur = computeDuration(log.date_start, log.date_finish);
                return `
                <tr class="hover:bg-surface-container-low transition-colors group">
                    <td class="px-5 py-3.5 max-w-[200px]">
                        <p class="font-medium text-on-surface text-sm truncate">${log.description || '—'}</p>
                        <span class="text-[10px] px-2 py-0.5 rounded-full font-semibold ${catCls}">${log.task_category}</span>
                    </td>
                    <td class="px-5 py-3.5">
                        <span class="px-2.5 py-1 rounded-full text-xs font-semibold ${cls}">${log.status}</span>
                    </td>
                    <td class="px-5 py-3.5 text-on-surface-variant text-xs">${formatDate(log.date_start)}</td>
                    <td class="px-5 py-3.5 text-on-surface-variant text-xs">${formatDate(log.date_finish)}</td>
                    <td class="px-5 py-3.5 text-on-surface-variant text-xs">${dur}</td>
                    <td class="px-5 py-3.5 text-right">
                        <div class="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onclick="editLog(${log.id})" class="p-1.5 rounded-lg hover:bg-blue-50 text-primary transition-colors" title="Edit">
                                <span class="material-symbols-outlined text-base">edit</span>
                            </button>
                            <button onclick="deleteLog(${log.id})" class="p-1.5 rounded-lg hover:bg-red-50 text-red-500 transition-colors" title="Delete">
                                <span class="material-symbols-outlined text-base">delete</span>
                            </button>
                        </div>
                    </td>
                </tr>`;
            }).join('');
        };

        // --- Load Logs ---
        const loadLogs = async () => {
            try {
                const data = await apiCall('/api/intern/logs');
                allLogs = data.logs;
                renderTable();
            } catch(e) {}
        };

        // --- Load Attendance Panel ---
        const loadAttendance = async () => {
            try {
                const data = await apiCall('/api/intern/dashboard');
                const panel = document.getElementById('attendance-panel');
                if (!panel) return;
                if (!data.attendance || data.attendance.length === 0) {
                    panel.innerHTML = `<p class="text-center text-on-surface-variant text-sm py-8">No attendance records yet.</p>`;
                    return;
                }
                panel.innerHTML = data.attendance.map(att => {
                    const dateObj = new Date(att.date);
                    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
                    const day = days[dateObj.getDay()];
                    const isToday = att.date.startsWith(new Date().toISOString().slice(0,10));
                    const otBadge = parseFloat(att.ot_hours) > 0 ? `<span class="ml-1 text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-semibold">OT ${parseFloat(att.ot_hours).toFixed(2)}h</span>` : '';
                    return `
                    <div class="flex items-center gap-3 p-3 rounded-xl ${isToday ? 'bg-primary/5 border border-primary/20' : 'hover:bg-surface-container'} transition-colors">
                        <div class="w-10 h-10 rounded-full flex-shrink-0 ${isToday ? 'bg-primary text-white' : 'bg-surface-container-high text-on-surface-variant'} flex flex-col items-center justify-center text-center">
                            <span class="text-[10px] font-bold leading-none">${day}</span>
                            <span class="text-xs font-bold leading-none">${dateObj.getDate()}</span>
                        </div>
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-1 flex-wrap">
                                <span class="text-xs text-on-surface-variant">In: <span class="font-semibold text-on-surface">${att.clock_in_time || '--'}</span></span>
                                <span class="text-on-surface-variant">·</span>
                                <span class="text-xs text-on-surface-variant">Out: <span class="font-semibold ${!att.clock_out_time && isToday ? 'text-primary' : 'text-on-surface'}">${att.clock_out_time || (isToday ? 'Active' : '--')}</span></span>
                            </div>
                            <div class="flex items-center gap-1 mt-0.5">
                                ${att.total_hours ? `<span class="text-[11px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-full font-semibold">${parseFloat(att.total_hours).toFixed(2)}h</span>` : ''}
                                ${otBadge}
                            </div>
                        </div>
                    </div>`;
                }).join('');
            } catch(e) {}
        };

        // --- Global helpers for inline buttons ---
        window.editLog = (id) => {
            const log = allLogs.find(l => l.id === id);
            if (log) openModal(log);
        };
        window.deleteLog = async (id) => {
            if (!confirm('Delete this log entry?')) return;
            try {
                await apiCall(`/api/intern/log/${id}`, 'DELETE');
                loadLogs();
            } catch(e) { alert(e.message); }
        };

        // --- Util: format date ---
        const formatDate = (d) => {
            if (!d) return '—';
            try { return new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }); }
            catch(e) { return d; }
        };

        // --- Util: compute duration ---
        const computeDuration = (start, finish) => {
            if (!start || !finish) return '—';
            const s = new Date(start), f = new Date(finish);
            const diffDays = Math.round((f - s) / (1000*60*60*24));
            if (diffDays < 0) return '—';
            if (diffDays === 0) return '1 day';
            return `${diffDays + 1} days`;
        };

        loadLogs();
        loadAttendance();
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

    if (path.includes('attendance')) {
        let currentDate = new Date();
        let allAttendance = [];
        let allLogs = [];

        const loadCalendarData = async () => {
            try {
                const data = await apiCall('/api/intern/calendar');
                allAttendance = data.attendance;
                allLogs = data.logs;
                renderCalendar();
            } catch (err) {
                console.error('Error loading calendar data:', err);
            }
        };

        const renderCalendar = () => {
            const year = currentDate.getFullYear();
            const month = currentDate.getMonth();
            const headerEl = document.getElementById('calendar-month-year');
            if(headerEl) headerEl.textContent = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(currentDate);

            const grid = document.getElementById('calendar-grid');
            if(!grid) return;
            grid.innerHTML = '';

            const firstDay = new Date(year, month, 1).getDay();
            const daysInMonth = new Date(year, month + 1, 0).getDate();

            // Fill empty cells before start of month
            for (let i = 0; i < firstDay; i++) {
                grid.innerHTML += `<div class="calendar-cell bg-surface-container-low opacity-50"></div>`;
            }

            // Fill days
            for (let day = 1; day <= daysInMonth; day++) {
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                
                // Find attendance for this date
                const att = allAttendance.find(a => a.date.startsWith(dateStr));
                let attHtml = '';
                if (att) {
                    attHtml = `
                    <div class="text-[10px] text-primary font-semibold mb-1 flex justify-between bg-primary-container/10 px-1 py-0.5 rounded">
                        <span>In: ${att.clock_in_time || '--'}</span>
                        <span>Out: ${att.clock_out_time || '--'}</span>
                    </div>`;
                }

                // Find logs for this date
                const dayLogs = allLogs.filter(l => l.date.startsWith(dateStr));
                let logsHtml = '';
                dayLogs.forEach(l => {
                    const safeLog = encodeURIComponent(JSON.stringify(l));
                    logsHtml += `
                    <div class="log-item bg-surface-container text-[10px] text-on-surface-variant p-1 rounded mb-1 border border-outline-variant/30 hover:border-primary transition-colors" onclick="openLogModal('${safeLog}')">
                        <span class="font-bold block text-on-surface">${l.task_category}</span>
                        ${l.description}
                    </div>`;
                });

                grid.innerHTML += `
                <div class="calendar-cell relative">
                    <span class="absolute top-1 right-2 text-xs font-bold text-outline-variant">${day}</span>
                    <div class="mt-4 flex-1">
                        ${attHtml}
                        <div class="space-y-1 mt-1">${logsHtml}</div>
                    </div>
                </div>`;
            }
        };

        window.openLogModal = (logStr) => {
            try {
                const log = JSON.parse(decodeURIComponent(logStr));
                document.getElementById('modal-date').textContent = new Date(log.date).toLocaleDateString();
                document.getElementById('modal-status').textContent = log.status;
                document.getElementById('modal-category').textContent = log.task_category;
                document.getElementById('modal-desc').textContent = log.description;
                document.getElementById('modal-hours').textContent = log.hours_spent;
                
                const modal = document.getElementById('log-modal');
                modal.classList.remove('hidden');
                setTimeout(() => {
                    modal.children[0].classList.remove('scale-95');
                    modal.children[0].classList.add('scale-100');
                }, 10);
            } catch(e) {}
        };

        const closeBtn = document.getElementById('close-modal-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                const modal = document.getElementById('log-modal');
                modal.children[0].classList.remove('scale-100');
                modal.children[0].classList.add('scale-95');
                setTimeout(() => modal.classList.add('hidden'), 150);
            });
        }

        const prevBtn = document.getElementById('prev-month');
        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                currentDate.setMonth(currentDate.getMonth() - 1);
                renderCalendar();
            });
        }

        const nextBtn = document.getElementById('next-month');
        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                currentDate.setMonth(currentDate.getMonth() + 1);
                renderCalendar();
            });
        }

        loadCalendarData();
    }
});

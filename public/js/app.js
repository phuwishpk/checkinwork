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
                const hour = new Date().getHours();
                const greeting = (hour >= 5 && hour < 12) ? 'Good morning' : 'Good evening';
                document.getElementById('greeting-name').textContent = `${greeting}, ${user.full_name || user.username} 👋`;
            }
            if (document.getElementById('profile-card-name')) {
                document.getElementById('profile-card-name').textContent = user.full_name || user.username;
            }
            if (document.getElementById('profile-card-role')) {
                document.getElementById('profile-card-role').textContent = user.role === 'admin' ? 'Management' : 'Intern Workspace';
            }
            if (document.getElementById('profile-card-image')) {
                const name = user.full_name || user.username;
                document.getElementById('profile-card-image').src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0053dc&color=fff&size=128&bold=true`;
            }
            if (document.getElementById('profile-card-email')) {
                document.getElementById('profile-card-email').textContent = `${user.username}@checkinwork.app`;
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

                const hoursLeftEl = document.getElementById('hours-left');
                if (hoursLeftEl) {
                    const remaining = 400 - parseFloat(totalHrs);
                    hoursLeftEl.textContent = Math.max(0, remaining).toFixed(1);
                }

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
                const otHistoryList = document.getElementById('ot-history-list');
                attList.innerHTML = '';
                if (otHistoryList) otHistoryList.innerHTML = '';
                
                data.attendance.forEach(att => {
                    const isToday = att.date.startsWith(today);
                    const dateObj = new Date(att.date);
                    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                    const dayName = days[dateObj.getDay()];
                    
                    const otHours = parseFloat(att.ot_hours || 0);
                    const normalHours = parseFloat(att.total_hours || 0);

                    // Standard Attendance Entry
                    attList.innerHTML += `
                    <div class="group flex items-center justify-between p-4 ${isToday ? 'bg-primary/5 border-primary/20' : 'bg-white border-outline-variant/5'} rounded-2xl border hover:shadow-sm transition-all duration-300">
                        <div class="flex items-center gap-4 w-1/3">
                            <div class="w-10 h-10 rounded-xl ${isToday ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-surface-container-low text-on-surface-variant'} flex flex-col items-center justify-center transition-transform group-hover:scale-105">
                                <span class="text-[8px] uppercase font-black leading-none mb-0.5">${dayName}</span>
                                <span class="text-base font-black leading-none">${dateObj.getDate()}</span>
                            </div>
                            <div>
                                <p class="font-bold text-xs ${isToday ? 'text-primary' : 'text-on-surface'}">${isToday ? 'Today' : dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                                <div class="flex items-center gap-1.5 mt-0.5">
                                    <span class="w-1 h-1 rounded-full ${!att.clock_out_time && isToday ? 'bg-green-500 animate-pulse' : 'bg-outline-variant'}"></span>
                                    <span class="text-[9px] font-bold text-on-surface-variant/60 uppercase tracking-widest">${!att.clock_out_time && isToday ? 'Active' : 'Ended'}</span>
                                </div>
                            </div>
                        </div>
                        
                        <div class="flex-1 flex items-center justify-around px-2">
                            <div class="text-center">
                                <p class="text-[8px] font-bold text-on-surface-variant/40 uppercase tracking-widest mb-0.5">In</p>
                                <p class="text-xs font-black text-on-surface">${att.clock_in_time || '--:--'}</p>
                            </div>
                            <div class="h-6 w-px bg-outline-variant/10"></div>
                            <div class="text-center">
                                <p class="text-[8px] font-bold text-on-surface-variant/40 uppercase tracking-widest mb-0.5">Out</p>
                                <p class="text-xs font-black ${!att.clock_out_time && isToday ? 'text-primary animate-pulse' : 'text-on-surface'}">${att.clock_out_time || (isToday ? 'Active' : '--:--')}</p>
                            </div>
                        </div>

                        <div class="w-1/4 flex flex-col items-end gap-1.5">
                            <div class="flex items-center gap-1.5">
                                ${normalHours > 0 ? `
                                    <div class="px-2 py-0.5 bg-primary/10 text-primary rounded-lg flex items-center gap-1 border border-primary/5">
                                        <span class="material-symbols-outlined text-[12px] font-bold">timer</span>
                                        <span class="text-[10px] font-black">${normalHours.toFixed(1)}h</span>
                                    </div>
                                ` : ''}
                                ${otHours > 0 ? `
<<<<<<< HEAD
                                    <div class="px-2 py-0.5 bg-orange-500 text-white rounded-lg flex items-center gap-1 shadow-sm shadow-orange-200">
=======
                                    <div class="px-2 py-0.5 bg-orange-50 text-orange-600 rounded-lg flex items-center gap-1 border border-orange-100">
>>>>>>> 5e44387685ffbbf195ad9bc48dda440d127a4f91
                                        <span class="material-symbols-outlined text-[12px] font-bold">bolt</span>
                                        <span class="text-[10px] font-black">${otHours.toFixed(1)}h</span>
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                    </div>`;

                    // If has OT, add to OT history list
                    if (otHours > 0 && otHistoryList) {
                        otHistoryList.innerHTML += `
<<<<<<< HEAD
                        <div class="flex items-center justify-between p-3.5 bg-orange-50/30 rounded-2xl border border-orange-100/50 hover:bg-orange-50 transition-all duration-300 group">
                            <div class="flex items-center gap-3">
                                <div class="w-9 h-9 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center transition-transform group-hover:rotate-6">
                                    <span class="material-symbols-outlined text-[18px] font-bold">bolt</span>
                                </div>
                                <div>
                                    <p class="text-xs font-black text-on-surface">${dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                                    <p class="text-[9px] text-orange-700/60 font-bold uppercase tracking-wider">After-hours Work</p>
                                </div>
                            </div>
                            <div class="text-right">
                                <p class="text-sm font-black text-orange-600">+${otHours.toFixed(1)}<span class="text-[10px] ml-0.5">h</span></p>
                                <div class="flex items-center gap-1 justify-end mt-0.5">
                                    <span class="w-1 h-1 rounded-full bg-orange-400"></span>
                                    <span class="text-[8px] text-on-surface-variant/40 font-black uppercase tracking-widest">Recorded</span>
                                </div>
=======
                        <div class="flex items-center justify-between p-3.5 bg-orange-50/30 rounded-2xl border border-orange-100/50 hover:bg-orange-50 transition-colors duration-300">
                            <div class="flex items-center gap-4">
                                <div class="w-9 h-9 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center shadow-sm">
                                    <span class="material-symbols-outlined text-sm">bolt</span>
                                </div>
                                <div>
                                    <p class="text-[11px] font-black text-on-surface">${dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                                    <p class="text-[9px] text-orange-700/60 font-bold uppercase tracking-wider">After-hours session</p>
                                </div>
                            </div>
                            <div class="text-right">
                                <p class="text-xs font-black text-orange-600 tracking-tight">+${otHours.toFixed(2)}h</p>
>>>>>>> 5e44387685ffbbf195ad9bc48dda440d127a4f91
                            </div>
                        </div>`;
                    }
                });
                
                if (otHistoryList && otHistoryList.innerHTML === '') {
                    otHistoryList.innerHTML = `
                    <div class="flex flex-col items-center justify-center py-10 px-4 bg-surface-container-low/30 rounded-[2rem] border border-dashed border-outline-variant/20">
                        <div class="w-12 h-12 rounded-2xl bg-surface-container flex items-center justify-center text-on-surface-variant/20 mb-3">
                            <span class="material-symbols-outlined text-2xl">bedtime</span>
                        </div>
                        <p class="text-[10px] text-on-surface-variant/40 font-black uppercase tracking-widest">No extra hours recorded</p>
                    </div>`;
                }

                // Set recent logs
                const logList = document.getElementById('recent-logs-list');
                if (logList) {
                    logList.innerHTML = '';
                    const STATUS_STYLE = {
                        'Plan':        'bg-blue-50 text-blue-700',
                        'To Do':       'bg-yellow-50 text-yellow-700',
                        'In Progress': 'bg-sky-50 text-sky-700',
                        'Done':        'bg-green-50 text-green-700',
                    };
                    
                    data.logs.slice(0, 3).forEach(log => {
                        const statusCls = STATUS_STYLE[log.status] || 'bg-slate-50 text-slate-700';
                        const catCls = STATUS_STYLE[log.task_category] || 'bg-slate-50 text-slate-700';
                        logList.innerHTML += `
                        <div class="p-5 bg-white rounded-3xl border border-outline-variant/10 hover:shadow-md transition-all duration-300 group">
                            <div class="flex justify-between items-start mb-3">
                                <span class="text-[9px] px-2.5 py-1 rounded-lg font-black uppercase tracking-wider ${catCls}">${log.task_category}</span>
                                <span class="text-[10px] text-on-surface-variant/40 font-bold uppercase tracking-widest">${new Date(log.date_start || log.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                            </div>
                            <p class="text-xs text-on-surface font-bold leading-relaxed line-clamp-2 mb-4 group-hover:text-primary transition-colors">${log.description}</p>
                            <div class="flex justify-between items-center pt-3 border-t border-outline-variant/5">
                                <span class="text-[9px] px-2.5 py-1 rounded-lg font-black uppercase tracking-wider ${statusCls}">${log.status}</span>
                                <span class="text-[9px] text-on-surface-variant/40 font-bold uppercase tracking-widest">${log.date_finish ? 'Ends: ' + new Date(log.date_finish).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}</span>
                            </div>
                        </div>`;
                    });
                }

                updateClockUI();

            } catch (err) {
                console.error('Error loading intern data:', err);
            }
        };

        const updateClockUI = () => {
            const btn = document.getElementById('clock-btn');
            const icon = document.getElementById('clock-icon');
            const text = document.getElementById('clock-text');
            const subtext = document.getElementById('clock-subtext');
            const timer = document.getElementById('session-timer');
            const info = document.getElementById('clock-in-info');
            const timeSpan = document.getElementById('clock-in-time');
            const otContainer = document.getElementById('ot-container');
            const otTimer = document.getElementById('ot-timer');
            const statusDot = document.getElementById('status-dot');
            const statusText = document.getElementById('status-text');
            const dateEl = document.getElementById('current-date');
            const dayEl = document.getElementById('current-day');

            if (dateEl && dayEl) {
                const now = new Date();
                dateEl.textContent = now.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
                dayEl.textContent = now.toLocaleDateString('en-US', { weekday: 'long' });
            }

            if (!btn || !timer) return;

            if (isClockedIn) {
                btn.className = "w-full flex items-center justify-center gap-3 py-4 rounded-2xl bg-red-500 text-white shadow-xl shadow-red-200 hover:scale-[1.02] active:scale-[0.98] transition-all group/btn overflow-hidden relative";
                icon.textContent = "stop";
                text.textContent = "Clock Out";
                info?.classList.remove('hidden');
                
                if (statusDot) statusDot.className = "w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse";
                if (statusText) statusText.textContent = "Currently Active";
                
                const hrs = clockInTime.getHours().toString().padStart(2, '0');
                const mins = clockInTime.getMinutes().toString().padStart(2, '0');
                if (timeSpan) timeSpan.textContent = `${hrs}:${mins}`;

                if (timerInterval) clearInterval(timerInterval);
                timerInterval = setInterval(() => {
                    const now = new Date();
                    const diffMs = now.getTime() - clockInTime.getTime();
                    
                    const limit17 = new Date();
                    limit17.setHours(17, 0, 0, 0);

                    timer.textContent = formatMs(diffMs);

                    if (now > limit17) {
                        otContainer?.classList.remove('hidden');
                        const otMs = now.getTime() - Math.max(clockInTime.getTime(), limit17.getTime());
                        if (otTimer) otTimer.textContent = formatMs(otMs);
                    } else {
                        otContainer?.classList.add('hidden');
                    }
                }, 1000);
            } else {
                btn.className = "w-full flex items-center justify-center gap-3 py-4 rounded-2xl bg-primary text-white shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all group/btn overflow-hidden relative";
                icon.textContent = "play_arrow";
                text.textContent = "Clock In";
                info?.classList.add('hidden');
                otContainer?.classList.add('hidden');
                timer.textContent = "00:00:00";
                
                if (statusDot) statusDot.className = "w-1.5 h-1.5 rounded-full bg-outline-variant";
                if (statusText) statusText.textContent = "Not Clocked In";
                
                if (timerInterval) clearInterval(timerInterval);
            }
        };

        const formatMs = (ms) => {
            if (ms < 0) ms = 0;
            const s = Math.floor(ms / 1000);
            const hrs = Math.floor(s / 3600).toString().padStart(2, '0');
            const mins = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
            const secs = (s % 60).toString().padStart(2, '0');
            return `${hrs}:${mins}:${secs}`;
        };

        const clockBtn = document.getElementById('clock-btn');
        if (clockBtn) {
            clockBtn.addEventListener('click', async () => {
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
        }

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
                color:         document.getElementById('log-color')?.value || '#3e76fe',
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

        // --- Modal helpers ---
        const modal = document.getElementById('log-modal');
        let openModal = (log = null) => {
            const form = document.getElementById('log-form');
            const msgEl = document.getElementById('log-message');
            const editingId = document.getElementById('editing-log-id');
            const title = document.getElementById('modal-title');
            const deleteBtn = document.getElementById('delete-log-btn');
            form.reset();
            msgEl.classList.add('hidden');
            if (log) {
                title.textContent = 'Edit Task';
                editingId.value = log.id;
                document.getElementById('log-description').value = log.description || '';
                document.getElementById('log-category').value = log.task_category || 'Plan';
                document.getElementById('log-color').value = log.color || '#3e76fe';
                document.getElementById('log-date-start').value = log.date_start || '';
                document.getElementById('log-date-finish').value = log.date_finish || '';
                deleteBtn.classList.remove('opacity-0', 'pointer-events-none');
            } else {
                title.textContent = 'New Task';
                editingId.value = '';
                document.getElementById('log-date-start').value = new Date().toISOString().slice(0, 10);
                document.getElementById('log-color').value = '#3e76fe';
                deleteBtn.classList.add('opacity-0', 'pointer-events-none');
            }
            modal.classList.remove('opacity-0', 'pointer-events-none');
        };
        if (modal) {
            const closeModal = () => modal.classList.add('opacity-0', 'pointer-events-none');

            ['open-new-task-btn', 'open-new-task-btn2'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.addEventListener('click', () => openModal());
            });
            
            const closeBtn = document.getElementById('close-modal-btn');
            if (closeBtn) closeBtn.addEventListener('click', closeModal);
            
            const cancelBtn = document.getElementById('cancel-modal-btn');
            if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
            
            modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
        }

        const logForm = document.getElementById('log-form');
        if (logForm) {
            logForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const editingId = document.getElementById('editing-log-id').value;
                const payload = {
                    date_start:    document.getElementById('log-date-start').value,
                    date_finish:   document.getElementById('log-date-finish').value,
                    task_category: document.getElementById('log-category').value,
                    description:   document.getElementById('log-description').value,
                    color:         document.getElementById('log-color').value,
                    status:        'Plan' // Default status
                };
                try {
                    if (editingId) await apiCall(`/api/intern/log/${editingId}`, 'PUT', payload);
                    else await apiCall('/api/intern/log', 'POST', payload);
                    if (typeof closeModal === 'function') closeModal();
                    loadCalendarData();
                } catch (err) { alert(err.message); }
            });
        }

        const deleteLogBtn = document.getElementById('delete-log-btn');
        if (deleteLogBtn) {
            deleteLogBtn.addEventListener('click', async () => {
                const id = document.getElementById('editing-log-id').value;
                if (id && confirm('Delete this task?')) {
                    try {
                        await apiCall(`/api/intern/log/${id}`, 'DELETE');
                        if (typeof closeModal === 'function') closeModal();
                        loadCalendarData();
                    } catch(e) { alert(e.message); }
                }
            });
        }

        let isDragging = false;
        let dragStart = null;
        let dragEnd = null;
        let viewFilter = 'all';
        let selectedUserId = 'all';
        let allUsers = [];
        const colors = ['#0053dc', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f43f5e'];

        // Intern Filter
        const internFilter = document.getElementById('intern-filter');
        if (internFilter) {
            internFilter.addEventListener('change', (e) => {
                selectedUserId = e.target.value;
                renderCalendar();
            });
        }

        // Filter Buttons
        document.querySelectorAll('.view-filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                viewFilter = btn.dataset.viewFilter;
                document.querySelectorAll('.view-filter-btn').forEach(b => {
                    b.classList.remove('bg-white', 'shadow-sm', 'text-primary');
                    b.classList.add('text-on-surface-variant', 'hover:bg-white/50');
                });
                btn.classList.add('bg-white', 'shadow-sm', 'text-primary');
                btn.classList.remove('text-on-surface-variant', 'hover:bg-white/50');
                renderCalendar();
            });
        });

        const loadCalendarData = async () => {
            try {
                const data = await apiCall('/api/intern/calendar');
                allAttendance = data.attendance;
                allLogs = data.logs;
                allUsers = data.users;

                if (internFilter) {
                    const currentVal = internFilter.value;
                    internFilter.innerHTML = '<option value="all">All Interns</option>';
                    allUsers.forEach((u, i) => {
                        internFilter.innerHTML += `<option value="${u.id}">${u.full_name}</option>`;
                    });
                    internFilter.value = currentVal;
                }

                renderCalendar();
            } catch (err) { console.error(err); }
        };

        const renderCalendar = () => {
            const year = currentDate.getFullYear();
            const month = currentDate.getMonth();
            const grid = document.getElementById('calendar-grid');
            const header = document.getElementById('calendar-month-year');
            if(!grid) return;
            header.textContent = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(currentDate);
            grid.innerHTML = '';

            const firstDay = new Date(year, month, 1).getDay();
            const daysInMonth = new Date(year, month + 1, 0).getDate();

            for (let i = 0; i < firstDay; i++) grid.innerHTML += `<div class="calendar-cell bg-surface-container-low opacity-50"></div>`;

            const filteredUsers = selectedUserId === 'all' ? allUsers : allUsers.filter(u => u.id == selectedUserId);

            for (let day = 1; day <= daysInMonth; day++) {
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                let contentHtml = '';

                filteredUsers.forEach((u, idx) => {
                    const userColor = colors[idx % colors.length];
                    const uAtts = allAttendance.filter(a => a.user_id === u.id && a.date.startsWith(dateStr));
                    const uLogs = allLogs.filter(l => l.user_id === u.id && dateStr >= l.date_start && dateStr <= (l.date_finish || l.date_start));

                    // Calculate slots for this user logs to avoid overlap
                    if (day === 1) {
                        const userAllLogs = allLogs.filter(l => l.user_id === u.id);
                        userAllLogs.forEach(l => delete l.slot);
                        const slots = [];
                        userAllLogs.forEach(log => {
                            let assigned = false;
                            for (let i = 0; i < slots.length; i++) {
                                const hasOverlap = slots[i].some(s => {
                                    return (log.date_start <= (s.date_finish || s.date_start) && (log.date_finish || log.date_start) >= s.date_start);
                                });
                                if (!hasOverlap) {
                                    slots[i].push(log);
                                    log.slot = i;
                                    assigned = true;
                                    break;
                                }
                            }
                            if (!assigned) {
                                log.slot = slots.length;
                                slots.push([log]);
                            }
                        });
                    }

                    if ((viewFilter === 'all' || viewFilter === 'tasks' || viewFilter === 'time') && (uAtts.length > 0 || uLogs.length > 0)) {
                        let logsMarkup = '';
                        if (viewFilter !== 'time' && uLogs.length > 0) {
                            const maxSlot = Math.max(...uLogs.map(l => l.slot));
                            for (let s = 0; s <= maxSlot; s++) {
                                const l = uLogs.find(log => log.slot === s);
                                if (l) {
                                    const isStart = dateStr === l.date_start;
                                    const isEnd = dateStr === (l.date_finish || l.date_start);
                                    const isOwn = l.user_id === user.id;
                                    const safeLog = encodeURIComponent(JSON.stringify(l));
                                    let spanClass = '';
                                    if (isStart && !isEnd) spanClass = 'span-start';
                                    else if (!isStart && !isEnd) spanClass = 'span-mid';
                                    else if (!isStart && isEnd) spanClass = 'span-end';

                                    logsMarkup += `
                                        <div class="log-bar ${spanClass}" style="background-color: ${l.color || userColor}; height: 16px; font-size: 8px; margin-bottom: 1px;" 
                                             ${isOwn ? `onclick="event.stopPropagation(); editLog('${safeLog}')"` : ''}>
                                            ${isStart ? `<span class="truncate">${l.task_category}</span>` : '&nbsp;'}
                                        </div>`;
                                } else {
                                    logsMarkup += `<div class="h-[16px] mb-[1px]"></div>`;
                                }
                            }
                        }

                        let attMarkup = '';
                        if (viewFilter !== 'tasks' && uAtts.length > 0) {
                            attMarkup = uAtts.map(a => `
                                <div class="flex items-center gap-0.5 text-[8px] font-bold" style="color: ${userColor}">
                                    <span class="material-symbols-outlined text-[9px]">login</span> ${a.clock_in_time?.slice(0,5)}
                                </div>
                            `).join('');
                        }

                        if (logsMarkup || attMarkup) {
                            contentHtml += `
                                <div class="mb-2 p-1 rounded border-l-2" style="border-left-color: ${userColor}; background: ${userColor}08">
                                    <div class="flex items-center justify-between mb-0.5">
                                        <span class="text-[7px] font-black uppercase" style="color: ${userColor}">${u.full_name}</span>
                                    </div>
                                    ${logsMarkup}
                                    ${attMarkup}
                                </div>`;
                        }
                    }
                });

                const cell = document.createElement('div');
                cell.className = 'calendar-cell custom-scrollbar overflow-y-auto';
                cell.dataset.date = dateStr;
                cell.innerHTML = `
                    <span class="text-[10px] font-bold text-on-surface-variant/30 mb-1">${day}</span>
                    <div class="flex-1">
                        ${contentHtml}
                    </div>
                `;

                // Drag selection only for current user
                cell.addEventListener('mousedown', () => {
                    isDragging = true;
                    dragStart = dateStr;
                    dragEnd = dateStr;
                    updateSelectionUI();
                });

                cell.addEventListener('mouseenter', () => {
                    if (isDragging) {
                        dragEnd = dateStr;
                        updateSelectionUI();
                    }
                });

                grid.appendChild(cell);
            }
            renderSummaryTable();
        };

        const renderSummaryTable = () => {
            const tableBody = document.getElementById('summary-table-body');
            const summaryMonth = document.getElementById('summary-month-name');
            const header = document.getElementById('calendar-month-year');
            if (!tableBody) return;

            if (summaryMonth && header) summaryMonth.textContent = header.textContent;
            tableBody.innerHTML = '';

            const year = currentDate.getFullYear();
            const month = currentDate.getMonth();
            const daysInMonth = new Date(year, month + 1, 0).getDate();

            const filteredUsers = selectedUserId === 'all' ? allUsers : allUsers.filter(u => u.id == selectedUserId);

            for (let day = 1; day <= daysInMonth; day++) {
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                
                filteredUsers.forEach((u, idx) => {
                    const userColor = colors[idx % colors.length];
                    const dayAtts = allAttendance.filter(a => a.user_id === u.id && a.date.startsWith(dateStr));
                    const dayLogs = allLogs.filter(l => l.user_id === u.id && dateStr >= l.date_start && dateStr <= (l.date_finish || l.date_start));

                    if (dayAtts.length === 0 && dayLogs.length === 0) return;

                    const dateDisplay = new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
                    const clockIn = dayAtts.map(a => a.clock_in_time?.slice(0,5)).join(', ') || '--';
                    const clockOut = dayAtts.map(a => a.clock_out_time?.slice(0,5)).join(', ') || '--';
                    const totalHrs = dayAtts.reduce((acc, a) => acc + parseFloat(a.total_hours || 0), 0).toFixed(2);
                    const tasks = dayLogs.map(l => `<span class="inline-block px-2 py-0.5 rounded text-[9px] font-bold text-white mr-1 mb-1" style="background-color: ${l.color || userColor}">${l.task_category}</span>`).join('');

                    tableBody.innerHTML += `
                        <tr class="hover:bg-surface-container-low transition-colors">
                            <td class="px-6 py-3 font-bold text-on-surface text-xs">
                                <div>${dateDisplay}</div>
                                <div class="text-[8px] font-black uppercase" style="color: ${userColor}">${u.full_name}</div>
                            </td>
                            <td class="px-6 py-3 text-on-surface-variant font-medium text-xs">${clockIn}</td>
                            <td class="px-6 py-3 text-on-surface-variant font-medium text-xs">${clockOut}</td>
                            <td class="px-6 py-3 font-black text-primary text-xs">${totalHrs}h</td>
                            <td class="px-6 py-3">${tasks}</td>
                        </tr>
                    `;
                });
            }

            if (tableBody.innerHTML === '') {
                tableBody.innerHTML = `<tr><td colspan="5" class="px-6 py-10 text-center text-on-surface-variant/40 italic">No records for this month</td></tr>`;
            }
        };

        const updateSelectionUI = () => {
            const cells = document.querySelectorAll('.calendar-cell[data-date]');
            const start = dragStart < dragEnd ? dragStart : dragEnd;
            const end = dragStart < dragEnd ? dragEnd : dragStart;

            cells.forEach(cell => {
                const date = cell.dataset.date;
                if (date >= start && date <= end) {
                    cell.classList.add('bg-primary/10', 'border-primary/30');
                } else {
                    cell.classList.remove('bg-primary/10', 'border-primary/30');
                }
            });
        };

        window.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                const start = dragStart < dragEnd ? dragStart : dragEnd;
                const end = dragStart < dragEnd ? dragEnd : dragStart;
                
                openModal(null, start, end);
                
                // Clear UI highlight
                document.querySelectorAll('.calendar-cell[data-date]').forEach(c => c.classList.remove('bg-primary/10', 'border-primary/30'));
            }
        });

        const originalOpenModal = openModal;
        openModal = (log = null, start = null, end = null) => {
            originalOpenModal(log);
            if (!log && start && end) {
                document.getElementById('log-date-start').value = start;
                document.getElementById('log-date-finish').value = end;
            }
        };

        window.editLog = (logStr) => {
            try { openModal(JSON.parse(decodeURIComponent(logStr))); } catch(e) {}
        };

        const prevBtn = document.getElementById('prev-month');
        const nextBtn = document.getElementById('next-month');
        if (prevBtn) prevBtn.addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() - 1); renderCalendar(); });
        if (nextBtn) nextBtn.addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() + 1); renderCalendar(); });

        loadCalendarData();
    }

    if (path.includes('manager-attendance.html')) {
        let currentDate = new Date();
        let allData = { users: [], attendance: [], logs: [] };
        const colors = ['#0053dc', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f43f5e'];

        const loadManagerCalendar = async () => {
            try {
                allData = await apiCall('/api/manager/calendar-data');
                
                // Populate filter
                const filter = document.getElementById('intern-filter');
                const currentVal = filter.value;
                filter.innerHTML = '<option value="all">All Interns</option>';
                allData.users.forEach((u, i) => {
                    const color = colors[i % colors.length];
                    filter.innerHTML += `<option value="${u.id}" data-color="${color}">${u.full_name}</option>`;
                });
                filter.value = currentVal;
                
                renderManagerCalendar();
            } catch (err) { console.error(err); }
        };

        const renderManagerCalendar = () => {
            const grid = document.getElementById('calendar-grid');
            const header = document.getElementById('calendar-month-year');
            if(!grid) return;

            const year = currentDate.getFullYear();
            const month = currentDate.getMonth();
            header.textContent = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(currentDate);
            grid.innerHTML = '';

            const firstDay = new Date(year, month, 1).getDay();
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const selectedUserId = document.getElementById('intern-filter').value;
            const viewMode = document.getElementById('view-mode').value;
            const showTasks = viewMode === 'all' || viewMode === 'tasks';
            const showAtts = viewMode === 'all' || viewMode === 'attendance';

            for (let i = 0; i < firstDay; i++) grid.innerHTML += `<div class="calendar-cell bg-surface-container-low opacity-50"></div>`;

            for (let day = 1; day <= daysInMonth; day++) {
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const cell = document.createElement('div');
                cell.className = 'calendar-cell';
                
                let contentHtml = '';
                
                if (selectedUserId === 'all') {
                    // Grouped view by user
                    allData.users.forEach((u, idx) => {
                        const userColor = colors[idx % colors.length];
                        const uAtts = showAtts ? allData.attendance.filter(a => a.user_id === u.id && a.date.startsWith(dateStr)) : [];
                        const uLogs = showTasks ? allData.logs.filter(l => l.user_id === u.id && dateStr >= l.date_start && dateStr <= (l.date_finish || l.date_start)) : [];
                        
                        // Calculate slots for this user if it's the first day of the view
                        if (day === 1) {
                            const userAllLogs = allData.logs.filter(l => l.user_id === u.id);
                            userAllLogs.forEach(l => delete l.slot);
                            const userSlots = [];
                            userAllLogs.forEach(log => {
                                let assigned = false;
                                for (let i = 0; i < userSlots.length; i++) {
                                    const hasOverlap = userSlots[i].some(s => {
                                        return (log.date_start <= (s.date_finish || s.date_start) && (log.date_finish || log.date_start) >= s.date_start);
                                    });
                                    if (!hasOverlap) {
                                        userSlots[i].push(log);
                                        log.slot = i;
                                        assigned = true;
                                        break;
                                    }
                                }
                                if (!assigned) {
                                    log.slot = userSlots.length;
                                    userSlots.push([log]);
                                }
                            });
                        }

                        if (uAtts.length > 0 || uLogs.length > 0) {
                            let logsMarkup = '';
                            if (uLogs.length > 0) {
                                const maxSlot = Math.max(...uLogs.map(l => l.slot));
                                for (let s = 0; s <= maxSlot; s++) {
                                    const l = uLogs.find(log => log.slot === s);
                                    if (l) {
                                        const isStart = dateStr === l.date_start;
                                        const isEnd = dateStr === (l.date_finish || l.date_start);
                                        let spanClass = '';
                                        if (isStart && !isEnd) spanClass = 'span-start';
                                        else if (!isStart && !isEnd) spanClass = 'span-mid';
                                        else if (!isStart && isEnd) spanClass = 'span-end';

                                        logsMarkup += `
                                            <div class="text-[8px] px-1 mb-0.5 rounded truncate text-white font-bold ${spanClass}" style="background-color: ${l.color || userColor}">
                                                ${isStart ? l.task_category : '&nbsp;'}
                                            </div>`;
                                    } else {
                                        logsMarkup += `<div class="h-[12px] mb-0.5"></div>`;
                                    }
                                }
                            }

                            contentHtml += `
                                <div class="user-box bg-white shadow-sm border border-outline-variant/10 mb-2" style="border-left-color: ${userColor}">
                                    <div class="flex items-center justify-between mb-1">
                                        <span class="text-[8px] font-black uppercase" style="color: ${userColor}">${u.full_name}</span>
                                        ${uAtts.length > 0 ? `<span class="text-[7px] bg-slate-100 px-1 rounded">${uAtts.length} sess</span>` : ''}
                                    </div>
                                    <div class="space-y-0.5">
                                        ${logsMarkup}
                                        ${uAtts.map(a => `
                                            <div class="text-[7px] text-slate-500 font-medium flex items-center gap-0.5">
                                                <span class="material-symbols-outlined text-[8px]">login</span>${a.clock_in_time?.slice(0,5)}
                                                ${a.clock_out_time ? `<span class="material-symbols-outlined text-[8px]">logout</span>${a.clock_out_time.slice(0,5)}` : ''}
                                            </div>
                                        `).join('')}
                                    </div>
                                </div>`;
                        }
                    });
                } else {
                    // Single intern view (Detailed)
                    const uid = parseInt(selectedUserId);
                    const userIdx = allData.users.findIndex(u => u.id === uid);
                    const userColor = colors[userIdx % colors.length];
                    const uAtts = showAtts ? allData.attendance.filter(a => a.user_id === uid && a.date.startsWith(dateStr)) : [];
                    const uLogs = showTasks ? allData.logs.filter(l => l.user_id === uid && dateStr >= l.date_start && dateStr <= (l.date_finish || l.date_start)) : [];

                    if (day === 1) {
                        const userAllLogs = allData.logs.filter(l => l.user_id === uid);
                        userAllLogs.forEach(l => delete l.slot);
                        const userSlots = [];
                        userAllLogs.forEach(log => {
                            let assigned = false;
                            for (let i = 0; i < userSlots.length; i++) {
                                const hasOverlap = userSlots[i].some(s => {
                                    return (log.date_start <= (s.date_finish || s.date_start) && (log.date_finish || log.date_start) >= s.date_start);
                                });
                                if (!hasOverlap) {
                                    userSlots[i].push(log);
                                    log.slot = i;
                                    assigned = true;
                                    break;
                                }
                            }
                            if (!assigned) {
                                log.slot = userSlots.length;
                                userSlots.push([log]);
                            }
                        });
                    }

                    if (uLogs.length > 0) {
                        const maxSlot = Math.max(...uLogs.map(l => l.slot));
                        contentHtml += `<div class="space-y-0.5 mb-2">`;
                        for (let s = 0; s <= maxSlot; s++) {
                            const l = uLogs.find(log => log.slot === s);
                            if (l) {
                                const isStart = dateStr === l.date_start;
                                const isEnd = dateStr === (l.date_finish || l.date_start);
                                let spanClass = '';
                                if (isStart && !isEnd) spanClass = 'span-start';
                                else if (!isStart && !isEnd) spanClass = 'span-mid';
                                else if (!isStart && isEnd) spanClass = 'span-end';

                                contentHtml += `
                                    <div class="log-bar ${spanClass}" style="background-color: ${l.color || userColor}">
                                        <span class="truncate">${isStart ? `${l.task_category}: ${l.description}` : ''}</span>
                                    </div>`;
                            } else {
                                contentHtml += `<div class="h-[22px] mb-[2px]"></div>`;
                            }
                        }
                        contentHtml += `</div>`;
                    }

                    if (uAtts.length > 0) {
                        contentHtml += `
                            <div class="mt-auto pt-1 border-t border-dashed border-outline-variant/20">
                                <p class="text-[7px] font-black uppercase text-slate-400 mb-0.5">Attendance (${uAtts.length})</p>
                                ${uAtts.map(a => `
                                    <div class="flex items-center gap-1 text-[9px] font-bold text-primary bg-primary/5 px-1 rounded mb-0.5">
                                        <span class="material-symbols-outlined text-[10px]">login</span> ${a.clock_in_time?.slice(0,5)}
                                        <span class="material-symbols-outlined text-[10px]">logout</span> ${a.clock_out_time ? a.clock_out_time.slice(0,5) : '...'}
                                    </div>
                                `).join('')}
                            </div>`;
                    }
                }

                cell.innerHTML = `
                    <span class="text-[11px] font-bold text-on-surface-variant/40 mb-1">${day}</span>
                    <div class="flex-1 overflow-y-auto custom-scrollbar">
                        ${contentHtml}
                    </div>`;
                grid.appendChild(cell);
            }
        };

        const filter1 = document.getElementById('intern-filter');
        const filter2 = document.getElementById('view-mode');
        if (filter1) filter1.addEventListener('change', renderManagerCalendar);
        if (filter2) filter2.addEventListener('change', renderManagerCalendar);
        document.getElementById('prev-month').addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() - 1); renderManagerCalendar(); });
        document.getElementById('next-month').addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() + 1); renderManagerCalendar(); });

        loadManagerCalendar();
    }
});

document.addEventListener('DOMContentLoaded', async () => {
    const user = await protectRoute();
    if (!user) return;
    setupLogout();
    if (typeof initHamburgerMenu === 'function') initHamburgerMenu();

    let isClockedIn = false;
    let clockInTime = null;
    let timerInterval = null;

    const formatMs = (ms) => {
        if (ms < 0) ms = 0;
        const s = Math.floor(ms / 1000);
        const hrs = Math.floor(s / 3600).toString().padStart(2, '0');
        const mins = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
        const secs = (s % 60).toString().padStart(2, '0');
        return `${hrs}:${mins}:${secs}`;
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

    const loadInternData = async () => {
        try {
            const data = await apiCall('/api/intern/dashboard');

            const totalHrs = parseFloat(data.totalHours || 0).toFixed(2);
            document.getElementById('progress-hours').textContent = totalHrs;
            const pct = (parseFloat(totalHrs) / 400) * 100;
            document.getElementById('progress-bar').style.width = `${Math.min(pct, 100)}%`;
            const pctEl = document.getElementById('progress-pct');
            if (pctEl) pctEl.textContent = `${pct.toFixed(2)}% complete`;

            const totalOtHrs = parseFloat(data.totalOtHours || 0).toFixed(2);
            const otTotalEl = document.getElementById('ot-total-hours');
            if (otTotalEl) otTotalEl.textContent = totalOtHrs;

            if (document.getElementById('profile-hours'))
                document.getElementById('profile-hours').textContent = totalHrs;
            if (document.getElementById('profile-days'))
                document.getElementById('profile-days').textContent = data.attendance.filter(a => a.clock_out_time).length;
            if (document.getElementById('profile-pct'))
                document.getElementById('profile-pct').textContent = `${pct.toFixed(1)}%`;

            const today = new Date().toISOString().slice(0, 10);
            const activeAttendance = data.attendance.find(a => !a.clock_out_time && new Date(a.date).toDateString() === new Date().toDateString());
            if (activeAttendance) {
                isClockedIn = true;
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
                            ${normalHours > 0 ? `<div class="px-2 py-0.5 bg-primary/10 text-primary rounded-lg flex items-center gap-1 border border-primary/5"><span class="material-symbols-outlined text-[12px] font-bold">timer</span><span class="text-[10px] font-black">${normalHours.toFixed(1)}h</span></div>` : ''}
                            ${otHours > 0 ? `<div class="px-2 py-0.5 bg-orange-50 text-orange-600 rounded-lg flex items-center gap-1 border border-orange-100"><span class="material-symbols-outlined text-[12px] font-bold">bolt</span><span class="text-[10px] font-black">${otHours.toFixed(1)}h</span></div>` : ''}
                        </div>
                    </div>
                </div>`;

                if (otHours > 0 && otHistoryList) {
                    otHistoryList.innerHTML += `
                    <div class="flex items-center justify-between p-3.5 bg-orange-50/30 rounded-2xl border border-orange-100/50 hover:bg-orange-50 transition-colors duration-300">
                        <div class="flex items-center gap-4">
                            <div class="w-9 h-9 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center shadow-sm"><span class="material-symbols-outlined text-sm">bolt</span></div>
                            <div>
                                <p class="text-[11px] font-black text-on-surface">${dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                                <p class="text-[9px] text-orange-700/60 font-bold uppercase tracking-wider">After-hours session</p>
                            </div>
                        </div>
                        <div class="text-right"><p class="text-xs font-black text-orange-600 tracking-tight">+${otHours.toFixed(2)}h</p></div>
                    </div>`;
                }
            });

            if (otHistoryList && otHistoryList.innerHTML === '') {
                otHistoryList.innerHTML = `<div class="flex flex-col items-center justify-center py-10 px-4 bg-surface-container-low/30 rounded-[2rem] border border-dashed border-outline-variant/20"><div class="w-12 h-12 rounded-2xl bg-surface-container flex items-center justify-center text-on-surface-variant/20 mb-3"><span class="material-symbols-outlined text-2xl">bedtime</span></div><p class="text-[10px] text-on-surface-variant/40 font-black uppercase tracking-widest">No extra hours recorded</p></div>`;
            }

            const logList = document.getElementById('recent-logs-list');
            if (logList) {
                logList.innerHTML = '';
                const STATUS_STYLE = {
                    'Plan': 'bg-blue-50 text-blue-700', 'To Do': 'bg-yellow-50 text-yellow-700',
                    'In Progress': 'bg-sky-50 text-sky-700', 'Done': 'bg-green-50 text-green-700',
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
});

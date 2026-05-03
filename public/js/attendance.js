document.addEventListener('DOMContentLoaded', async () => {
    const user = await protectRoute();
    if (!user) return;
    setupLogout();

    if (typeof initHamburgerMenu === 'function') {
        initHamburgerMenu();
    } else {
        console.warn('initHamburgerMenu not found');
    }

    let currentDate = new Date();
    let allAttendance = [], allLogs = [], allUsers = [];
    let isDragging = false, dragStart = null, dragEnd = null;
    let viewFilter = 'all', selectedUserId = 'all';
    const colors = ['#0053dc','#10b981','#f59e0b','#8b5cf6','#ec4899','#06b6d4','#f43f5e'];

    const modal = document.getElementById('log-modal');
    let openModal = (log = null, start = null, end = null) => {
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
            document.getElementById('log-date-start').value = start || new Date().toISOString().slice(0, 10);
            document.getElementById('log-date-finish').value = end || '';
            document.getElementById('log-color').value = '#3e76fe';
            deleteBtn.classList.add('opacity-0', 'pointer-events-none');
        }
        modal.classList.remove('opacity-0', 'pointer-events-none');
    };

    if (modal) {
        const closeModal = () => modal.classList.add('opacity-0', 'pointer-events-none');
        ['open-new-task-btn','open-new-task-btn2'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('click', () => openModal());
        });
        const closeBtn = document.getElementById('close-modal-btn');
        if (closeBtn) closeBtn.addEventListener('click', closeModal);
        const cancelBtn = document.getElementById('cancel-modal-btn');
        if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

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
                    status:        'Plan'
                };
                try {
                    if (editingId) await apiCall(`/api/intern/log/${editingId}`, 'PUT', payload);
                    else await apiCall('/api/intern/log', 'POST', payload);
                    closeModal();
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
                        closeModal();
                        loadCalendarData();
                    } catch(e) { alert(e.message); }
                }
            });
        }
    }

    const internFilter = document.getElementById('intern-filter');
    if (internFilter) internFilter.addEventListener('change', (e) => { selectedUserId = e.target.value; renderCalendar(); });

    document.querySelectorAll('.view-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            viewFilter = btn.dataset.viewFilter;
            document.querySelectorAll('.view-filter-btn').forEach(b => {
                b.classList.remove('bg-white','shadow-sm','text-primary');
                b.classList.add('text-on-surface-variant','hover:bg-white/50');
            });
            btn.classList.add('bg-white','shadow-sm','text-primary');
            btn.classList.remove('text-on-surface-variant','hover:bg-white/50');
            renderCalendar();
        });
    });

    const loadCalendarData = async () => {
        try {
            const data = await apiCall('/api/intern/calendar');
            allAttendance = data.attendance;
            allLogs = data.logs;
            allUsers = data.users;

            // Normalize dates to YYYY-MM-DD (handling timezone shifts)
            const toLocalDate = (dateStr) => {
                if (!dateStr) return null;
                const d = new Date(dateStr);
                return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            };
            allAttendance.forEach(a => { a.date = toLocalDate(a.date); });
            allLogs.forEach(l => {
                l.date_start = toLocalDate(l.date_start);
                l.date_finish = toLocalDate(l.date_finish);
            });
            if (internFilter) {
                const currentVal = internFilter.value;
                internFilter.innerHTML = '<option value="all">All Participants</option>';
                allUsers.forEach(u => { internFilter.innerHTML += `<option value="${u.id}">${u.full_name}</option>`; });
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
        if (!grid) return;
        header.textContent = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(currentDate);
        grid.innerHTML = '';

        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        for (let i = 0; i < firstDay; i++) grid.innerHTML += `<div class="calendar-cell bg-surface-container-low opacity-50"></div>`;

        const filteredUsers = selectedUserId === 'all' ? allUsers : allUsers.filter(u => u.id == selectedUserId);

        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
            let contentHtml = '';

            filteredUsers.forEach((u, idx) => {
                const userColor = colors[idx % colors.length];
                const uAtts = allAttendance.filter(a => a.user_id === u.id && a.date.startsWith(dateStr));
                const uLogs = allLogs.filter(l => l.user_id === u.id && dateStr >= l.date_start && dateStr <= (l.date_finish || l.date_start));

                if (day === 1) {
                    const userAllLogs = allLogs.filter(l => l.user_id === u.id);
                    userAllLogs.forEach(l => delete l.slot);
                    const slots = [];
                    userAllLogs.forEach(log => {
                        let assigned = false;
                        for (let i = 0; i < slots.length; i++) {
                            if (!slots[i].some(s => log.date_start <= (s.date_finish || s.date_start) && (log.date_finish || log.date_start) >= s.date_start)) {
                                slots[i].push(log); log.slot = i; assigned = true; break;
                            }
                        }
                        if (!assigned) { log.slot = slots.length; slots.push([log]); }
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
                                let spanClass = (!isStart && !isEnd) ? 'span-mid' : (!isStart && isEnd) ? 'span-end' : (isStart && !isEnd) ? 'span-start' : '';
                                logsMarkup += `<div class="log-bar ${spanClass}" style="background-color:${l.color||userColor};height:16px;font-size:8px;margin-bottom:1px;" ${isOwn?`onclick="event.stopPropagation();editLog('${safeLog}')"`:''}>${isStart?`<span class="truncate">${l.task_category}</span>`:''}</div>`;
                            } else {
                                logsMarkup += `<div class="h-[16px] mb-[1px]"></div>`;
                            }
                        }
                    }
                    let attMarkup = '';
                    if (viewFilter !== 'tasks' && uAtts.length > 0) {
                        attMarkup = uAtts.map(a => `<div class="flex items-center gap-0.5 text-[8px] font-bold" style="color:${userColor}"><span class="material-symbols-outlined text-[9px]">login</span>${a.clock_in_time?.slice(0,5)}</div>`).join('');
                    }
                    if (logsMarkup || attMarkup) {
                        contentHtml += `<div class="mb-2 p-1 rounded border-l-2" style="border-left-color:${userColor};background:${userColor}08"><div class="flex items-center justify-between mb-0.5"><span class="text-[7px] font-black uppercase" style="color:${userColor}">${u.full_name}</span></div>${logsMarkup}${attMarkup}</div>`;
                    }
                }
            });

            const cell = document.createElement('div');
            cell.className = 'calendar-cell custom-scrollbar overflow-y-auto';
            cell.dataset.date = dateStr;
            cell.innerHTML = `<span class="text-[10px] font-bold text-on-surface-variant/30 mb-1">${day}</span><div class="flex-1">${contentHtml}</div>`;

            cell.addEventListener('mousedown', () => { isDragging = true; dragStart = dragEnd = dateStr; updateSelectionUI(); });
            cell.addEventListener('mouseenter', () => { if (isDragging) { dragEnd = dateStr; updateSelectionUI(); } });
            grid.appendChild(cell);
        }
        renderSummaryTable();
    };

    const renderSummaryTable = () => {
        const tableBody = document.getElementById('summary-table-body');
        if (!tableBody) return;
        const summaryMonth = document.getElementById('summary-month-name');
        const header = document.getElementById('calendar-month-year');
        if (summaryMonth && header) summaryMonth.textContent = header.textContent;
        tableBody.innerHTML = '';

        const year = currentDate.getFullYear(), month = currentDate.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const filteredUsers = selectedUserId === 'all' ? allUsers : allUsers.filter(u => u.id == selectedUserId);

        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
            filteredUsers.forEach((u, idx) => {
                const userColor = colors[idx % colors.length];
                const dayAtts = allAttendance.filter(a => a.user_id === u.id && a.date.startsWith(dateStr));
                const dayLogs = allLogs.filter(l => l.user_id === u.id && dateStr >= l.date_start && dateStr <= (l.date_finish || l.date_start));
                if (dayAtts.length === 0 && dayLogs.length === 0) return;
                const dateDisplay = new Date(dateStr).toLocaleDateString('en-GB', { day:'2-digit', month:'short' });
                const clockIn = dayAtts.map(a => a.clock_in_time?.slice(0,5)).join(', ') || '--';
                const clockOut = dayAtts.map(a => a.clock_out_time?.slice(0,5)).join(', ') || '--';
                const totalHrs = dayAtts.reduce((acc, a) => acc + parseFloat(a.total_hours || 0), 0).toFixed(2);
                const tasks = dayLogs.map(l => `<span class="inline-block px-2 py-0.5 rounded text-[9px] font-bold text-white mr-1 mb-1" style="background-color:${l.color||userColor}">${l.task_category}</span>`).join('');
                tableBody.innerHTML += `<tr class="hover:bg-surface-container-low transition-colors"><td class="px-6 py-3 font-bold text-on-surface text-xs"><div>${dateDisplay}</div><div class="text-[8px] font-black uppercase" style="color:${userColor}">${u.full_name}</div></td><td class="px-6 py-3 text-on-surface-variant font-medium text-xs">${clockIn}</td><td class="px-6 py-3 text-on-surface-variant font-medium text-xs">${clockOut}</td><td class="px-6 py-3 font-black text-primary text-xs">${totalHrs}h</td><td class="px-6 py-3">${tasks}</td></tr>`;
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
            if (date >= start && date <= end) cell.classList.add('bg-primary/10','border-primary/30');
            else cell.classList.remove('bg-primary/10','border-primary/30');
        });
    };

    window.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            const start = dragStart < dragEnd ? dragStart : dragEnd;
            const end = dragStart < dragEnd ? dragEnd : dragStart;
            openModal(null, start, end);
            document.querySelectorAll('.calendar-cell[data-date]').forEach(c => c.classList.remove('bg-primary/10','border-primary/30'));
        }
    });

    window.editLog = (logStr) => {
        try { openModal(JSON.parse(decodeURIComponent(logStr))); } catch(e) {}
    };

    const prevBtn = document.getElementById('prev-month');
    const nextBtn = document.getElementById('next-month');
    if (prevBtn) prevBtn.addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() - 1); renderCalendar(); });
    if (nextBtn) nextBtn.addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() + 1); renderCalendar(); });

    loadCalendarData();
});

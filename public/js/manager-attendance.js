document.addEventListener('DOMContentLoaded', async () => {
    const user = await protectRoute();
    if (!user) return;
    setupLogout();

    let currentDate = new Date();
    let allData = { users: [], attendance: [], logs: [] };
    const colors = ['#0053dc','#10b981','#f59e0b','#8b5cf6','#ec4899','#06b6d4','#f43f5e'];

    const loadManagerCalendar = async () => {
        try {
            allData = await apiCall('/api/manager/calendar-data');
            const filter = document.getElementById('intern-filter');
            const currentVal = filter.value;
            filter.innerHTML = '<option value="all">All Interns</option>';
            allData.users.forEach((u, i) => {
                filter.innerHTML += `<option value="${u.id}" data-color="${colors[i%colors.length]}">${u.full_name}</option>`;
            });
            filter.value = currentVal;
            renderManagerCalendar();
        } catch (err) { console.error(err); }
    };

    const renderManagerCalendar = () => {
        const grid = document.getElementById('calendar-grid');
        const header = document.getElementById('calendar-month-year');
        if (!grid) return;

        const year = currentDate.getFullYear(), month = currentDate.getMonth();
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
            const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
            const cell = document.createElement('div');
            cell.className = 'calendar-cell';
            let contentHtml = '';

            if (selectedUserId === 'all') {
                allData.users.forEach((u, idx) => {
                    const userColor = colors[idx % colors.length];
                    const uAtts = showAtts ? allData.attendance.filter(a => a.user_id === u.id && a.date.startsWith(dateStr)) : [];
                    const uLogs = showTasks ? allData.logs.filter(l => l.user_id === u.id && dateStr >= l.date_start && dateStr <= (l.date_finish || l.date_start)) : [];

                    if (day === 1) {
                        const userAllLogs = allData.logs.filter(l => l.user_id === u.id);
                        userAllLogs.forEach(l => delete l.slot);
                        const userSlots = [];
                        userAllLogs.forEach(log => {
                            let assigned = false;
                            for (let i = 0; i < userSlots.length; i++) {
                                if (!userSlots[i].some(s => log.date_start <= (s.date_finish||s.date_start) && (log.date_finish||log.date_start) >= s.date_start)) {
                                    userSlots[i].push(log); log.slot = i; assigned = true; break;
                                }
                            }
                            if (!assigned) { log.slot = userSlots.length; userSlots.push([log]); }
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
                                    let spanClass = (!isStart&&!isEnd)?'span-mid':(!isStart&&isEnd)?'span-end':(isStart&&!isEnd)?'span-start':'';
                                    logsMarkup += `<div class="text-[8px] px-1 mb-0.5 rounded truncate text-white font-bold ${spanClass}" style="background-color:${l.color||userColor}">${isStart?l.task_category:'&nbsp;'}</div>`;
                                } else {
                                    logsMarkup += `<div class="h-[12px] mb-0.5"></div>`;
                                }
                            }
                        }
                        contentHtml += `<div class="user-box bg-white shadow-sm border border-outline-variant/10 mb-2" style="border-left-color:${userColor}"><div class="flex items-center justify-between mb-1"><span class="text-[8px] font-black uppercase" style="color:${userColor}">${u.full_name}</span>${uAtts.length>0?`<span class="text-[7px] bg-slate-100 px-1 rounded">${uAtts.length} sess</span>`:''}</div><div class="space-y-0.5">${logsMarkup}${uAtts.map(a=>`<div class="text-[7px] text-slate-500 font-medium flex items-center gap-0.5"><span class="material-symbols-outlined text-[8px]">login</span>${a.clock_in_time?.slice(0,5)}${a.clock_out_time?`<span class="material-symbols-outlined text-[8px]">logout</span>${a.clock_out_time.slice(0,5)}`:''}</div>`).join('')}</div></div>`;
                    }
                });
            } else {
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
                            if (!userSlots[i].some(s => log.date_start<=(s.date_finish||s.date_start)&&(log.date_finish||log.date_start)>=s.date_start)) {
                                userSlots[i].push(log); log.slot=i; assigned=true; break;
                            }
                        }
                        if (!assigned) { log.slot=userSlots.length; userSlots.push([log]); }
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
                            let spanClass = (!isStart&&!isEnd)?'span-mid':(!isStart&&isEnd)?'span-end':(isStart&&!isEnd)?'span-start':'';
                            contentHtml += `<div class="log-bar ${spanClass}" style="background-color:${l.color||userColor}"><span class="truncate">${isStart?`${l.task_category}: ${l.description}`:''}</span></div>`;
                        } else {
                            contentHtml += `<div class="h-[22px] mb-[2px]"></div>`;
                        }
                    }
                    contentHtml += `</div>`;
                }
                if (uAtts.length > 0) {
                    contentHtml += `<div class="mt-auto pt-1 border-t border-dashed border-outline-variant/20"><p class="text-[7px] font-black uppercase text-slate-400 mb-0.5">Attendance (${uAtts.length})</p>${uAtts.map(a=>`<div class="flex items-center gap-1 text-[9px] font-bold text-primary bg-primary/5 px-1 rounded mb-0.5"><span class="material-symbols-outlined text-[10px]">login</span>${a.clock_in_time?.slice(0,5)}<span class="material-symbols-outlined text-[10px]">logout</span>${a.clock_out_time?a.clock_out_time.slice(0,5):'...'}</div>`).join('')}</div>`;
                }
            }

            cell.innerHTML = `<span class="text-[11px] font-bold text-on-surface-variant/40 mb-1">${day}</span><div class="flex-1 overflow-y-auto custom-scrollbar">${contentHtml}</div>`;
            grid.appendChild(cell);
        }
    };

    const filter1 = document.getElementById('intern-filter');
    const filter2 = document.getElementById('view-mode');
    if (filter1) filter1.addEventListener('change', renderManagerCalendar);
    if (filter2) filter2.addEventListener('change', renderManagerCalendar);
    document.getElementById('prev-month').addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth()-1); renderManagerCalendar(); });
    document.getElementById('next-month').addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth()+1); renderManagerCalendar(); });

    loadManagerCalendar();
});

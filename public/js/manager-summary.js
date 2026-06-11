document.addEventListener('DOMContentLoaded', async () => {
    const user = await protectRoute();
    if (!user) return;
    setupLogout();

    const colors = ['#0053dc', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f43f5e'];
    
    // State
    let allData = { users: [], attendance: [], logs: [] };
    let filteredRows = [];

    // DOM Elements
    const userFilter = document.getElementById('user-filter');
    const dateFrom = document.getElementById('date-from');
    const dateTo = document.getElementById('date-to');
    const filterBtn = document.getElementById('filter-btn');
    const resetBtn = document.getElementById('reset-btn');
    const tableBody = document.getElementById('summary-table-body');
    const summaryPeriod = document.getElementById('summary-period');

    // Stats elements
    const statWorkingDays = document.getElementById('stat-working-days');
    const statTotalHours = document.getElementById('stat-total-hours');
    const statAvgHours = document.getElementById('stat-avg-hours');
    const statTotalTasks = document.getElementById('stat-total-tasks');

    // Load all data from API
    const loadData = async () => {
        try {
            allData = await apiCall('/api/manager/calendar-data');
            
            // Normalize dates to YYYY-MM-DD
            const toLocalDate = (dateStr) => {
                if (!dateStr) return null;
                const d = new Date(dateStr);
                return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            };
            
            allData.logs.forEach(l => {
                l.date_start = toLocalDate(l.date_start);
                l.date_finish = toLocalDate(l.date_finish);
            });
            allData.attendance.forEach(a => {
                a.date = toLocalDate(a.date);
            });

            // Populate user dropdown
            populateUserFilter();
            
            // Set default date range (first clock-in to today)
            setDefaultDateRange();
            
            // Initial render
            applyFilter();
        } catch (err) {
            console.error('Failed to load data:', err);
            tableBody.innerHTML = `<tr><td colspan="7" class="px-6 py-10 text-center text-red-400">Failed to load data. Please try again.</td></tr>`;
        }
    };

    // Populate user filter dropdown
    const populateUserFilter = () => {
        userFilter.innerHTML = '<option value="all">All Users</option>';
        allData.users.forEach(u => {
            const opt = document.createElement('option');
            opt.value = u.id;
            opt.textContent = `${u.full_name} (${u.role})`;
            userFilter.appendChild(opt);
        });
    };

    // Set default date range
    const setDefaultDateRange = () => {
        if (allData.attendance.length === 0) return;
        
        const dates = allData.attendance.map(a => a.date).filter(Boolean).sort();
        const firstDate = dates[0];
        const today = new Date().toISOString().slice(0, 10);
        
        dateFrom.value = firstDate;
        dateTo.value = today;
    };

    // Apply filter and render
    const applyFilter = () => {
        const selectedUserId = userFilter.value;
        const fromDate = dateFrom.value;
        const toDate = dateTo.value;

        // Build filtered rows
        filteredRows = [];
        
        // Get target users
        const targetUsers = selectedUserId === 'all'
            ? allData.users
            : allData.users.filter(u => u.id === parseInt(selectedUserId));

        // Build a map of user colors
        const userColorMap = {};
        targetUsers.forEach((u, idx) => {
            userColorMap[u.id] = colors[idx % colors.length];
        });

        // Get date range
        let startDate = fromDate;
        let endDate = toDate;

        if (!startDate || !endDate) {
            // If no date range, use all data
            const allDates = allData.attendance.map(a => a.date).filter(Boolean).sort();
            startDate = allDates[0] || '';
            endDate = allDates[allDates.length - 1] || '';
        }

        if (!startDate || !endDate) {
            updateStats(0, 0, 0, 0);
            renderTable([]);
            return;
        }

        // Update period label
        summaryPeriod.textContent = `${formatDate(startDate)} — ${formatDate(endDate)}`;

        // Iterate through each day
        const current = new Date(startDate + 'T00:00:00');
        const end = new Date(endDate + 'T00:00:00');
        const workingDaysSet = new Set();
        let totalHours = 0;
        let totalOtHours = 0;
        let totalTasks = 0;

        while (current <= end) {
            const year = current.getFullYear();
            const month = current.getMonth() + 1;
            const day = current.getDate();
            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

            targetUsers.forEach(u => {
                // Get attendance for this user on this date
                const dayAtts = allData.attendance.filter(a =>
                    a.user_id === u.id && a.date === dateStr
                );

                // Get tasks for this user on this date
                const dayLogs = allData.logs.filter(l =>
                    l.user_id === u.id &&
                    l.date_start &&
                    dateStr >= l.date_start &&
                    dateStr <= (l.date_finish || l.date_start)
                );

                if (dayAtts.length === 0 && dayLogs.length === 0) return;

                // Track working days
                workingDaysSet.add(`${u.id}_${dateStr}`);

                // Calculate hours
                const dayHrs = dayAtts.reduce((sum, a) => sum + parseFloat(a.total_hours || 0), 0);
                const dayOtHrs = dayAtts.reduce((sum, a) => sum + parseFloat(a.ot_hours || 0), 0);
                totalHours += dayHrs;
                totalOtHours += dayOtHrs;
                totalTasks += dayLogs.length;

                // Build row data
                const clockIn = dayAtts.map(a => a.clock_in_time ? String(a.clock_in_time).slice(0, 5) : null).filter(Boolean);
                const clockOut = dayAtts.map(a => a.clock_out_time ? String(a.clock_out_time).slice(0, 5) : null).filter(Boolean);

                filteredRows.push({
                    date: dateStr,
                    userId: u.id,
                    userName: u.full_name,
                    userRole: u.role,
                    userColor: userColorMap[u.id],
                    clockIn: clockIn,
                    clockOut: clockOut,
                    totalHours: dayHrs,
                    otHours: dayOtHrs,
                    tasks: dayLogs.map(l => ({ category: l.task_category, color: l.color }))
                });
            });

            current.setDate(current.getDate() + 1);
        }

        // Sort by date desc
        filteredRows.sort((a, b) => b.date.localeCompare(a.date));

        // Update stats - Total Hours includes OT
        const workingDays = workingDaysSet.size;
        const totalHoursWithOT = totalHours + totalOtHours;
        const avgHrs = workingDays > 0 ? (totalHoursWithOT / workingDays) : 0;
        updateStats(workingDays, totalHoursWithOT, avgHrs, totalTasks);

        // Render all rows
        renderTable();
    };

    // Update stats display
    const updateStats = (workingDays, totalHours, avgHours, totalTasks) => {
        statWorkingDays.textContent = workingDays;
        statTotalHours.textContent = `${totalHours.toFixed(1)}h`;
        statAvgHours.textContent = `${avgHours.toFixed(1)}h`;
        statTotalTasks.textContent = totalTasks;
    };

    // Render table (all rows, no pagination)
    const renderTable = () => {
        if (filteredRows.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="7" class="px-6 py-20 text-center">
                <div class="flex flex-col items-center gap-3">
                    <span class="material-symbols-outlined text-[48px] text-outline-variant">hourglass_empty</span>
                    <p class="text-on-surface-variant/60 italic">No records found for selected filters</p>
                </div>
            </td></tr>`;
            return;
        }

        let html = '';
        filteredRows.forEach(row => {
            const clockInStr = row.clockIn.length > 0 ? row.clockIn.join(', ') : '--';
            const clockOutStr = row.clockOut.length > 0 ? row.clockOut.join(', ') : '--';
            const roleBadge = row.userRole !== 'intern' 
                ? `<span class="ml-1 text-[8px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-black uppercase">${row.userRole}</span>` 
                : '';
            const otBadge = row.otHours > 0 
                ? `<span class="text-amber-500 text-[10px] font-bold">+${row.otHours.toFixed(1)}h OT</span>` 
                : '';
            const tasksHtml = row.tasks.length > 0
                ? row.tasks.map(t => `<span class="inline-block px-2 py-0.5 rounded-lg text-[9px] font-bold text-white mr-1 mb-1" style="background-color:${t.color || row.userColor}">${t.category}</span>`).join('')
                : '<span class="text-on-surface-variant/40 italic">--</span>';

            html += `<tr class="hover:bg-surface-container-low/50 transition-colors">
                <td class="px-6 py-4 font-bold text-on-surface text-xs whitespace-nowrap">${formatDate(row.date)}</td>
                <td class="px-6 py-4">
                    <span class="text-[11px] font-black uppercase tracking-wider" style="color:${row.userColor}">${row.userName}</span>${roleBadge}
                </td>
                <td class="px-6 py-4 text-on-surface-variant font-medium text-xs">${clockInStr}</td>
                <td class="px-6 py-4 text-on-surface-variant font-medium text-xs">${clockOutStr}</td>
                <td class="px-6 py-4 font-black text-primary text-xs">${row.totalHours.toFixed(1)}h</td>
                <td class="px-6 py-4 ${row.otHours > 0 ? 'text-amber-600' : 'text-on-surface-variant/40'} font-bold text-xs">${otBadge || '--'}</td>
                <td class="px-6 py-4">${tasksHtml}</td>
            </tr>`;
        });

        tableBody.innerHTML = html;
    };

    // Format date for display
    const formatDate = (dateStr) => {
        if (!dateStr) return '--';
        const d = new Date(dateStr + 'T00:00:00');
        return d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
    };

    // Event listeners
    filterBtn.addEventListener('click', applyFilter);
    resetBtn.addEventListener('click', () => {
        userFilter.value = 'all';
        setDefaultDateRange();
        applyFilter();
    });

    // Enter key to filter
    [dateFrom, dateTo].forEach(input => {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') applyFilter();
        });
    });

    // Load data on page load
    await loadData();
});

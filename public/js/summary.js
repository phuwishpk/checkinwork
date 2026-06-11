// Intern Summary - My attendance and task summary page
console.log('[summary.js] Script loaded');

function initSummary() {
    console.log('[summary.js] initSummary called');
    
    // State
    let myData = { attendance: [], logs: [] };
    let filteredRows = [];

    // DOM Elements
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

    console.log('[summary.js] Elements found:', {
        dateFrom: !!dateFrom,
        dateTo: !!dateTo,
        filterBtn: !!filterBtn,
        resetBtn: !!resetBtn,
        tableBody: !!tableBody
    });

    // URL params helpers
    const getUrlParams = () => new URLSearchParams(window.location.search);
    const updateUrl = (from, to) => {
        const params = new URLSearchParams();
        if (from) params.set('from', from);
        if (to) params.set('to', to);
        
        const baseUrl = window.location.origin + window.location.pathname;
        const newUrl = params.toString() ? `${baseUrl}?${params.toString()}` : baseUrl;
        
        console.log('[summary.js] Updating URL to:', newUrl);
        window.history.replaceState({}, '', newUrl);
    };

    // Load data from API
    const loadData = async () => {
        console.log('[summary.js] Loading data...');
        try {
            // Get current user from session
            const session = await apiCall('/api/session');
            if (!session || !session.user) {
                console.error('[summary.js] No session found');
                window.location.href = '/index.html';
                return;
            }
            
            const userId = session.user.id;
            console.log('[summary.js] Current user ID:', userId);

            // Load my data from intern calendar endpoint
            const data = await apiCall('/api/intern/calendar');
            myData.attendance = (data.attendance || []).filter(a => a.user_id === userId);
            myData.logs = (data.logs || []).filter(l => l.user_id === userId);
            
            console.log('[summary.js] Data loaded:', myData);

            // Normalize dates to YYYY-MM-DD
            const toLocalDate = (dateStr) => {
                if (!dateStr) return null;
                const d = new Date(dateStr);
                return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            };
            
            myData.logs.forEach(l => {
                l.date_start = toLocalDate(l.date_start);
                l.date_finish = toLocalDate(l.date_finish);
            });
            myData.attendance.forEach(a => {
                a.date = toLocalDate(a.date);
            });

            // Set default date range (first clock-in to today)
            setDefaultDateRange();
            
            // Load filters from URL and apply
            loadFiltersFromUrl();
            applyFilter();
            
            console.log('[summary.js] Initial load complete');
        } catch (err) {
            console.error('[summary.js] Failed to load data:', err);
            tableBody.innerHTML = `<tr><td colspan="6" class="px-6 py-10 text-center text-red-400">Failed to load data. Please try again.</td></tr>`;
        }
    };

    // Set default date range
    const setDefaultDateRange = () => {
        if (myData.attendance.length === 0) return;
        
        const dates = myData.attendance.map(a => a.date).filter(Boolean).sort();
        const firstDate = dates[0];
        const today = new Date().toISOString().slice(0, 10);
        
        dateFrom.value = firstDate;
        dateTo.value = today;
        console.log('[summary.js] Default date range set:', firstDate, 'to', today);
    };

    // Load filters from URL params
    const loadFiltersFromUrl = () => {
        const params = getUrlParams();
        const from = params.get('from');
        const to = params.get('to');
        
        if (from) {
            dateFrom.value = from;
            console.log('[summary.js] Loaded from date from URL:', from);
        }
        if (to) {
            dateTo.value = to;
            console.log('[summary.js] Loaded to date from URL:', to);
        }
    };

    // Apply filter and render
    const applyFilter = () => {
        console.log('[summary.js] applyFilter called, from:', dateFrom.value, 'to:', dateTo.value);
        const fromDate = dateFrom.value;
        const toDate = dateTo.value;

        // Update URL with current filters
        updateUrl(fromDate, toDate);

        // Build filtered rows
        filteredRows = [];

        // Get date range
        let startDate = fromDate;
        let endDate = toDate;

        if (!startDate || !endDate) {
            const allDates = myData.attendance.map(a => a.date).filter(Boolean).sort();
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
        let totalHours = 0;
        let totalOtHours = 0;
        let totalTasks = 0;
        let workingDays = 0;

        while (current <= end) {
            const year = current.getFullYear();
            const month = current.getMonth() + 1;
            const day = current.getDate();
            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

            // Get attendance for this date
            const dayAtts = myData.attendance.filter(a => a.date === dateStr);

            // Get tasks for this date
            const dayLogs = myData.logs.filter(l =>
                l.date_start &&
                dateStr >= l.date_start &&
                dateStr <= (l.date_finish || l.date_start)
            );

            // Calculate hours
            const dayHrs = dayAtts.reduce((sum, a) => sum + parseFloat(a.total_hours || 0), 0);
            const dayOtHrs = dayAtts.reduce((sum, a) => sum + parseFloat(a.ot_hours || 0), 0);

            // Only add row if there's data
            if (dayAtts.length > 0 || dayLogs.length > 0) {
                workingDays++;
                totalHours += dayHrs;
                totalOtHours += dayOtHrs;
                totalTasks += dayLogs.length;

                // Get clock times
                const clockIn = dayAtts.map(a => a.clock_in_time ? String(a.clock_in_time).slice(0, 5) : null).filter(Boolean);
                const clockOut = dayAtts.map(a => a.clock_out_time ? String(a.clock_out_time).slice(0, 5) : null).filter(Boolean);

                filteredRows.push({
                    date: dateStr,
                    clockIn: clockIn,
                    clockOut: clockOut,
                    totalHours: dayHrs,
                    otHours: dayOtHrs,
                    tasks: dayLogs.map(l => ({ category: l.task_category, color: l.color }))
                });
            }

            current.setDate(current.getDate() + 1);
        }

        // Sort by date desc
        filteredRows.sort((a, b) => b.date.localeCompare(a.date));

        // Update stats
        const totalHoursWithOT = totalHours + totalOtHours;
        const avgHrs = workingDays > 0 ? (totalHoursWithOT / workingDays) : 0;
        
        console.log('[summary.js] Stats:', { workingDays, totalHoursWithOT, avgHrs, totalTasks });
        updateStats(workingDays, totalHoursWithOT, avgHrs, totalTasks);

        // Render table
        renderTable();
    };

    // Update stats display
    const updateStats = (workingDays, totalHours, avgHours, totalTasks) => {
        if (statWorkingDays) statWorkingDays.textContent = workingDays;
        if (statTotalHours) statTotalHours.textContent = `${totalHours.toFixed(1)}h`;
        if (statAvgHours) statAvgHours.textContent = `${avgHours.toFixed(1)}h`;
        if (statTotalTasks) statTotalTasks.textContent = totalTasks;
    };

    // Render table
    const renderTable = () => {
        console.log('[summary.js] Rendering table with', filteredRows.length, 'rows');
        if (filteredRows.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="6" class="px-6 py-20 text-center">
                <div class="flex flex-col items-center gap-3">
                    <span class="material-symbols-outlined text-[48px] text-outline-variant">hourglass_empty</span>
                    <p class="text-on-surface-variant/60 italic">No records found for selected period</p>
                </div>
            </td></tr>`;
            return;
        }

        const primaryColor = '#0053dc';
        let html = '';
        filteredRows.forEach(row => {
            const clockInStr = row.clockIn.length > 0 ? row.clockIn.join(', ') : '--';
            const clockOutStr = row.clockOut.length > 0 ? row.clockOut.join(', ') : '--';
            const otBadge = row.otHours > 0 
                ? `<span class="text-amber-500 text-[10px] font-bold">+${row.otHours.toFixed(1)}h OT</span>` 
                : '<span class="text-on-surface-variant/40">--</span>';
            const tasksHtml = row.tasks.length > 0
                ? row.tasks.map(t => `<span class="inline-block px-2 py-0.5 rounded-lg text-[9px] font-bold text-white mr-1 mb-1" style="background-color:${t.color || primaryColor}">${t.category}</span>`).join('')
                : '<span class="text-on-surface-variant/40 italic">--</span>';

            html += `<tr class="hover:bg-surface-container-low/50 transition-colors">
                <td class="px-6 py-4 font-bold text-on-surface text-xs whitespace-nowrap">${formatDate(row.date)}</td>
                <td class="px-6 py-4 text-on-surface-variant font-medium text-xs">${clockInStr}</td>
                <td class="px-6 py-4 text-on-surface-variant font-medium text-xs">${clockOutStr}</td>
                <td class="px-6 py-4 font-black text-primary text-xs">${row.totalHours.toFixed(1)}h</td>
                <td class="px-6 py-4 font-bold text-xs">${otBadge}</td>
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
    console.log('[summary.js] Attaching event listeners');
    
    filterBtn.addEventListener('click', () => {
        console.log('[summary.js] Filter button clicked');
        applyFilter();
    });
    
    resetBtn.addEventListener('click', () => {
        console.log('[summary.js] Reset button clicked');
        window.history.replaceState({}, '', window.location.pathname);
        setDefaultDateRange();
        applyFilter();
    });

    // Load data on page load
    loadData();
    
    console.log('[summary.js] Initialization complete');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSummary);
} else {
    initSummary();
}

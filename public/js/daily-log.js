document.addEventListener('DOMContentLoaded', async () => {
    const user = await protectRoute();
    if (!user) return;
    setupLogout();

    const STATUS_STYLE = {
        'Plan': 'status-plan', 'To Do': 'status-todo',
        'In Progress': 'status-inprogress', 'Done': 'status-done',
    };
    let allLogs = [];
    let currentFilter = 'all';

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
            if (editingId) await apiCall(`/api/intern/log/${editingId}`, 'PUT', payload);
            else await apiCall('/api/intern/log', 'POST', payload);
            closeModal();
            loadLogs();
        } catch (err) {
            msgEl.textContent = err.message;
            msgEl.className = 'text-sm font-medium text-red-600';
            msgEl.classList.remove('hidden');
        }
    });

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

    const formatDate = (d) => {
        if (!d) return '—';
        try { return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
        catch(e) { return d; }
    };
    const computeDuration = (start, finish) => {
        if (!start || !finish) return '—';
        const diffDays = Math.round((new Date(finish) - new Date(start)) / (1000*60*60*24));
        if (diffDays < 0) return '—';
        return diffDays === 0 ? '1 day' : `${diffDays + 1} days`;
    };

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
                <td class="px-5 py-3.5"><span class="px-2.5 py-1 rounded-full text-xs font-semibold ${cls}">${log.status}</span></td>
                <td class="px-5 py-3.5 text-on-surface-variant text-xs">${formatDate(log.date_start)}</td>
                <td class="px-5 py-3.5 text-on-surface-variant text-xs">${formatDate(log.date_finish)}</td>
                <td class="px-5 py-3.5 text-on-surface-variant text-xs">${dur}</td>
                <td class="px-5 py-3.5 text-right">
                    <div class="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onclick="editLog(${log.id})" class="p-1.5 rounded-lg hover:bg-blue-50 text-primary transition-colors"><span class="material-symbols-outlined text-base">edit</span></button>
                        <button onclick="deleteLog(${log.id})" class="p-1.5 rounded-lg hover:bg-red-50 text-red-500 transition-colors"><span class="material-symbols-outlined text-base">delete</span></button>
                    </div>
                </td>
            </tr>`;
        }).join('');
    };

    const loadLogs = async () => {
        try {
            const data = await apiCall('/api/intern/logs');
            allLogs = data.logs;
            renderTable();
        } catch(e) {}
    };

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

    loadLogs();
    loadAttendance();
});

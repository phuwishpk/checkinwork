document.addEventListener('DOMContentLoaded', async () => {
    const user = await protectRoute();
    if (!user) return;
    setupLogout();

    let allLogs = [];
    let filteredLogs = [];

    async function loadLogsManagement() {
        try {
            const [dashData, logsData] = await Promise.all([
                apiCall('/api/manager/dashboard'),
                apiCall('/api/logs/all'),
            ]);
            allLogs = logsData.logs || [];
            filteredLogs = [...allLogs];
            updateStats();
            populateInternFilter(dashData.roster || []);
            displayLogs();
        } catch (error) {
            console.error('Error loading logs management:', error);
        }
    }

    function updateStats() {
        document.getElementById('countPlan').textContent      = allLogs.filter(l => l.status === 'Plan' || l.task_category === 'Plan').length;
        document.getElementById('countToDo').textContent      = allLogs.filter(l => l.status === 'To Do' || l.task_category === 'To Do').length;
        document.getElementById('countInProgress').textContent= allLogs.filter(l => l.status === 'In Progress' || l.task_category === 'In Progress').length;
        document.getElementById('countDone').textContent      = allLogs.filter(l => l.status === 'Done' || l.task_category === 'Done').length;
    }

    function populateInternFilter(roster) {
        const internFilter = document.getElementById('internFilter');
        roster.forEach(intern => {
            const option = document.createElement('option');
            option.value = intern.id;
            option.textContent = intern.full_name;
            internFilter.appendChild(option);
        });
    }

    function computeDuration(start, finish) {
        if (!start || !finish) return '—';
        const diffDays = Math.round((new Date(finish) - new Date(start)) / (1000 * 60 * 60 * 24));
        if (diffDays < 0) return '—';
        return diffDays === 0 ? '1 day' : `${diffDays + 1} days`;
    }

    function displayLogs() {
        document.getElementById('logsContainer').innerHTML = filteredLogs.map(log => {
            const duration = computeDuration(log.date_start, log.date_finish);
            const statusCls =
                log.status === 'Plan'        ? 'bg-surface-container-highest text-on-surface' :
                log.status === 'To Do'       ? 'bg-tertiary-container text-on-tertiary-container' :
                log.status === 'In Progress' ? 'bg-primary text-on-primary' :
                log.status === 'Done'        ? 'bg-secondary-fixed text-on-secondary-container' :
                                               'bg-outline text-on-surface';
            return `
            <div class="bg-surface-container-lowest p-6 rounded-xl ambient-shadow">
                <div class="flex justify-between items-start mb-4">
                    <div class="flex items-center space-x-3">
                        <div class="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                            ${log.full_name.split(' ').map(n => n[0]).join('').substring(0, 2)}
                        </div>
                        <div>
                            <p class="font-label text-sm font-semibold text-on-surface">${log.full_name}</p>
                            <p class="font-label text-xs text-on-surface-variant">${new Date(log.date_start || log.date).toLocaleDateString()}</p>
                        </div>
                    </div>
                    <span class="px-3 py-1 rounded-full text-xs font-label font-medium ${statusCls}">${log.status}</span>
                </div>
                <h4 class="font-headline font-semibold text-on-surface mb-2">${log.task_category}</h4>
                <p class="text-sm font-label text-on-surface-variant line-clamp-2 mb-4">${log.description}</p>
                <div class="flex items-center justify-between pt-4 border-t border-outline-variant/15">
                    <span class="text-sm font-label font-medium text-on-surface">${duration}</span>
                    <div class="flex space-x-2">
                        <button class="px-3 py-1 text-xs font-medium text-primary hover:bg-primary/10 rounded-lg transition-colors" onclick="viewLogDetails(${log.id})">View Details</button>
                    </div>
                </div>
            </div>`;
        }).join('');
    }

    window.applyFilters = function() {
        const dateFilter   = document.getElementById('dateFilter').value;
        const internFilter = document.getElementById('internFilter').value;
        const statusFilter = document.getElementById('statusFilter').value;
        filteredLogs = allLogs.filter(log => {
            if (dateFilter !== 'all') {
                const logDate = new Date(log.date);
                const now = new Date();
                if (dateFilter === 'today' && logDate.toDateString() !== now.toDateString()) return false;
                if (dateFilter === 'week' && logDate < new Date(now.getTime() - 7*24*60*60*1000)) return false;
                if (dateFilter === 'month' && (logDate.getMonth() !== now.getMonth() || logDate.getFullYear() !== now.getFullYear())) return false;
            }
            if (internFilter !== 'all' && log.user_id != internFilter) return false;
            if (statusFilter !== 'all' && log.status !== statusFilter) return false;
            return true;
        });
        displayLogs();
    };

    window.viewLogDetails = function(logId) {
        const log = allLogs.find(l => l.id == logId);
        if (log) {
            const duration = computeDuration(log.date_start, log.date_finish);
            alert(`Log Details:\n\nIntern: ${log.full_name}\nStart Date: ${new Date(log.date_start).toLocaleDateString()}\nFinish Date: ${new Date(log.date_finish).toLocaleDateString()}\nTask: ${log.task_category}\nDescription: ${log.description}\nDuration: ${duration}\nStatus: ${log.status}`);
        }
    };

    loadLogsManagement();
});

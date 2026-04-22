document.addEventListener('DOMContentLoaded', async () => {
    const user = await protectRoute();
    if (!user) return;
    setupLogout();

    async function loadDashboard() {
        try {
            const data = await apiCall('/api/manager/dashboard');

            document.getElementById('totalProgramHours').textContent = parseFloat(data.totalProgramHours).toFixed(1);

            const rosterContainer = document.getElementById('rosterContainer');
            rosterContainer.innerHTML = data.roster.map(intern => `
                <div class="flex items-center justify-between bg-white p-4 rounded-2xl shadow-sm border border-outline-variant/5 hover:border-primary/20 transition-all group">
                    <div class="flex items-center space-x-4">
                        <div class="relative">
                            <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(intern.full_name)}&background=random&color=fff"
                                 class="w-12 h-12 rounded-full object-cover border-2 border-white shadow-sm" />
                            <span class="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${intern.status === 'online' ? 'bg-green-500' : 'bg-slate-300'}"></span>
                        </div>
                        <div>
                            <p class="font-headline font-bold text-sm text-on-surface group-hover:text-primary transition-colors">${intern.full_name}</p>
                            <p class="font-label text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">${intern.username}</p>
                        </div>
                    </div>
                    <div class="flex flex-col items-end">
                        <span class="text-[9px] font-bold uppercase tracking-widest ${intern.status === 'online' ? 'text-green-600' : 'text-slate-400'} mb-1">
                            ${intern.status === 'online' ? 'Clocked In' : 'Offline'}
                        </span>
                    </div>
                </div>
            `).join('');

            const attendanceActivity = data.recentAttendance.map(log => ({
                ...log,
                displayType: 'Attendance',
                title: log.time_out ? 'Clocked Out' : 'Clocked In',
                detail: log.time_out ? `Worked ${log.total_hours} hrs ${log.ot_hours > 0 ? `(+${log.ot_hours} OT)` : ''}` : `Started at ${log.time_in}`,
                icon: log.time_out ? 'logout' : 'login',
                color: log.time_out ? 'text-orange-600' : 'text-green-600',
                bgColor: log.time_out ? 'bg-orange-50' : 'bg-green-50',
                timestamp: new Date(`${log.date}T${log.time_in || '00:00:00'}`)
            }));

            const taskActivity = data.recentTasks.map(task => ({
                ...task,
                displayType: 'Task',
                title: task.task_category,
                detail: task.description,
                icon: 'task_alt',
                color: 'text-primary',
                bgColor: 'bg-primary/5',
                timestamp: new Date(task.date)
            }));

            const combinedActivity = [...attendanceActivity, ...taskActivity].sort((a, b) => b.timestamp - a.timestamp);

            document.getElementById('activityStreamContainer').innerHTML = combinedActivity.map(act => `
                <div class="bg-white rounded-2xl p-6 shadow-sm border border-outline-variant/10 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden group">
                    <div class="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                        <span class="material-symbols-outlined text-4xl">${act.icon}</span>
                    </div>
                    <div class="flex items-center gap-3 mb-4">
                        <div class="w-8 h-8 rounded-full ${act.bgColor} ${act.color} flex items-center justify-center">
                            <span class="material-symbols-outlined text-sm font-bold">${act.icon}</span>
                        </div>
                        <div>
                            <span class="text-[10px] font-black uppercase tracking-widest ${act.color}">${act.displayType}</span>
                            <p class="text-xs text-on-surface-variant font-bold">${new Date(act.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                        </div>
                    </div>
                    <h4 class="font-headline font-bold text-on-surface mb-2">${act.title}</h4>
                    <p class="text-sm font-label text-on-surface-variant line-clamp-2 mb-4">${act.detail}</p>
                    <div class="flex items-center justify-between pt-4 border-t border-outline-variant/10">
                        <div class="flex items-center gap-2">
                            <div class="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[8px] font-bold">
                                ${act.full_name.split(' ').map(n => n[0]).join('')}
                            </div>
                            <span class="text-xs font-bold text-on-surface">${act.full_name}</span>
                        </div>
                        ${act.status ? `<span class="text-[10px] font-bold uppercase py-1 px-2 rounded bg-slate-100 text-slate-600">${act.status}</span>` : ''}
                    </div>
                </div>
            `).join('');

        } catch (error) {
            console.error('Error loading dashboard:', error);
        }
    }

    loadDashboard();
});

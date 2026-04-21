
        const updateClockUI = () => {
            const btn = document.getElementById('clock-btn');
            const icon = document.getElementById('clock-icon');
            const text = document.getElementById('clock-text');
            const timer = document.getElementById('session-timer');
            const info = document.getElementById('clock-in-info');
            const timeSpan = document.getElementById('clock-in-time');
            const otContainer = document.getElementById('ot-container');
            const otTimer = document.getElementById('ot-timer');

            if (!btn || !timer) return;

            if (isClockedIn) {
                btn.className = "w-32 h-32 rounded-full bg-red-500 text-white flex flex-col items-center justify-center clock-btn-ring hover:scale-105 active:scale-95 transition-all shadow-xl shadow-red-200";
                icon.textContent = "stop_circle";
                text.textContent = "Clock Out";
                info?.classList.remove('hidden');
                
                const hrs = clockInTime.getHours().toString().padStart(2, '0');
                const mins = clockInTime.getMinutes().toString().padStart(2, '0');
                if (timeSpan) timeSpan.textContent = `Clocked in at ${hrs}:${mins}`;

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
                        if (otTimer) otTimer.textContent = `OT Active: ${formatMs(otMs)}`;
                    } else {
                        otContainer?.classList.add('hidden');
                    }
                }, 1000);
            } else {
                btn.className = "w-32 h-32 rounded-full bg-primary text-white flex flex-col items-center justify-center clock-btn-ring hover:scale-105 active:scale-95 transition-all shadow-xl shadow-primary/20";
                icon.textContent = "play_circle";
                text.textContent = "Clock In";
                info?.classList.add('hidden');
                otContainer?.classList.add('hidden');
                timer.textContent = "00:00:00";
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

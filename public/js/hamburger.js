function initHamburgerMenu() {
    const hamburgerBtn = document.getElementById('hamburger-btn');
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');

    if (!hamburgerBtn || !sidebar || !sidebarOverlay) return;

    const closeSidebar = () => {
        sidebar.classList.add('-translate-x-full');
        sidebarOverlay.classList.add('hidden', 'pointer-events-none');
        sidebarOverlay.classList.remove('pointer-events-auto');
    };

    const openSidebar = () => {
        sidebar.classList.remove('-translate-x-full');
        sidebarOverlay.classList.remove('hidden', 'pointer-events-none');
        sidebarOverlay.classList.add('pointer-events-auto');
    };

    hamburgerBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (sidebar.classList.contains('-translate-x-full')) {
            openSidebar();
        } else {
            closeSidebar();
        }
    });

    sidebarOverlay.addEventListener('click', closeSidebar);

    sidebar.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', closeSidebar);
    });
}

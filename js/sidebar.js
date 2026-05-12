// Inclui o template da sidebar em páginas que usam #sidebar-include.
document.addEventListener('DOMContentLoaded', async function() {
    const sidebarDiv = document.getElementById('sidebar-include');
    if (sidebarDiv) {
        try {
            const resp = await fetch('partials/sidebar.html');
            const html = await resp.text();
            sidebarDiv.innerHTML = html;

            const currentPage = window.location.pathname.split('/').pop().split('?')[0].toLowerCase();
            const aliases = {
                'create-server-new.html': 'servers.html',
                'create-server.html': 'servers.html',
                'server-monitoring.html': 'servers.html',
                'site-details.html': 'sites.html',
                'create-site.html': 'sites.html',
                'connect-host.html': 'connections.html',
                'connect-host-aws.html': 'connections.html',
                'connect-host-digitalocean.html': 'connections.html',
                'connect-host-linode.html': 'connections.html',
                'connect-host-vultr.html': 'connections.html'
            };

            const targetPage = aliases[currentPage] || currentPage;
            const navLinks = sidebarDiv.querySelectorAll('.nav-links li a');

            navLinks.forEach((link) => {
                const href = (link.getAttribute('href') || '').split('?')[0].toLowerCase();
                const li = link.closest('li');
                if (!li) return;

                if (href === targetPage) {
                    li.classList.add('active');
                } else {
                    li.classList.remove('active');
                }
            });
        } catch (e) {
            sidebarDiv.innerHTML = '<div style="color:red">Erro ao carregar sidebar</div>';
        }
    }
});

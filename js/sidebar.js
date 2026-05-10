// Inclui o template da sidebar em páginas que usam #sidebar-include.
document.addEventListener('DOMContentLoaded', async function() {
    const sidebarDiv = document.getElementById('sidebar-include');
    if (sidebarDiv) {
        try {
            const resp = await fetch('partials/sidebar.html');
            const html = await resp.text();
            sidebarDiv.innerHTML = html;
        } catch (e) {
            sidebarDiv.innerHTML = '<div style="color:red">Erro ao carregar sidebar</div>';
        }
    }
});

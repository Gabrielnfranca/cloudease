// Inclui a sidebar.html em todas as páginas que tenham <div id="sidebar-include"></div>
document.addEventListener('DOMContentLoaded', async function() {
    const sidebarDiv = document.getElementById('sidebar-include');
    if (sidebarDiv) {
        try {
            const resp = await fetch('sidebar.html');
            const html = await resp.text();
            sidebarDiv.innerHTML = html;
        } catch (e) {
            sidebarDiv.innerHTML = '<div style="color:red">Erro ao carregar sidebar</div>';
        }
    }
});

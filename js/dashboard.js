document.addEventListener('DOMContentLoaded', function() {
    updateDashboard();

    // Atualiza a cada 30 segundos
    setInterval(updateDashboard, 30000);
});

async function updateDashboard() {
    const token = localStorage.getItem('authToken');
    if (!token) return;

    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };

    try {
        const [connRes, serversRes, sitesRes] = await Promise.all([
            fetch('/api/providers', { headers }),
            fetch('/api/servers', { headers }),
            fetch('/api/sites', { headers })
        ]);

        if (connRes.ok) {
            const providers = await connRes.json();
            const count = Array.isArray(providers) ? providers.length : 0;
            setElementValue('total-connections', count);
        }

        if (serversRes.ok) {
            const servers = await serversRes.json();
            let serverCount = 0;
            if (Array.isArray(servers)) {
                serverCount = servers.length;
            } else if (servers && servers.servers) {
                 serverCount = servers.servers.length;
            }
            setElementValue('total-servers', serverCount);
        }

        if (sitesRes.ok) {
            const sites = await sitesRes.json();
            if (Array.isArray(sites)) {
                // Conta sites ativos (active, provisioned)
                const siteCount = sites.filter(s => s.status === 'active' || s.status === 'provisioned').length;
                setElementValue('total-sites', siteCount);

                // Conta SSL ativos
                const sslCount = sites.filter(s => s.ssl_active === true).length;
                setElementValue('total-ssl', sslCount);
            } else {
                setElementValue('total-sites', 0);
                setElementValue('total-ssl', 0);
            }
        }

    } catch (error) {
        console.error('Erro ao atualizar dashboard:', error);
    }
}

function setElementValue(id, value) {
    const obj = document.getElementById(id);
    if (obj) {
        obj.textContent = value;
    }
}

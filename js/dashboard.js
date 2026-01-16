document.addEventListener('DOMContentLoaded', function() {
    console.log('Dashboard script loaded');
    updateDashboard();

    // Atualiza a cada 30 segundos
    setInterval(updateDashboard, 30000);
});

async function updateDashboard() {
    const token = localStorage.getItem('authToken');
    if (!token) {
        console.log('No token found');
        return;
    }

    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };

    console.log('Fetching dashboard data...');

    // Helper to fetch and return json or null efficiently
    const fetchJson = async (url) => {
        try {
            const res = await fetch(url, { headers });
            if (!res.ok) throw new Error(`Status ${res.status}`);
            return await res.json();
        } catch (e) {
            console.error(`Error fetching ${url}:`, e);
            return null;
        }
    };

    // Parallel fetch with individual error handling handling implicitly via helper
    const [providers, servers, sites] = await Promise.all([
        fetchJson('/api/providers'),
        fetchJson('/api/servers'),
        fetchJson('/api/sites')
    ]);

    // Update Connections
    if (providers && Array.isArray(providers)) {
        setElementValue('total-connections', providers.length);
    }

    // Update Servers
    if (servers) {
        let serverCount = 0;
        if (Array.isArray(servers)) {
            serverCount = servers.length;
        } else if (servers.servers) {
             serverCount = servers.servers.length;
        }
        setElementValue('total-servers', serverCount);
    }

    // Update Sites & SSL
    if (sites && Array.isArray(sites)) {
        // Conta sites ativos (active, provisioned)
        const siteCount = sites.filter(s => s.status === 'active' || s.status === 'provisioned').length;
        setElementValue('total-sites', siteCount);

        // Conta SSL ativos (verifica se ssl_active é true)
        const sslCount = sites.filter(s => s.ssl_active === true).length;
        setElementValue('total-ssl', sslCount);
    }
}

function setElementValue(id, value) {
    const obj = document.getElementById(id);
    if (obj) {
        obj.textContent = value;
        // Adiciona uma animação visual simples indicando atualização
        obj.style.opacity = '0.5';
        setTimeout(() => obj.style.opacity = '1', 200);
    } else {
        console.warn(`Element with id ${id} not found`);
    }
}

document.addEventListener('DOMContentLoaded', function() {
    // Elementos do DOM
    const newConnectionBtn = document.querySelector('.new-site-btn');
    const searchInput = document.querySelector('.search-bar input');
    const filterBtn = document.querySelector('.filter-btn');
    const tableBody = document.querySelector('.connections-table tbody');

    // Carregar conexões ao iniciar
    loadConnections();

    async function loadConnections() {
        try {
            tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Carregando...</td></tr>';
            
            const response = await fetch('/api/get-providers');
            if (!response.ok) throw new Error('Falha ao buscar conexões');
            
            const connections = await response.json();
            renderConnections(connections);
        } catch (error) {
            console.error('Erro:', error);
            tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center; color: red;">Erro ao carregar conexões.</td></tr>';
        }
    }

    function renderConnections(connections) {
        tableBody.innerHTML = '';
        
        if (connections.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Nenhuma conexão encontrada.</td></tr>';
            return;
        }

        connections.forEach(conn => {
            const row = document.createElement('tr');
            const date = new Date(conn.created_at).toLocaleDateString('pt-BR');
            
            // Formatar nome do provedor
            const providerName = conn.provider.charAt(0).toUpperCase() + conn.provider.slice(1);
            let providerIcon = 'fa-server';
            if (conn.provider === 'vultr') providerIcon = 'fa-server'; // Pode adicionar ícones específicos se tiver
            if (conn.provider === 'digitalocean') providerIcon = 'fa-cloud';

            row.innerHTML = `
                <td><i class="fas ${providerIcon}"></i> ${providerName}</td>
                <td>${conn.name}</td>
                <td>${conn.ip_address}</td>
                <td>${conn.total_servers}</td>
                <td>${date}</td>
                <td><span class="status-badge active">${conn.status}</span></td>
                <td>
                    <button class="action-btn" title="Configurações"><i class="fas fa-cog"></i></button>
                    <button class="action-btn" title="Sincronizar"><i class="fas fa-sync"></i></button>
                    <button class="action-btn delete-btn" title="Remover" data-id="${conn.id}"><i class="fas fa-trash"></i></button>
                </td>
            `;
            tableBody.appendChild(row);
        });

        // Re-anexar listeners de ação
        attachActionListeners();
    }

    function attachActionListeners() {
        document.querySelectorAll('.action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.currentTarget.getAttribute('title');
                const row = e.currentTarget.closest('tr');
                const connectionName = row.querySelector('td:nth-child(2)').textContent;

                if (action === 'Remover') {
                    if (confirm(`Deseja remover a conexão ${connectionName}?`)) {
                        // Implementar remoção via API futuramente
                        alert('Funcionalidade de remoção em breve.');
                    }
                } else if (action === 'Configurações') {
                    console.log(`Abrir configurações para: ${connectionName}`);
                } else if (action === 'Sincronizar') {
                    console.log(`Sincronizando ${connectionName}`);
                }
            });
        });
    }

    // Redirecionar para a página de Conectar Host
    newConnectionBtn.addEventListener('click', () => {
        window.location.href = 'connect-host.html';
    });

    // Busca em tempo real
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const rows = document.querySelectorAll('.connections-table tbody tr');

        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(searchTerm) ? '' : 'none';
        });
    });

    // Botão de filtro (placeholder - a ser implementado conforme necessidade)
    filterBtn.addEventListener('click', () => {
        console.log('Implementar funcionalidade de filtro');
    });
});

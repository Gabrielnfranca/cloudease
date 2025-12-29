document.addEventListener('DOMContentLoaded', function() {
    // Função para carregar servidores da API
    async function loadServers() {
        try {
            // Tenta buscar da API (vai funcionar no Vercel ou localmente se tiver ambiente Node configurado)
            const response = await fetch('/api/servers');
            if (!response.ok) throw new Error('Falha na API');
            const servers = await response.json();
            renderServers(servers);
        } catch (error) {
            console.log('API não disponível ou erro:', error);
            renderServers([]);
        }
    }

    function renderServers(servers) {
        const tbody = document.querySelector('.servers-table tbody');
        if (!tbody) return;
        
        tbody.innerHTML = ''; // Limpa a tabela atual

        if (servers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 20px;">Nenhum servidor encontrado.</td></tr>';
            return;
        }

        servers.forEach((server, index) => {
            const tr = document.createElement('tr');
            
            // Status Badge Logic
            let statusClass = 'status-active';
            let statusText = 'Ativo';
            if (server.status === 'creating' || server.status === 'new') {
                statusClass = 'status-warning'; // Você precisará definir essa classe no CSS se não existir
                statusText = 'Criando...';
            } else if (server.status === 'off' || server.status === 'stopped') {
                statusClass = 'status-inactive';
                statusText = 'Parado';
            }

            tr.innerHTML = `
                <td>
                    <div class="server-info">
                        <img src="${server.logo}" alt="${server.provider}" class="provider-icon" style="width: 24px; height: 24px; margin-right: 10px;">
                        <div>
                            <div class="server-name" style="font-weight: bold;">${server.name}</div>
                            <div class="server-provider" style="font-size: 12px; color: #718096;">${server.provider}</div>
                        </div>
                    </div>
                </td>
                <td>
                    <div class="ip-address">
                        ${server.ipv4 || '<span style="color: #cbd5e0;">Pendente</span>'}
                    </div>
                </td>
                <td>
                    <div class="location">
                        <i class="fas fa-map-marker-alt" style="color: #a0aec0; margin-right: 5px;"></i>
                        ${server.region}
                    </div>
                </td>
                <td>
                    <div class="specs" style="font-size: 13px;">
                        <span title="CPU"><i class="fas fa-microchip"></i> ${server.cpu}</span>
                        <span title="RAM" style="margin-left: 8px;"><i class="fas fa-memory"></i> ${server.ram}</span>
                        <span title="Disco" style="margin-left: 8px;"><i class="fas fa-hdd"></i> ${server.storage}</span>
                    </div>
                </td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td>
                    <div class="actions">
                        <button class="action-btn" title="Console"><i class="fas fa-terminal"></i></button>
                        <button class="action-btn" title="Reiniciar"><i class="fas fa-sync-alt"></i></button>
                        <button class="action-btn" title="Configurações"><i class="fas fa-cog"></i></button>
                    </div>
                </td>
            `;
            
            // Adiciona eventos
            tr.addEventListener('click', () => selectServer(server));
            const configBtn = tr.querySelector('.action-btn[title="Configurações"]');
            if(configBtn) {
                configBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    selectServer(server);
                });
            }

            tbody.appendChild(tr);
        });
    }

    // Função para selecionar um servidor e redirecionar
    function selectServer(server) {
        // Armazena os dados do servidor selecionado
        localStorage.setItem('selectedServer', JSON.stringify(server));
        // Redireciona para a página de gerenciamento
        window.location.href = 'gerenciar-servidores.html';
    }

    // Iniciar carregamento
    loadServers();
});

document.addEventListener('DOMContentLoaded', function() {
    // Função para carregar servidores da API
    async function loadServers() {
        try {
            // Tenta buscar da API (vai funcionar no Vercel ou localmente se tiver ambiente Node configurado)
            // Se estiver apenas abrindo o HTML localmente, isso pode falhar, então mantemos um fallback ou aviso
            const response = await fetch('/api/servers');
            if (!response.ok) throw new Error('Falha na API');
            const servers = await response.json();
            renderServers(servers);
        } catch (error) {
            console.log('API não disponível, usando dados locais de fallback ou erro:', error);
            // Fallback para dados locais se a API falhar (útil para testes locais sem servidor)
            const localServers = [
                {
                    provider: 'Local',
                    name: 'Servidor Demo (Sem API)',
                    logo: 'assets/images/server-icon.png',
                    cpu: '1 vCPU',
                    ram: '1 GB',
                    storage: '20 GB',
                    transfer: '1 TB',
                    os: 'Ubuntu',
                    region: 'Local',
                    plan: 'Demo',
                    ipv4: '127.0.0.1',
                    ipv6: '::1',
                    services: { nginx: true }
                }
            ];
            renderServers(localServers);
        }
    }

    function renderServers(servers) {
        const tbody = document.querySelector('.servers-table tbody');
        if (!tbody) return;
        
        tbody.innerHTML = ''; // Limpa a tabela atual

        servers.forEach((server, index) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <div class="server-info">
                        <img src="${server.logo}" alt="${server.provider}" class="provider-icon">
                        <div>
                            <div class="server-name">${server.name}</div>
                            <div class="server-ip">${server.ipv4}</div>
                        </div>
                    </div>
                </td>
                <td>
                    <div class="location">
                        <i class="fas fa-map-marker-alt"></i>
                        ${server.region}
                    </div>
                </td>
                <td>
                    <div class="specs">
                        <span>${server.cpu}</span>
                        <span>${server.ram}</span>
                        <span>${server.storage}</span>
                    </div>
                </td>
                <td><span class="status-badge status-active">Ativo</span></td>
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

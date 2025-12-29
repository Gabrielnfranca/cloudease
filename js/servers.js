document.addEventListener('DOMContentLoaded', function() {
    // Botão de Sincronizar
    const syncBtn = document.getElementById('syncServersBtn');
    if (syncBtn) {
        syncBtn.addEventListener('click', async function() {
            const originalText = syncBtn.innerHTML;
            syncBtn.disabled = true;
            syncBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sincronizando...';
            
            try {
                const authToken = localStorage.getItem('authToken');
                const response = await fetch('/api/servers?sync=true', {
                    headers: {
                        'Authorization': `Bearer ${authToken}`
                    }
                });
                if (response.ok) {
                    loadServers(); // Recarrega a lista
                } else {
                    alert('Erro ao sincronizar servidores.');
                }
            } catch (error) {
                console.error('Erro:', error);
                alert('Erro de conexão.');
            } finally {
                syncBtn.disabled = false;
                syncBtn.innerHTML = originalText;
            }
        });
    }

    // Função para carregar servidores da API
    async function loadServers() {
        try {
            // Tenta buscar da API (vai funcionar no Vercel ou localmente se tiver ambiente Node configurado)
            const authToken = localStorage.getItem('authToken');
            const response = await fetch('/api/servers', {
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            });
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
            let statusHtml = '';
            let statusClass = 'status-active';
            let statusText = 'Ativo';

            // Calcula tempo desde a criação
            const createdAt = new Date(server.created_at);
            const now = new Date();
            const diffMs = now - createdAt;
            const diffMinutes = diffMs / 60000; // Diferença em minutos

            // Se o servidor tem menos de 5 minutos, mostra barra de progresso
            if (diffMinutes < 5 && (server.status === 'active' || server.status === 'creating' || server.status === 'new')) {
                const percent = Math.min(100, Math.round((diffMinutes / 5) * 100));
                let stepText = 'Iniciando...';
                if (percent > 10) stepText = 'Provisionando VM...';
                if (percent > 30) stepText = 'Instalando Dependências...';
                if (percent > 60) stepText = 'Configurando Servidor...';
                if (percent > 90) stepText = 'Finalizando...';

                statusHtml = `
                    <div class="status-container">
                        <span class="status-badge status-warning" style="background: #ebf8ff; color: #2b6cb0;">Instalando ${percent}%</span>
                        <div class="installation-progress">
                            <div class="progress-bar-fill" style="width: ${percent}%"></div>
                        </div>
                        <span class="status-text">${stepText}</span>
                    </div>
                `;
            } else {
                // Lógica padrão de status
                if (server.status === 'creating' || server.status === 'new') {
                    statusClass = 'status-warning';
                    statusText = 'Criando...';
                } else if (server.status === 'off' || server.status === 'stopped') {
                    statusClass = 'status-inactive';
                    statusText = 'Parado';
                }
                statusHtml = `<span class="status-badge ${statusClass}">${statusText}</span>`;
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
                <td>${statusHtml}</td>
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

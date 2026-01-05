document.addEventListener('DOMContentLoaded', function() {
    let pollingInterval = null;

    // Botão de Sincronizar
    const syncBtn = document.getElementById('syncServersBtn');
    if (syncBtn) {
        syncBtn.addEventListener('click', () => syncServers(false));
    }

    // Carregar servidores ao iniciar
    loadServers();

    // Função unificada de sincronização
    async function syncServers(isAuto = false) {
        if (!isAuto) {
            syncBtn.disabled = true;
            syncBtn.classList.add('loading');
            syncBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Sincronizando...';
        }

        try {
            const authToken = localStorage.getItem('authToken');
            const response = await fetch('/api/servers?sync=true', {
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            });
            
            if (response.ok) {
                await loadServers(); // Recarrega a lista
            } else {
                if (!isAuto) {
                    const data = await response.json();
                    alert('Erro ao sincronizar: ' + (data.error || 'Erro desconhecido'));
                }
            }
        } catch (error) {
            console.error('Erro:', error);
            if (!isAuto) alert('Erro de conexão.');
        } finally {
            if (!isAuto) {
                syncBtn.disabled = false;
                syncBtn.classList.remove('loading');
                syncBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Sincronizar';
            }
        }
    }

    // Função para carregar servidores da API
    async function loadServers() {
        try {
            const authToken = localStorage.getItem('authToken');
            const response = await fetch('/api/servers', {
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            });
            if (!response.ok) throw new Error('Falha na API');
            const servers = await response.json();
            renderServers(servers);
            
            // Verifica se precisa continuar polling
            checkPolling(servers);
        } catch (error) {
            console.log('API não disponível ou erro:', error);
            renderServers([]);
        }
    }

    function checkPolling(servers) {
        const hasPending = servers.some(s => 
            s.status === 'creating' || 
            s.status === 'new' || 
            s.status === 'pending' ||
            s.status === 'unknown'
        );

        if (hasPending) {
            if (!pollingInterval) {
                console.log('Iniciando auto-refresh de servidores...');
                pollingInterval = setInterval(() => syncServers(true), 10000); // Poll a cada 10s
            }
        } else {
            if (pollingInterval) {
                console.log('Todos os servidores ativos. Parando auto-refresh.');
                clearInterval(pollingInterval);
                pollingInterval = null;
            }
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

            // Lógica de Progresso:
            // Se status NÃO for active/running, mostra barra de progresso
            // Se status FOR active, assume 100% concluído
            const isProvisioning = server.status === 'creating' || server.status === 'new' || server.status === 'pending';
            
            if (isProvisioning) {
                // Simula progresso baseado no tempo (max 2 minutos para provisionar VM)
                // Se passar de 2 min e ainda estiver creating, trava em 90%
                let percent = Math.min(90, Math.round((diffMinutes / 2) * 100));
                if (percent < 5) percent = 5; // Mínimo visual

                let stepText = 'Provisionando...';
                if (percent > 30) stepText = 'Alocando IP...';
                if (percent > 60) stepText = 'Iniciando Sistema...';
                if (percent >= 90) stepText = 'Finalizando...';

                statusHtml = `
                    <div class="status-container">
                        <span class="status-badge status-warning" style="background: #ebf8ff; color: #2b6cb0; margin-bottom: 4px; display: inline-block;">${stepText} ${percent}%</span>
                        <div class="installation-progress" style="height: 6px; background: #edf2f7; border-radius: 3px; overflow: hidden;">
                            <div class="progress-bar-fill" style="width: ${percent}%; height: 100%; background: #4299e1; transition: width 0.5s ease;"></div>
                        </div>
                    </div>
                `;
            } else {
                // Status Real
                if (server.status === 'active' || server.status === 'running') {
                    statusClass = 'status-active';
                    statusText = 'Ativo';
                } else if (server.status === 'off' || server.status === 'stopped') {
                    statusClass = 'status-inactive';
                    statusText = 'Parado';
                } else {
                    statusClass = 'status-warning'; // Unknown ou outros
                    statusText = server.status;
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
                <td><span class="badge-sites" style="background-color: #edf2f7; color: #4a5568; padding: 4px 8px; border-radius: 12px; font-size: 12px; font-weight: 600;">${server.sites_count || 0} sites</span></td>
                <td>${statusHtml}</td>
                <td>
                    <div class="actions">
                        <button class="action-btn" title="Console"><i class="fas fa-terminal"></i></button>
                        <button class="action-btn" title="Reiniciar"><i class="fas fa-sync-alt"></i></button>
                        <button class="action-btn delete-btn" title="Excluir Servidor" onclick="deleteServer(${server.id}, '${server.name}')" style="color: #e53e3e;"><i class="fas fa-trash"></i></button>
                    </div>
                </td>
            `;
            
            tbody.appendChild(tr);
        });
    }

    window.deleteServer = async function(id, name) {
        if (!confirm(`Tem certeza que deseja excluir o servidor "${name}"? \n\nEsta ação é irreversível e apagará todos os sites e dados hospedados nele.`)) {
            return;
        }

        const btn = document.querySelector(`button[onclick="deleteServer(${id}, '${name}')"]`);
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        }

        try {
            const authToken = localStorage.getItem('authToken');
            const response = await fetch(`/api/servers?id=${id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            });

            const data = await response.json();

            if (response.ok) {
                alert('Servidor excluído com sucesso!');
                loadServers();
            } else {
                alert('Erro ao excluir: ' + (data.error || 'Erro desconhecido'));
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fas fa-trash"></i>';
                }
            }
        } catch (error) {
            console.error('Erro:', error);
            alert('Erro de conexão ao tentar excluir.');
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-trash"></i>';
            }
        }
    };

    function selectServer(server) {
        console.log('Selecionado:', server);
        // Implementar lógica de seleção se necessário
    }
});

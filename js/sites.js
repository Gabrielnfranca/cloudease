document.addEventListener('DOMContentLoaded', function() {
    loadSites();
    
    // Polling para atualizar status
    setInterval(() => {
        const hasPending = document.querySelector('.ssl-badge.warning');
        if (hasPending) {
            loadSites(true); // true = silent reload
        }
    }, 10000);

    // Elementos de busca
    const searchInput = document.querySelector('.search-bar input');
    if (searchInput) {
        searchInput.addEventListener('input', function(e) {
            const searchTerm = e.target.value.toLowerCase();
            const rows = document.querySelectorAll('.sites-table tbody tr');

            rows.forEach(row => {
                const text = row.textContent.toLowerCase();
                row.style.display = text.includes(searchTerm) ? '' : 'none';
            });
        });
    }

    async function loadSites(silent = false) {
        const tbody = document.querySelector('.sites-table tbody');
        if (!tbody) return;

        try {
            if (!silent) {
                tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 20px;">Carregando sites...</td></tr>';
            }

            const authToken = localStorage.getItem('authToken');
            const response = await fetch('/api/sites', {
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            });
            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'Falha na API: ' + response.status);
            }
            
            const sites = await response.json();
            renderSites(sites);
        } catch (error) {
            console.error('Erro:', error);
            if (!silent) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="7" style="text-align:center; padding: 20px; color: red;">
                            <p>Erro ao carregar sites.</p>
                            <small style="color: #718096;">${error.message}</small>
                            <br><br>
                            <button onclick="repairDatabase()" class="action-btn" style="background: #e53e3e; color: white;">
                                <i class="fas fa-tools"></i> Tentar Reparar Banco de Dados
                            </button>
                        </td>
                    </tr>
                `;
            }
        }
    }

    window.repairDatabase = async function() {
        if(!confirm("Isso tentará rodar as migrações pendentes. Continuar?")) return;
        try {
            const btn = document.querySelector('button[onclick="repairDatabase()"]');
            if(btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Reparando...';
            
            const res = await fetch('/api/migrate');
            const data = await res.json();
            
            alert('Resultado: ' + (data.message || JSON.stringify(data)));
            loadSites();
        } catch(e) {
            alert('Erro ao tentar reparar: ' + e.message);
        }
    };

    window.retryProvision = async function(siteId) {
        if (!confirm('Deseja tentar instalar novamente?')) return;
        
        try {
            const response = await fetch('/api/sites', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ siteId })
            });
            
            if (response.ok) {
                alert('Re-tentativa iniciada!');
                loadSites();
            } else {
                alert('Erro ao iniciar re-tentativa.');
            }
        } catch (e) {
            alert('Erro de conexão.');
        }
    };

    window.updateNginx = async function(siteId) {
        if (!confirm('Deseja atualizar a configuração do Nginx (ativar link provisório)?')) return;
        
        try {
            const response = await fetch('/api/sites', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ siteId, action: 'update_nginx' })
            });
            
            if (response.ok) {
                alert('Configuração atualizada com sucesso!');
                loadSites();
            } else {
                const data = await response.json();
                alert('Erro: ' + (data.error || 'Falha ao atualizar'));
            }
        } catch (e) {
            alert('Erro de conexão.');
        }
    };

    window.deleteSite = async function(siteId, domain) {
        if (!confirm(`Tem certeza que deseja excluir o site ${domain}? \n\nTodos os arquivos e banco de dados serão apagados permanentemente.`)) {
            return;
        }

        const btn = document.querySelector(`button[onclick="deleteSite(${siteId}, '${domain}')"]`);
        if (btn) {
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            btn.disabled = true;
        }

        try {
            const response = await fetch(`/api/sites?id=${siteId}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                alert('Site excluído com sucesso!');
                loadSites();
            } else {
                const data = await response.json();
                alert('Erro ao excluir: ' + (data.error || 'Erro desconhecido'));
                if (btn) {
                    btn.innerHTML = '<i class="fas fa-trash"></i>';
                    btn.disabled = false;
                }
            }
        } catch (error) {
            console.error('Erro:', error);
            alert('Erro de conexão.');
            if (btn) {
                btn.innerHTML = '<i class="fas fa-trash"></i>';
                btn.disabled = false;
            }
        }
    };

    function renderSites(sites) {
        const tbody = document.querySelector('.sites-table tbody');
        tbody.innerHTML = '';

        if (sites.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align:center; padding: 40px;">
                        <div style="display: flex; flex-direction: column; align-items: center; gap: 10px; color: #718096;">
                            <i class="fas fa-globe" style="font-size: 48px; color: #cbd5e0;"></i>
                            <p>Nenhum site criado ainda.</p>
                            <button class="new-site-btn" onclick="window.location.href='create-site.html'" style="font-size: 14px; padding: 8px 16px; background-color: #4299e1; color: white; border: none; border-radius: 4px; cursor: pointer;">
                                Criar meu primeiro site
                            </button>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        sites.forEach(site => {
            const tr = document.createElement('tr');
            
            // Ícone da plataforma
            let iconHtml = '';
            if (site.platform === 'wordpress') {
                iconHtml = `<i class="fab fa-wordpress" style="color: #21759b; font-size: 20px; margin-right: 8px;"></i>`;
            } else if (site.platform === 'html') {
                iconHtml = `<i class="fab fa-html5" style="color: #e34f26; font-size: 20px; margin-right: 8px;"></i>`;
            } else {
                iconHtml = `<i class="fab fa-php" style="color: #777bb3; font-size: 20px; margin-right: 8px;"></i>`;
            }

            // Status Badge
            let statusClass = 'active';
            let statusText = 'Ativo';
            let statusIcon = '<i class="fas fa-check-circle"></i>';
            let retryBtn = '';
            
            if (site.status === 'provisioning') {
                statusClass = 'warning';
                statusText = 'Criando...';
                statusIcon = '<i class="fas fa-spinner fa-spin"></i>';

                // Verifica se está demorando muito (> 5 minutos)
                if (site.created_at_iso) {
                    const created = new Date(site.created_at_iso);
                    const now = new Date();
                    const diffMinutes = (now - created) / 1000 / 60;
                    
                    if (diffMinutes > 5) {
                        statusClass = 'danger';
                        statusText = 'Tempo Excedido';
                        statusIcon = '<i class="fas fa-clock"></i>';
                        // Garante que o botão de retry apareça mesmo em timeout
                        retryBtn = `<button class="action-btn" title="Tentar Novamente" onclick="retryProvision(${site.id})" style="color: #e53e3e;"><i class="fas fa-redo"></i></button>`;
                    }
                }
            } else if (site.status === 'error') {
                statusClass = 'danger';
                statusText = 'Erro';
                statusIcon = '<i class="fas fa-exclamation-circle"></i>';
                retryBtn = `<button class="action-btn" title="Tentar Novamente" onclick="retryProvision(${site.id})" style="color: #e53e3e;"><i class="fas fa-redo"></i></button>`;
                
                if (site.last_error) {
                    const errorMsg = site.last_error.replace(/"/g, '&quot;');
                    statusText = `<span title="${errorMsg}" style="cursor: help; border-bottom: 1px dotted rgba(255,255,255,0.5);">Erro</span>`;
                    // Adiciona um botão de info se houver erro
                    retryBtn = `<button class="action-btn" title="${errorMsg}" onclick="alert('${errorMsg.replace(/'/g, "\\'")}')" style="color: #e53e3e; margin-right: 5px;"><i class="fas fa-info-circle"></i></button>` + retryBtn;
                }
            }

            // Adiciona classe para estilização e evento de clique na linha
            tr.classList.add('clickable-row');
            tr.onclick = (e) => {
                // Previne navegação se o clique foi em um botão ou link dentro da linha
                if (e.target.closest('a') || e.target.closest('button')) return;
                window.location.href = `site-details.html?id=${site.id}`;
            };

            tr.innerHTML = `
                <td>
                    <div style="display: flex; align-items: center;">
                        ${iconHtml}
                        ${site.platformLabel}
                    </div>
                </td>
                <td>
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                        <span style="font-weight: 600; color: #2d3748;">${site.domain}</span>
                    </div>
                </td>
                <td>
                    <span class="ssl-badge active" title="SSL Ativo"><i class="fas fa-lock"></i> Seguro</span>
                </td>
                <td>${site.server}</td>
                <td>${site.ip}</td>
                <td>
                    <span class="ssl-badge ${statusClass}">
                        ${statusIcon} ${statusText}
                    </span>
                </td>
                <td>${site.created_at}</td>
                <td class="actions">
                    <div style="display: flex; gap: 5px; justify-content: flex-end;">
                        ${retryBtn}
                        <button class="action-btn delete-btn" title="Excluir" onclick="deleteSite(${site.id}, '${site.domain}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }
});

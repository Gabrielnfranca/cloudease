document.addEventListener('DOMContentLoaded', function() {
    loadSites();

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

    async function loadSites() {
        const tbody = document.querySelector('.sites-table tbody');
        if (!tbody) return;

        try {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 20px;">Carregando sites...</td></tr>';

            const response = await fetch('/api/sites');
            if (!response.ok) throw new Error('Falha na API');
            
            const sites = await response.json();
            renderSites(sites);
        } catch (error) {
            console.error('Erro:', error);
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 20px; color: red;">Erro ao carregar sites.</td></tr>';
        }
    }

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
            
            if (site.status === 'provisioning') {
                statusClass = 'warning';
                statusText = 'Criando...';
                statusIcon = '<i class="fas fa-spinner fa-spin"></i>';
            } else if (site.status === 'error') {
                statusClass = 'danger';
                statusText = 'Erro';
                statusIcon = '<i class="fas fa-exclamation-circle"></i>';
            }

            tr.innerHTML = `
                <td>
                    <div style="display: flex; align-items: center;">
                        ${iconHtml}
                        ${site.platformLabel}
                    </div>
                </td>
                <td>
                    <a href="http://${site.domain}" target="_blank" style="color: #4299e1; text-decoration: none; font-weight: 500;">
                        ${site.domain} <i class="fas fa-external-link-alt" style="font-size: 12px;"></i>
                    </a>
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
                    <button class="action-btn" title="Gerenciar"><i class="fas fa-cog"></i></button>
                    <button class="action-btn" title="Arquivos"><i class="fas fa-folder"></i></button>
                    <button class="action-btn delete-btn" title="Excluir"><i class="fas fa-trash"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }
});

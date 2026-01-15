document.addEventListener('DOMContentLoaded', function() {
    const searchInput = document.querySelector('.search-bar input');
    const newDomainBtn = document.querySelector('.new-site-btn');
    const modal = document.getElementById('newDomainModal');
    const closeModalBtn = document.querySelector('.close-modal');
    const cancelBtn = document.querySelector('.cancel-btn');
    const domainForm = document.getElementById('newDomainForm');
    const domainsTable = document.querySelector('.domains-table tbody');

    // Carregar domínios ao iniciar
    loadDomains();

    // Funções de busca
    if (searchInput) {
        searchInput.addEventListener('input', function(e) {
            const searchTerm = e.target.value.toLowerCase();
            const rows = domainsTable.querySelectorAll('tr');
            rows.forEach(row => {
                const text = row.textContent.toLowerCase();
                row.style.display = text.includes(searchTerm) ? '' : 'none';
            });
        });
    }

    // Modal
    if (newDomainBtn && modal) {
        function openModal() { modal.style.display = 'block'; }
        function closeModal() { 
            modal.style.display = 'none'; 
            domainForm.reset(); 
        }

        newDomainBtn.addEventListener('click', openModal);
        if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
        if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
        window.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    }

    // Criar Domínio
    if (domainForm) {
        domainForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const submitBtn = domainForm.querySelector('.btn-primary');
            const originalText = submitBtn.textContent;
            submitBtn.textContent = 'Salvando...';
            submitBtn.disabled = true;

            const domainData = {
                domain: document.getElementById('domainName').value,
                registrar: document.getElementById('registrar').value,
                // dns: document.getElementById('dnsProvider').value, // API doesn't support yet, saving mainly domain
            };

            try {
                const authToken = localStorage.getItem('authToken');
                const response = await fetch('/api/domains', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${authToken}`
                    },
                    body: JSON.stringify(domainData)
                });

                if (response.ok) {
                    await loadDomains();
                    closeModal();
                } else {
                    const error = await response.json();
                    alert('Erro ao criar domínio: ' + (error.error || 'Erro desconhecido'));
                }
            } catch (err) {
                console.error(err);
                alert('Erro de conexão');
            } finally {
                submitBtn.textContent = originalText;
                submitBtn.disabled = false;
            }
        });
    }

    // Carregar da API
    async function loadDomains() {
        if (!domainsTable) return;
        
        domainsTable.innerHTML = '<tr><td colspan="6" style="text-align:center">Carregando...</td></tr>';

        try {
            const authToken = localStorage.getItem('authToken');
            const response = await fetch('/api/domains', {
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            });

            if (response.ok) {
                const domains = await response.json();
                renderDomains(domains);
            } else {
                domainsTable.innerHTML = '<tr><td colspan="6" style="text-align:center; color:red">Erro ao carregar domínios</td></tr>';
            }
        } catch (error) {
            console.error('Erro:', error);
            domainsTable.innerHTML = '<tr><td colspan="6" style="text-align:center; color:red">Erro de conexão</td></tr>';
        }
    }

    function renderDomains(domains) {
        domainsTable.innerHTML = '';
        if (domains.length === 0) {
            domainsTable.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px;">Nenhum domínio cadastrado.</td></tr>';
            return;
        }

        domains.forEach(d => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${d.domain}</td>
                <td>${d.registrar || '-'}</td>
                <td>-</td>
                <td>${new Date(d.created_at).toLocaleDateString()}</td>
                <td><span class="status-badge active">Ativo</span></td>
                <td class="actions">
                    <button class="action-btn" title="Configurações"><i class="fas fa-cog"></i></button>
                </td>
            `;
            domainsTable.appendChild(tr);
        });
    }
});

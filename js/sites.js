document.addEventListener('DOMContentLoaded', function() {
    // Elementos do DOM
    const searchInput = document.querySelector('.search-bar input');
    const filterBtn = document.querySelector('.filter-btn');
    const newSiteBtn = document.querySelector('.new-site-btn');
    const modal = document.getElementById('newSiteModal');
    const closeModalBtn = document.querySelector('.close-modal');
    const cancelBtn = document.querySelector('.cancel-btn');
    const siteForm = document.getElementById('newSiteForm');
    const sitesTable = document.querySelector('.sites-table tbody');

    // Funções de busca
    searchInput.addEventListener('input', function(e) {
        const searchTerm = e.target.value.toLowerCase();
        const rows = sitesTable.querySelectorAll('tr');

        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(searchTerm) ? '' : 'none';
        });
    });

    // Funções do modal
    function openModal() {
        modal.style.display = 'block';
    }

    function closeModal() {
        modal.style.display = 'none';
        siteForm.reset();
    }

    newSiteBtn.addEventListener('click', openModal);
    closeModalBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);

    // Fechar modal ao clicar fora dele
    window.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeModal();
        }
    });

    // Manipulação do formulário
    siteForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const newSite = {
            domain: document.getElementById('siteDomain').value,
            platform: document.getElementById('platform').value,
            server: document.getElementById('serverSelect').value,
            ssl: document.getElementById('sslType').value
        };

        // Aqui você pode adicionar a lógica para enviar os dados para o servidor
        console.log('Novo site:', newSite);

        // Obter informações do servidor selecionado
        const serverOption = document.getElementById('serverSelect').selectedOptions[0];
        const serverInfo = serverOption.text.match(/(.*?)\s*\((.*?)\)/);
        const serverName = serverInfo[1];
        const serverIP = serverInfo[2];

        // Obter logo da plataforma
        const platformLogos = {
            wordpress: 'https://wordpress.org/favicon.ico',
            drupal: 'https://www.drupal.org/favicon.ico',
            joomla: 'https://www.joomla.org/favicon.ico',
            custom: 'https://via.placeholder.com/20'
        };

        // Adicionar nova linha na tabela
        const newRow = document.createElement('tr');
        newRow.innerHTML = `
            <td>
                <img src="${platformLogos[newSite.platform]}" alt="${newSite.platform}" class="platform-logo">
                ${newSite.platform.charAt(0).toUpperCase() + newSite.platform.slice(1)}
            </td>
            <td>${newSite.domain}</td>
            <td><span class="ssl-badge active">Ativo</span></td>
            <td>${serverName}</td>
            <td>${serverIP}</td>
            <td>${new Date().toLocaleDateString()}</td>
            <td class="actions">
                <button class="action-btn" title="Acessar"><i class="fas fa-external-link-alt"></i></button>
                <button class="action-btn" title="Configurações"><i class="fas fa-cog"></i></button>
                <button class="action-btn" title="Renovar SSL"><i class="fas fa-shield-alt"></i></button>
            </td>
        `;

        sitesTable.appendChild(newRow);
        closeModal();
    });

    // Ações dos sites
    sitesTable.addEventListener('click', function(e) {
        const actionBtn = e.target.closest('.action-btn');
        if (!actionBtn) return;

        const action = actionBtn.title;
        const row = actionBtn.closest('tr');
        const domain = row.querySelector('td:nth-child(2)').textContent;

        switch(action) {
            case 'Acessar':
                window.open(`https://${domain}`, '_blank');
                break;
            case 'Configurações':
                console.log(`Abrindo configurações para ${domain}`);
                break;
            case 'Renovar SSL':
                if (confirm(`Deseja renovar o certificado SSL para ${domain}?`)) {
                    console.log(`Renovando SSL para ${domain}`);
                    const sslBadge = row.querySelector('.ssl-badge');
                    sslBadge.textContent = 'Ativo';
                    sslBadge.className = 'ssl-badge active';
                }
                break;
        }
    });

    // Verificar validade dos certificados SSL (simulação)
    function checkSSLStatus() {
        const sslBadges = document.querySelectorAll('.ssl-badge');
        sslBadges.forEach(badge => {
            // Simulação: 30% de chance de mostrar o SSL como expirando
            if (Math.random() < 0.3) {
                badge.textContent = 'Expirando';
                badge.className = 'ssl-badge warning';
            }
        });
    }

    // Verificar status dos SSL a cada 5 minutos
    checkSSLStatus();
    setInterval(checkSSLStatus, 300000);
});

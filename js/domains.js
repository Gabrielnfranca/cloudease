document.addEventListener('DOMContentLoaded', function() {
    // Elementos do DOM
    const searchInput = document.querySelector('.search-bar input');
    const filterBtn = document.querySelector('.filter-btn');
    const newDomainBtn = document.querySelector('.new-site-btn');
    const modal = document.getElementById('newDomainModal');
    const closeModalBtn = document.querySelector('.close-modal');
    const cancelBtn = document.querySelector('.cancel-btn');
    const domainForm = document.getElementById('newDomainForm');
    const domainsTable = document.querySelector('.domains-table tbody');

    // Funções de busca
    searchInput.addEventListener('input', function(e) {
        const searchTerm = e.target.value.toLowerCase();
        const rows = domainsTable.querySelectorAll('tr');

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
        domainForm.reset();
    }

    newDomainBtn.addEventListener('click', openModal);
    closeModalBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);

    // Fechar modal ao clicar fora dele
    window.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeModal();
        }
    });

    // Manipulação do formulário
    domainForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const newDomain = {
            name: document.getElementById('domainName').value,
            registrar: document.getElementById('registrar').value,
            dns: document.getElementById('dnsProvider').value,
            expiry: new Date(document.getElementById('expiryDate').value)
        };

        // Aqui você pode adicionar a lógica para enviar os dados para o servidor
        console.log('Novo domínio:', newDomain);

        // Calcular status baseado na data de expiração
        const today = new Date();
        const daysUntilExpiry = Math.ceil((newDomain.expiry - today) / (1000 * 60 * 60 * 24));
        let status, statusClass;

        if (daysUntilExpiry > 30) {
            status = 'Ativo';
            statusClass = 'active';
        } else if (daysUntilExpiry > 0) {
            status = 'Expirando';
statusClass = 'warning';  // Mantido como 'warning' para indicar estado de alerta
        } else {
            status = 'Expirado';
            statusClass = 'expired';
        }

        // Adicionar nova linha na tabela
        const newRow = document.createElement('tr');
        newRow.innerHTML = `
            <td>${newDomain.name}</td>
            <td>${newDomain.registrar}</td>
            <td>${newDomain.dns}</td>
            <td>${newDomain.expiry.toLocaleDateString()}</td>
            <td><span class="status-badge ${statusClass}">${status}</span></td>
            <td class="actions">
                <button class="action-btn" title="DNS"><i class="fas fa-network-wired"></i></button>
                <button class="action-btn" title="Renovar"><i class="fas fa-sync"></i></button>
                <button class="action-btn" title="Configurações"><i class="fas fa-cog"></i></button>
            </td>
        `;

        domainsTable.appendChild(newRow);
        closeModal();
    });

    // Ações dos domínios
    domainsTable.addEventListener('click', function(e) {
        const actionBtn = e.target.closest('.action-btn');
        if (!actionBtn) return;

        const action = actionBtn.title;
        const row = actionBtn.closest('tr');
        const domainName = row.querySelector('td:first-child').textContent;

        switch(action) {
            case 'DNS':
                console.log(`Abrindo configurações DNS para ${domainName}`);
                break;
            case 'Renovar':
                if (confirm(`Deseja renovar o domínio ${domainName}?`)) {
                    console.log(`Renovando ${domainName}`);
                    const statusBadge = row.querySelector('.status-badge');
                    statusBadge.textContent = 'Ativo';
                    statusBadge.className = 'status-badge active';
                }
                break;
            case 'Configurações':
                console.log(`Abrindo configurações para ${domainName}`);
                break;
        }
    });

    // Verificar status dos domínios periodicamente
    function checkDomainStatus() {
        const rows = domainsTable.querySelectorAll('tr');
        rows.forEach(row => {
            const expiryDate = new Date(row.querySelector('td:nth-child(4)').textContent);
            const today = new Date();
            const daysUntilExpiry = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
            
            const statusBadge = row.querySelector('.status-badge');
            if (daysUntilExpiry <= 0) {
                statusBadge.textContent = 'Expirado';
                statusBadge.className = 'status-badge expired';
            } else if (daysUntilExpiry <= 30) {
                statusBadge.textContent = 'Expirando';
                statusBadge.className = 'status-badge warning';
            }
        });
    }

    // Verificar status dos domínios a cada hora
    checkDomainStatus();
    setInterval(checkDomainStatus, 3600000);
});

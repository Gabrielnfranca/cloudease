document.addEventListener('DOMContentLoaded', function() {
    // Elementos do DOM
    const searchInput = document.querySelector('.search-bar input');
    const filterBtn = document.querySelector('.filter-btn');
    const newHostBtn = document.querySelector('.new-server-btn');
    const modal = document.getElementById('newHostModal');
    const closeModalBtn = document.querySelector('.close-modal');
    const cancelBtn = document.querySelector('.cancel-btn');
    const hostForm = document.getElementById('newHostForm');
    const hostsTable = document.querySelector('.hosts-table tbody');

    // Funções de busca
    searchInput.addEventListener('input', function(e) {
        const searchTerm = e.target.value.toLowerCase();
        const rows = hostsTable.querySelectorAll('tr');

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
        hostForm.reset();
    }

    newHostBtn.addEventListener('click', openModal);
    closeModalBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);

    // Fechar modal ao clicar fora dele
    window.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeModal();
        }
    });

    // Manipulação do formulário
    hostForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const newHost = {
            name: document.getElementById('hostName').value,
            ip: document.getElementById('hostIP').value,
            provider: document.getElementById('provider').value
        };

        // Aqui você pode adicionar a lógica para enviar os dados para o servidor
        console.log('Novo host:', newHost);

        // Adicionar nova linha na tabela
        const newRow = document.createElement('tr');
        newRow.innerHTML = `
            <td>
                <img src="https://${newHost.provider}.com/favicon.ico" alt="${newHost.provider}" class="provider-logo">
            </td>
            <td>${newHost.name}</td>
            <td>${newHost.ip}</td>
            <td>0 servidores</td>
            <td>${new Date().toLocaleDateString()}</td>
            <td><span class="status-badge active">Online</span></td>
            <td class="actions">
                <button class="action-btn" title="Configurações"><i class="fas fa-cog"></i></button>
                <button class="action-btn" title="Reiniciar"><i class="fas fa-sync-alt"></i></button>
                <button class="action-btn" title="Desligar"><i class="fas fa-power-off"></i></button>
            </td>
        `;

        hostsTable.appendChild(newRow);
        closeModal();
    });

    // Ações dos hosts
    hostsTable.addEventListener('click', function(e) {
        const actionBtn = e.target.closest('.action-btn');
        if (!actionBtn) return;

        const action = actionBtn.title;
        const row = actionBtn.closest('tr');
        const hostName = row.querySelector('td:nth-child(2)').textContent;

        switch(action) {
            case 'Configurações':
                console.log(`Abrindo configurações para ${hostName}`);
                break;
            case 'Reiniciar':
                if (confirm(`Deseja reiniciar o host ${hostName}?`)) {
                    console.log(`Reiniciando ${hostName}`);
                }
                break;
            case 'Desligar':
                if (confirm(`Deseja desligar o host ${hostName}?`)) {
                    console.log(`Desligando ${hostName}`);
                    const statusBadge = row.querySelector('.status-badge');
                    statusBadge.textContent = 'Offline';
                    statusBadge.classList.remove('active');
                    statusBadge.classList.add('inactive');
                }
                break;
        }
    });
});

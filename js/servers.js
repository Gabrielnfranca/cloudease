document.addEventListener('DOMContentLoaded', function() {
    // Elementos do DOM
    const searchInput = document.querySelector('.search-bar input');
    const filterBtn = document.querySelector('.filter-btn');
    const newServerBtn = document.querySelector('.new-server-btn');
    const modal = document.getElementById('newServerModal');
    const closeModalBtn = document.querySelector('.close-modal');
    const cancelBtn = document.querySelector('.cancel-btn');
    const serverForm = document.getElementById('newServerForm');
    const serversTable = document.querySelector('.servers-table tbody');

    // Funções de busca
    searchInput.addEventListener('input', function(e) {
        const searchTerm = e.target.value.toLowerCase();
        const rows = serversTable.querySelectorAll('tr');

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
        serverForm.reset();
    }

    newServerBtn.addEventListener('click', openModal);
    closeModalBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);

    // Fechar modal ao clicar fora dele
    window.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeModal();
        }
    });

    // Manipulação do formulário
    serverForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const newServer = {
            name: document.getElementById('serverName').value,
            ip: document.getElementById('serverIP').value,
            host: document.getElementById('hostSelect').value,
            type: document.getElementById('serverType').value
        };

        // Aqui você pode adicionar a lógica para enviar os dados para o servidor
        console.log('Novo servidor:', newServer);

        // Obter informações do host selecionado
        const hostOption = document.getElementById('hostSelect').selectedOptions[0];
        const hostName = hostOption.text;
        const hostLogo = newServer.host === 'vultr' ? 
            'https://www.vultr.com/favicon.ico' : 
            'https://assets.digitalocean.com/favicon.ico';

        // Adicionar nova linha na tabela
        const newRow = document.createElement('tr');
        newRow.innerHTML = `
            <td>
                <img src="${hostLogo}" alt="${hostName}" class="provider-logo">
            </td>
            <td>${newServer.name}</td>
            <td>${newServer.ip}</td>
            <td>0 ativos</td>
            <td>${new Date().toLocaleDateString()}</td>
            <td><span class="status-badge active">Online</span></td>
            <td class="actions">
                <button class="action-btn" title="Configurações"><i class="fas fa-cog"></i></button>
                <button class="action-btn" title="Reiniciar"><i class="fas fa-sync-alt"></i></button>
                <button class="action-btn" title="Desligar"><i class="fas fa-power-off"></i></button>
            </td>
        `;

        serversTable.appendChild(newRow);
        closeModal();
    });

    // Ações dos servidores
    serversTable.addEventListener('click', function(e) {
        const actionBtn = e.target.closest('.action-btn');
        if (!actionBtn) return;

        const action = actionBtn.title;
        const row = actionBtn.closest('tr');
        const serverName = row.querySelector('td:nth-child(2)').textContent;

        switch(action) {
            case 'Configurações':
                console.log(`Abrindo configurações para ${serverName}`);
                break;
            case 'Reiniciar':
                if (confirm(`Deseja reiniciar o servidor ${serverName}?`)) {
                    console.log(`Reiniciando ${serverName}`);
                }
                break;
            case 'Desligar':
                if (confirm(`Deseja desligar o servidor ${serverName}?`)) {
                    console.log(`Desligando ${serverName}`);
                    const statusBadge = row.querySelector('.status-badge');
                    statusBadge.textContent = 'Offline';
                    statusBadge.classList.remove('active');
                    statusBadge.classList.add('inactive');
                }
                break;
        }
    });
});

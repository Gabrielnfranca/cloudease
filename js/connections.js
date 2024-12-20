document.addEventListener('DOMContentLoaded', function() {
    // Elementos do DOM
    const newConnectionBtn = document.querySelector('.new-connection-btn');
    const modal = document.querySelector('#newConnectionModal');
    const closeModalBtn = modal.querySelector('.close-modal');
    const connectionForm = document.querySelector('#newConnectionForm');
    const searchInput = document.querySelector('.search-bar input');
    const filterBtn = document.querySelector('.filter-btn');

    // Abrir modal
    newConnectionBtn.addEventListener('click', () => {
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    });

    // Fechar modal
    closeModalBtn.addEventListener('click', () => {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
        connectionForm.reset();
    });

    // Fechar modal ao clicar fora
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
            document.body.style.overflow = 'auto';
            connectionForm.reset();
        }
    });

    // Manipular envio do formulário
    connectionForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        // Coletar dados do formulário
        const formData = {
            name: document.querySelector('#connectionName').value,
            ip: document.querySelector('#connectionIP').value,
            provider: document.querySelector('#provider').value
        };

        // Aqui você pode adicionar a lógica para enviar os dados para o servidor
        console.log('Dados da nova conexão:', formData);

        // Fechar modal e resetar formulário
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
        connectionForm.reset();
    });

    // Busca em tempo real
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const rows = document.querySelectorAll('.connections-table tbody tr');

        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(searchTerm) ? '' : 'none';
        });
    });

    // Botão de filtro (placeholder - a ser implementado conforme necessidade)
    filterBtn.addEventListener('click', () => {
        console.log('Implementar funcionalidade de filtro');
    });

    // Botões de ação da tabela
    document.querySelectorAll('.action-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const action = e.currentTarget.getAttribute('title');
            const row = e.currentTarget.closest('tr');
            const connectionName = row.querySelector('td:nth-child(2)').textContent;

            switch(action) {
                case 'Configurações':
                    console.log(`Abrir configurações para: ${connectionName}`);
                    break;
                case 'Reiniciar':
                    console.log(`Reiniciar conexão: ${connectionName}`);
                    break;
                case 'Desligar':
                    console.log(`Desligar conexão: ${connectionName}`);
                    break;
            }
        });
    });
});

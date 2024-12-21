document.addEventListener('DOMContentLoaded', function() {
    // Elementos do DOM
    const newConnectionBtn = document.querySelector('.new-site-btn');
    const searchInput = document.querySelector('.search-bar input');
    const filterBtn = document.querySelector('.filter-btn');

    // Redirecionar para a página de Conectar Host
    newConnectionBtn.addEventListener('click', () => {
        window.location.href = 'connect-host.html';
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
                    if (confirm(`Deseja reiniciar a conexão ${connectionName}?`)) {
                        console.log(`Reiniciando ${connectionName}`);
                    }
                    break;
                case 'Desligar':
                    if (confirm(`Deseja desligar a conexão ${connectionName}?`)) {
                        console.log(`Desligando ${connectionName}`);
                        const statusBadge = row.querySelector('.status-badge');
                        statusBadge.textContent = 'Offline';
                        statusBadge.classList.remove('active');
                        statusBadge.classList.add('inactive');
                    }
                    break;
            }
        });
    });
});

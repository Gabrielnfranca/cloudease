document.addEventListener('DOMContentLoaded', function() {
    // Elementos do DOM
    const searchInput = document.querySelector('.search-bar input');
    const filterBtn = document.querySelector('.filter-btn');
    const newTicketBtn = document.querySelector('.new-ticket-btn');
    const modal = document.getElementById('newTicketModal');
    const closeModalBtn = document.querySelector('.close-modal');
    const cancelBtn = document.querySelector('.cancel-btn');
    const ticketForm = document.getElementById('newTicketForm');
    const ticketsTable = document.querySelector('.tickets-table tbody');
    const fileInput = document.getElementById('ticketAttachment');

    // Funções de busca
    searchInput.addEventListener('input', function(e) {
        const searchTerm = e.target.value.toLowerCase();
        const rows = ticketsTable.querySelectorAll('tr');

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
        ticketForm.reset();
    }

    newTicketBtn.addEventListener('click', openModal);
    closeModalBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);

    // Fechar modal ao clicar fora dele
    window.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeModal();
        }
    });

    // Validação de arquivos
    fileInput.addEventListener('change', function(e) {
        const files = e.target.files;
        const maxFiles = 3;
        const maxSize = 5 * 1024 * 1024; // 5MB em bytes
        let invalidFiles = [];

        if (files.length > maxFiles) {
            alert(`Você pode anexar no máximo ${maxFiles} arquivos.`);
            e.target.value = '';
            return;
        }

        for (let file of files) {
            if (file.size > maxSize) {
                invalidFiles.push(file.name);
            }
        }

        if (invalidFiles.length > 0) {
            alert(`Os seguintes arquivos excedem 5MB:\n${invalidFiles.join('\n')}`);
            e.target.value = '';
        }
    });

    // Manipulação do formulário
    ticketForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const newTicket = {
            subject: document.getElementById('ticketSubject').value,
            category: document.getElementById('ticketCategory').value,
            priority: document.getElementById('ticketPriority').value,
            message: document.getElementById('ticketMessage').value,
            attachments: fileInput.files
        };

        // Aqui você pode adicionar a lógica para enviar os dados para o servidor
        console.log('Novo ticket:', newTicket);

        // Gerar ID único para o ticket (simulação)
        const ticketId = Math.floor(Math.random() * 10000);

        // Adicionar nova linha na tabela
        const newRow = document.createElement('tr');
        newRow.innerHTML = `
            <td>#${ticketId}</td>
            <td>${newTicket.subject}</td>
            <td><span class="status-badge pending">Pendente</span></td>
            <td>${new Date().toLocaleString()}</td>
            <td><span class="priority-badge ${newTicket.priority}">${newTicket.priority.charAt(0).toUpperCase() + newTicket.priority.slice(1)}</span></td>
            <td class="actions">
                <button class="action-btn" title="Ver Detalhes"><i class="fas fa-eye"></i></button>
                <button class="action-btn" title="Responder"><i class="fas fa-reply"></i></button>
                <button class="action-btn" title="Fechar Ticket"><i class="fas fa-check"></i></button>
            </td>
        `;

        ticketsTable.insertBefore(newRow, ticketsTable.firstChild);
        closeModal();

        // Mostrar mensagem de confirmação
        alert('Ticket criado com sucesso! Responderemos em até 24 horas.');
    });

    // Ações dos tickets
    ticketsTable.addEventListener('click', function(e) {
        const actionBtn = e.target.closest('.action-btn');
        if (!actionBtn) return;

        const action = actionBtn.title;
        const row = actionBtn.closest('tr');
        const ticketId = row.querySelector('td:first-child').textContent;
        const statusBadge = row.querySelector('.status-badge');

        switch(action) {
            case 'Ver Detalhes':
                console.log(`Visualizando detalhes do ticket ${ticketId}`);
                break;
            case 'Responder':
                console.log(`Respondendo ao ticket ${ticketId}`);
                break;
            case 'Fechar Ticket':
                if (confirm(`Deseja fechar o ticket ${ticketId}?`)) {
                    console.log(`Fechando ticket ${ticketId}`);
                    statusBadge.textContent = 'Fechado';
                    statusBadge.className = 'status-badge closed';
                    actionBtn.innerHTML = '<i class="fas fa-redo"></i>';
                    actionBtn.title = 'Reabrir Ticket';
                }
                break;
            case 'Reabrir Ticket':
                if (confirm(`Deseja reabrir o ticket ${ticketId}?`)) {
                    console.log(`Reabrindo ticket ${ticketId}`);
                    statusBadge.textContent = 'Pendente';
                    statusBadge.className = 'status-badge pending';
                    actionBtn.innerHTML = '<i class="fas fa-check"></i>';
                    actionBtn.title = 'Fechar Ticket';
                }
                break;
        }
    });

    // Atualizar tempo de última atualização periodicamente
    function updateTimestamps() {
        const timestamps = document.querySelectorAll('.tickets-table tbody td:nth-child(4)');
        timestamps.forEach(cell => {
            const date = new Date(cell.textContent);
            cell.textContent = date.toLocaleString();
        });
    }

    // Atualizar timestamps a cada minuto
    setInterval(updateTimestamps, 60000);
});

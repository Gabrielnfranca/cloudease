document.addEventListener('DOMContentLoaded', function() {
    // Elementos do DOM
    const searchInput = document.querySelector('.search-bar input');
    const filterBtn = document.querySelector('.filter-btn');
    const newTicketBtn = document.querySelector('.new-site-btn');
    const modal = document.getElementById('newTicketModal');
    const closeModalBtn = document.querySelector('.close-modal');
    const cancelBtn = document.querySelector('.cancel-btn');
    const ticketForm = document.getElementById('newTicketForm');
    const ticketsTable = document.querySelector('.tickets-table tbody');
    const fileInput = document.getElementById('ticketAttachment');
    const form = document.getElementById('supportForm');

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
    ticketForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const subject = document.getElementById('ticketSubject').value;
        const category = document.getElementById('ticketCategory').value;
        const priority = document.getElementById('ticketPriority').value;
        const message = document.getElementById('ticketMessage').value;

        try {
            const res = await fetch('/api/admin?type=ticket-create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    subject: subject,
                    description: message,
                    urgency: priority
                })
            });
            if (res.ok) {
                alert('Chamado criado com sucesso!');
                closeModal();
                loadTickets();
            } else {
                alert('Erro ao criar chamado');
            }
        } catch (error) {
            console.error('Erro:', error);
            alert('Erro ao conectar');
        }
    });

    async function loadTickets() {
        try {
            const res = await fetch('/api/admin?type=tickets');
            const tickets = await res.json();
            ticketsTable.innerHTML = '';
            tickets.forEach(t => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>#${t.id}</td>
                    <td>${t.subject}</td>
                    <td><span class="status-badge ${t.status === 'Aberto' ? 'pending' : 'active'}">${t.status}</span></td>
                    <td>${new Date(t.created_at).toLocaleString()}</td>
                    <td><span class="priority-badge ${t.urgency}">${t.urgency}</span></td>
                    <td class="actions">
                        <button class="action-btn" title="Ver Detalhes"><i class="fas fa-eye"></i></button>
                    </td>
                `;
                ticketsTable.appendChild(tr);
            });
        } catch (e) {
            console.error('Erro ao carregar tickets:', e);
        }
    }
    loadTickets();
        closeModal();

        // Mostrar mensagem de confirmação
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

    // Chamados de suporte
    async function loadTickets() {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Carregando...</td></tr>';
        try {
            const res = await fetch('/api/support');
            const tickets = await res.json();
            renderTickets(tickets);
        } catch {
            tbody.innerHTML = '<tr><td colspan="5" style="color:red; text-align:center;">Erro ao carregar chamados</td></tr>';
        }
    }

    function renderTickets(tickets) {
        tbody.innerHTML = '';
        if (!tickets.length) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#718096;">Nenhum chamado aberto.</td></tr>';
            return;
        }
        tickets.forEach(ticket => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>#${ticket.id}</td>
                <td>${ticket.subject}</td>
                <td><span class="urgency urgency-${ticket.urgency.toLowerCase()}">${ticket.urgency}</span></td>
                <td><span class="status-badge status-${ticket.status.toLowerCase()}">${ticket.status}</span></td>
                <td>${new Date(ticket.created_at).toLocaleDateString('pt-BR')}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        const subject = form.subject.value.trim();
        const description = form.description.value.trim();
        const urgency = form.urgency.value;
        if (!subject || !description || !urgency) return alert('Preencha todos os campos');
        try {
            const res = await fetch('/api/support', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subject, description, urgency })
            });
            if (res.ok) {
                form.reset();
                loadTickets();
            } else {
                alert('Erro ao abrir chamado');
            }
        } catch {
            alert('Erro de conexão');
        }
    });

    loadTickets();
});

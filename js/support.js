document.addEventListener('DOMContentLoaded', () => {
    loadTickets();
    loadServices(); // Populate "Related Services" dropdown

    // Modal Handling
    const modal = document.getElementById('ticketModal');
    const openBtn = document.getElementById('openTicketModal');
    const closeBtns = document.querySelectorAll('.close-modal, .close-modal-btn');

    if (openBtn) {
        openBtn.addEventListener('click', () => {
            modal.classList.add('show');
            document.body.style.overflow = 'hidden'; // Prevent background scrolling
        });
    }

    closeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            modal.classList.remove('show');
            document.body.style.overflow = '';
        });
    });

    // Outside click close
    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('show');
            document.body.style.overflow = '';
        }
    });

    // Form Submit
    const form = document.getElementById('supportForm');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await createTicket();
        });
    }
});

async function loadTickets() {
    const tbody = document.querySelector('.tickets-table tbody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 20px;">Carregando...</td></tr>';

    try {
        const authToken = localStorage.getItem('authToken');
        const response = await fetch('/api/support', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (!response.ok) throw new Error('Erro na API');
        const tickets = await response.json();

        updateStats(tickets);
        renderTickets(tickets);

    } catch (error) {
        console.error(error);
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 20px; color: red;">Erro ao carregar chamados.</td></tr>';
    }
}

function updateStats(tickets) {
    const total = tickets.length;
    const pending = tickets.filter(t => ['open', 'pending', 'new'].includes(t.status.toLowerCase())).length;
    const solved = tickets.filter(t => ['resolved', 'closed'].includes(t.status.toLowerCase())).length;

    setText('total-tickets', total);
    setText('pending-tickets', pending);
    setText('solved-tickets', solved);
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.innerText = value;
}

function renderTickets(tickets) {
    const tbody = document.querySelector('.tickets-table tbody');
    tbody.innerHTML = '';

    if (tickets.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align:center; padding: 40px; color: var(--text-secondary);">
                    <i class="fas fa-inbox" style="font-size: 32px; margin-bottom: 10px; display: block;"></i>
                    Nenhum chamado encontrado.
                </td>
            </tr>
        `;
        return;
    }

    tickets.forEach(ticket => {
        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.onclick = (e) => {
           // Future: Open Ticket Detail
           alert('Detalhes do chamado #' + ticket.id + ' em breve.');
        };

        const statusClass = getStatusClass(ticket.status);
        const priorityClass = getPriorityClass(ticket.urgency);
        const date = new Date(ticket.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

        tr.innerHTML = `
            <td>#${ticket.id}</td>
            <td style="font-weight: 500;">${ticket.subject}</td>
            <td>${renderServiceTag(ticket)}</td>
            <td><span class="dept-tag">${ticket.department || 'Geral'}</span></td>
            <td><span class="status-badge ${statusClass}">${translateStatus(ticket.status)}</span></td>
            <td style="color: var(--text-secondary); font-size: 13px;">${date}</td>
            <td>
                <button class="btn-secondary-compact" style="width: 32px; height: 32px;" title="Ver Detalhes">
                    <i class="fas fa-chevron-right"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function renderServiceTag(ticket) {
    if (!ticket.related_resource_label) return '<span style="color: var(--text-muted);">-</span>';
    
    let icon = 'fa-cube';
    if (ticket.related_resource_type === 'site') icon = 'fa-globe';
    if (ticket.related_resource_type === 'server') icon = 'fa-server';

    return `
        <div class="service-tag">
            <i class="fas ${icon}" style="font-size: 10px;"></i>
            ${ticket.related_resource_label}
        </div>
    `;
}

function getStatusClass(status) {
    status = (status || '').toLowerCase();
    if (status === 'open' || status === 'new') return 'pending';
    if (status === 'working' || status === 'pending') return 'in-progress';
    if (status === 'resolved') return 'resolved';
    if (status === 'closed') return 'closed';
    return 'pending';
}

function translateStatus(status) {
    const map = {
        'new': 'Novo',
        'open': 'Aberto',
        'pending': 'Em Análise',
        'working': 'Em Andamento',
        'resolved': 'Resolvido',
        'closed': 'Fechado'
    };
    return map[status.toLowerCase()] || status;
}

function getPriorityClass(urgency) {
    urgency = (urgency || '').toLowerCase();
    if (urgency === 'baixa') return 'low';
    if (urgency === 'alta') return 'high';
    if (urgency === 'critica' || urgency === 'crítica') return 'urgent';
    return 'normal';
}

async function loadServices() {
    const select = document.getElementById('serviceSelect');
    if (!select) return;

    try {
        const authToken = localStorage.getItem('authToken');
        // Fetch Sites
        const resSites = await fetch('/api/sites', { headers: { 'Authorization': `Bearer ${authToken}` } });
        const sites = await resSites.json();

        // Fetch Servers
        const resServers = await fetch('/api/servers', { headers: { 'Authorization': `Bearer ${authToken}` } });
        const servers = await resServers.json();

        if (Array.isArray(servers)) {
            const optGroup = document.createElement('optgroup');
            optGroup.label = "Servidores";
            servers.forEach(s => {
                const opt = document.createElement('option');
                opt.value = `server:${s.id}:${s.name}`;
                opt.textContent = `🖥️ ${s.name} (${s.ip_address})`;
                optGroup.appendChild(opt);
            });
            select.appendChild(optGroup);
        }

        if (Array.isArray(sites)) {
            const optGroup = document.createElement('optgroup');
            optGroup.label = "Sites";
            sites.forEach(s => {
                const opt = document.createElement('option');
                opt.value = `site:${s.id}:${s.domain}`;
                opt.textContent = `🌐 ${s.domain}`;
                optGroup.appendChild(opt);
            });
            select.appendChild(optGroup);
        }

    } catch (e) {
        console.error('Failed to load services for dropdown', e);
    }
}

async function createTicket() {
    const btn = document.querySelector('.btn-submit');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
    btn.disabled = true;

    try {
        const form = document.getElementById('supportForm');
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());

        // Parse resource field
        if (data.related_service_id) {
            const parts = data.related_service_id.split(':');
            if (parts.length === 3) {
                data.related_resource_type = parts[0];
                data.related_resource_id = parseInt(parts[1]);
                data.related_resource_label = parts[2];
            }
        }
        delete data.related_service_id; // Clean up payload
        // Default status
        data.status = 'new';
        data.description = data.message; // Mapping 'message' textarea to 'description' db field

        const authToken = localStorage.getItem('authToken');
        const response = await fetch('/api/support', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(data)
        });

        if (!response.ok) throw new Error('Falha ao criar chamado');

        alert('Chamado criado com sucesso!');
        loadTickets();
        
        // Close modal
        document.getElementById('ticketModal').classList.remove('show');
        document.body.style.overflow = '';
        form.reset();

    } catch (error) {
        alert('Erro: ' + error.message);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

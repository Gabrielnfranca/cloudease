document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('supportForm');
    const tbody = document.querySelector('.tickets-table tbody');

    // Carregar chamados
    async function loadTickets() {
        if (!tbody) return;
        
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Carregando...</td></tr>';
        try {
            const res = await fetch('/api/support');
            if (!res.ok) throw new Error('Erro na requisição');
            
            const tickets = await res.json();
            renderTickets(tickets);
        } catch (error) {
            console.error(error);
            tbody.innerHTML = '<tr><td colspan="5" style="color:red; text-align:center;">Erro ao carregar chamados</td></tr>';
        }
    }

    function renderTickets(tickets) {
        tbody.innerHTML = '';
        if (!tickets || tickets.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#718096;">Nenhum chamado aberto.</td></tr>';
            return;
        }

        tickets.forEach(ticket => {
            const tr = document.createElement('tr');
            const date = new Date(ticket.created_at).toLocaleDateString('pt-BR');
            
            // Mapeamento de classes
            const urgencyMap = {
                'Baixa': 'low',
                'Normal': 'normal',
                'Alta': 'high',
                'Crítica': 'urgent'
            };
            const statusMap = {
                'Aberto': 'pending',
                'Em andamento': 'in-progress',
                'Resolvido': 'resolved',
                'Fechado': 'closed'
            };

            const urgencyClass = urgencyMap[ticket.urgency] || 'normal';
            const statusClass = statusMap[ticket.status] || 'pending';

            tr.innerHTML = `
                <td>#${ticket.id}</td>
                <td>${ticket.subject}</td>
                <td><span class="priority-badge ${urgencyClass}">${ticket.urgency}</span></td>
                <td><span class="status-badge ${statusClass}">${ticket.status}</span></td>
                <td>${date}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    // Novo chamado
    if (form) {
        form.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const submitBtn = form.querySelector('button[type="submit"]');
            const originalBtnText = submitBtn.innerHTML;
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';

            const formData = new FormData(form);
            const data = {
                subject: formData.get('subject'),
                description: formData.get('description'),
                urgency: formData.get('urgency')
            };

            try {
                const res = await fetch('/api/support', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });

                if (res.ok) {
                    alert('Chamado aberto com sucesso!');
                    form.reset();
                    loadTickets();
                } else {
                    const err = await res.json();
                    alert(err.error || 'Erro ao abrir chamado');
                }
            } catch (error) {
                console.error(error);
                alert('Erro de conexão');
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnText;
            }
        });
    }

    // Inicialização
    loadTickets();
});

document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('supportForm');
    const modal = document.getElementById('ticketModal');
    const openBtn = document.getElementById('openTicketModal');
    const closeBtn = document.querySelector('.close-modal');
    const cancelBtn = document.querySelector('.cancel-btn');
    const tbody = document.querySelector('.tickets-table tbody');

    // Inicialização
    loadTickets();
    loadServices(); // Busca servidores e sites para o dropdown

    // Modal Logic
    if (openBtn) {
        openBtn.addEventListener('click', () => {
             modal.style.display = 'flex';
        });
    }

    function closeModal() {
        modal.style.display = 'none';
        form.reset();
    }

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
    
    window.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    // Populate Services Dropdown
    async function loadServices() {
        const token = localStorage.getItem('authToken');
        const serverGroup = document.getElementById('serverOptions');
        const siteGroup = document.getElementById('siteOptions');

        if (!serverGroup || !siteGroup) return;

        // Reset with loading state if needed, though usually fast
        // serverGroup.innerHTML = '<option disabled>Carregando...</option>'; 

        if (!token) {
            console.warn('No auth token found');
            return;
        }

        const headers = { 'Authorization': `Bearer ${token}` };

        try {
            console.log('Fetching services...');
            const [serversRes, sitesRes] = await Promise.all([
                fetch('/api/servers', { headers }),
                fetch('/api/sites', { headers })
            ]);

            // Clear previous content
            serverGroup.innerHTML = '';
            siteGroup.innerHTML = '';

            // --- SERVERS ---
            if (serversRes.ok) {
                const servers = await serversRes.json();
                const list = Array.isArray(servers) ? servers : (servers.servers || []);
                
                if (list.length === 0) {
                     const opt = document.createElement('option');
                     opt.disabled = true;
                     opt.textContent = "(Nenhum servidor encontrado)";
                     serverGroup.appendChild(opt);
                } else {
                    list.forEach(s => {
                        const opt = document.createElement('option');
                        opt.value = `server:${s.id}`;
                        // Add status icon if possible or just text
                        const statusLabel = s.status === 'active' ? '🟢' : '🔴';
                        opt.textContent = `${statusLabel} ${s.name} (${s.ipv4})`;
                        serverGroup.appendChild(opt);
                    });
                }
            } else {
                console.error('Servers fetch failed', serversRes.status);
            }

            // --- SITES ---
            if (sitesRes.ok) {
                const sites = await sitesRes.json();
                const list = Array.isArray(sites) ? sites : [];
                
                if (list.length === 0) {
                     const opt = document.createElement('option');
                     opt.disabled = true;
                     opt.textContent = "(Nenhum site encontrado)";
                     siteGroup.appendChild(opt);
                } else {
                    list.forEach(s => {
                        const opt = document.createElement('option');
                        opt.value = `site:${s.id}`;
                        const statusLabel = s.status === 'active' ? '🟢' : '🔴';
                        opt.textContent = `${statusLabel} ${s.domain}`;
                        siteGroup.appendChild(opt);
                    });
                }
            } else {
                console.error('Sites fetch failed', sitesRes.status);
            }

        } catch (error) {
            console.error('Erro crítico ao carregar serviços:', error);
            // Optionally show error in dropdown
            serverGroup.innerHTML = '<option disabled>Erro ao carregar</option>';
            siteGroup.innerHTML = '<option disabled>Erro ao carregar</option>';
        }
    }

    // Carregar chamados
    async function loadTickets() {
        const token = localStorage.getItem('authToken');
        if (!token || !tbody) return;
        
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Carregando...</td></tr>';
        
        try {
            const res = await fetch('/api/support', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (!res.ok) throw new Error('Erro na requisição');
            
            const tickets = await res.json();
            renderTickets(tickets);
            updateStats(tickets);
        } catch (error) {
            console.error(error);
            tbody.innerHTML = '<tr><td colspan="7" style="color:red; text-align:center;">Erro ao carregar chamados</td></tr>';
        }
    }

    function renderTickets(tickets) {
        tbody.innerHTML = '';
        if (!tickets || tickets.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#718096; padding: 30px;">Nenhum chamado aberto.</td></tr>';
            return;
        }

        tickets.forEach(ticket => {
            const tr = document.createElement('tr');
            const date = new Date(ticket.created_at).toLocaleDateString('pt-BR');
            const time = new Date(ticket.created_at).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
            
            // Format Badges
            const urgencyMap = { 'Baixa': 'low', 'Normal': 'normal', 'Alta': 'high', 'Crítica': 'urgent' };
            const statusMap = { 'Aberto': 'pending', 'Em andamento': 'in-progress', 'Resolvido': 'resolved', 'Fechado': 'closed' };

            const urgencyClass = urgencyMap[ticket.urgency] || 'normal';
            const statusClass = statusMap[ticket.status] || 'pending';

            // Format Service
            let serviceHtml = '<span style="color:#a0aec0;">-</span>';
            if (ticket.related_resource_type && ticket.related_resource_label) {
                 const icon = ticket.related_resource_type === 'server' ? 'fa-server' : 'fa-globe';
                 serviceHtml = `<span class="service-tag"><i class="fas ${icon}"></i> ${ticket.related_resource_label}</span>`;
            }

            // Format Department
            const deptLabel = {
                'technical': 'Técnico',
                'billing': 'Financeiro',
                'sales': 'Vendas'
            }[ticket.department] || ticket.department || 'Geral';

            tr.innerHTML = `
                <td><strong>#${ticket.id}</strong></td>
                <td>
                    <div style="font-weight:500;">${ticket.subject}</div>
                    <div style="font-size:12px; color:#718096; max-width: 250px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${ticket.description}</div>
                </td>
                <td>${serviceHtml}</td>
                <td><span class="dept-tag">${deptLabel}</span></td>
                <td><span class="status-badge ${statusClass}">${ticket.status}</span></td>
                <td style="font-size:12px;">${date} <span style="color:#cbd5e0;">|</span> ${time}</td>
                <td>
                    <button class="icon-btn" title="Ver Detalhes"><i class="far fa-eye"></i></button>
                    ${ticket.status === 'resolved' ? '' : '<button class="icon-btn delete-btn" title="Cancelar"><i class="far fa-trash-alt"></i></button>'}
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    function updateStats(tickets) {
        if (!tickets) return;
        document.getElementById('total-tickets').textContent = tickets.length;
        document.getElementById('pending-tickets').textContent = tickets.filter(t => t.status === 'Aberto' || t.status === 'Em andamento').length;
        document.getElementById('solved-tickets').textContent = tickets.filter(t => t.status === 'Resolvido' || t.status === 'Fechado').length;
    }

    // Submit Handler
    if (form) {
        form.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const submitBtn = form.querySelector('.submit-btn');
            const originalBtnText = submitBtn.innerHTML;
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';

            const formData = new FormData(form);
            const token = localStorage.getItem('authToken');

            // Parse Resource
            const rawResource = formData.get('related_service');
            let resourceType = null;
            let resourceId = null;

            if (rawResource && rawResource.includes(':')) {
                [resourceType, resourceId] = rawResource.split(':');
            }

            const data = {
                subject: formData.get('subject'),
                description: formData.get('description'),
                urgency: formData.get('urgency'),
                department: formData.get('department'),
                related_resource_type: resourceType,
                related_resource_id: resourceId
            };

            try {
                const res = await fetch('/api/support', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(data)
                });

                if (res.ok) {
                    closeModal();
                    loadTickets();
                    // Show success notification (optional implementation)
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
});

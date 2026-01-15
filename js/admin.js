document.addEventListener('DOMContentLoaded', async function() {
    const token = localStorage.getItem('authToken');
    if (!token) {
        window.location.href = 'index.html';
        return;
    }

    // Load Dashboard
    loadAdminData();

    async function loadAdminData() {
        try {
            const res = await fetch('/api/admin?type=dashboard', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (res.status === 403) {
                const data = await res.json();
                alert(data.error || 'Acesso negado. Você não é administrador.');
                window.location.href = 'dashboard.html';
                return;
            }

            const data = await res.json();
            
            // Counters
            document.getElementById('admin-users-count').textContent = data.users.length;
            document.getElementById('admin-revenue').textContent = 'R$ ' + (data.totalRevenue || '0.00');
            document.getElementById('admin-tickets').textContent = data.tickets.length;

            // Users Table
            const usersTbody = document.getElementById('admin-users-tbody');
            if (usersTbody) {
                usersTbody.innerHTML = '';
                data.users.forEach(u => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${u.name || 'Sem nome'}</td>
                        <td>${u.email}</td>
                        <td><span class="status-badge ${u.status === 'banned' ? 'expired' : 'active'}">${u.status || 'active'}</span></td>
                        <td>${u.last_login ? new Date(u.last_login).toLocaleDateString() : 'Nunca'}</td>
                        <td>
                            ${u.status !== 'banned' ? `<button onclick="banUser('${u.id}')" class="action-btn" title="Banir"><i class="fas fa-ban"></i></button>` : ''}
                        </td>
                    `;
                    usersTbody.appendChild(tr);
                });
            }

            // Tickets Table
            const ticketsTbody = document.getElementById('admin-tickets-tbody');
            if (ticketsTbody) {
                ticketsTbody.innerHTML = '';
                data.tickets.forEach(t => {
                    const userName = t.profiles ? t.profiles.name : 'Usuário deletado';
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>#${t.id}</td>
                        <td>${t.subject}</td>
                        <td>${userName}</td>
                        <td><span class="status-badge ${t.urgency === 'high' ? 'expired' : 'active'}">${t.urgency}</span></td>
                        <td>${t.status}</td>
                        <td>${new Date(t.created_at).toLocaleDateString()}</td>
                    `;
                    ticketsTbody.appendChild(tr);
                });
            }

            // Revenue Table
            const revenueTbody = document.getElementById('admin-revenue-tbody');
            if (revenueTbody) {
                revenueTbody.innerHTML = '';
                data.revenue.forEach(r => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>#${r.id}</td>
                        <td>-</td>
                        <td>R$ ${r.amount}</td>
                        <td>${new Date(r.created_at).toLocaleDateString()}</td>
                    `;
                    revenueTbody.appendChild(tr);
                });
            }

        } catch (e) {
            console.error(e);
            alert('Erro ao carregar dados administrativos.');
        }
    }

    window.banUser = async function(userId) {
        if(!confirm('Tem certeza que deseja banir este usuário?')) return;
        try {
            const res = await fetch('/api/admin', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}` 
                },
                body: JSON.stringify({ action: 'delete_user', id: userId })
            });
            if(res.ok) {
                alert('Usuário banido/desativado.');
                loadAdminData();
            } else {
                alert('Erro ao banir usuário.');
            }
        } catch(e) {
            alert('Erro de conexão.');
        }
    };
});

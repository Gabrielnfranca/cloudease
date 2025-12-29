document.addEventListener('DOMContentLoaded', function() {
    async function loadAdminData() {
        try {
            const res = await fetch('/api/admin?type=dashboard');
            const data = await res.json();
            // Cards
            document.getElementById('admin-users-count').textContent = data.users.length;
            document.getElementById('admin-revenue').textContent = 'R$ ' + (data.totalRevenue || 0);
            document.getElementById('admin-tickets').textContent = data.tickets.length;
            // Usuários
            const usersTbody = document.getElementById('admin-users-tbody');
            usersTbody.innerHTML = '';
            data.users.forEach(u => {
                const tr = document.createElement('tr');
                tr.innerHTML = `<td>${u.name}</td><td>${u.email}</td><td>${u.status || 'Ativo'}</td><td>${u.last_login ? new Date(u.last_login).toLocaleString('pt-BR') : '-'}</td>`;
                usersTbody.appendChild(tr);
            });
            // Chamados
            const ticketsTbody = document.getElementById('admin-tickets-tbody');
            ticketsTbody.innerHTML = '';
            data.tickets.forEach(t => {
                const tr = document.createElement('tr');
                tr.innerHTML = `<td>#${t.id}</td><td>${t.subject}</td><td>${t.user_name || '-'}</td><td>${t.urgency}</td><td>${t.status}</td><td>${new Date(t.created_at).toLocaleDateString('pt-BR')}</td>`;
                ticketsTbody.appendChild(tr);
            });
            // Faturamento
            const revenueTbody = document.getElementById('admin-revenue-tbody');
            revenueTbody.innerHTML = '';
            data.revenue.forEach(r => {
                const tr = document.createElement('tr');
                tr.innerHTML = `<td>${r.id}</td><td>${r.client_name || '-'}</td><td>R$ ${r.amount}</td><td>${new Date(r.created_at).toLocaleDateString('pt-BR')}</td>`;
                revenueTbody.appendChild(tr);
            });
        } catch (e) {
            document.getElementById('admin-users-count').textContent = '-';
            document.getElementById('admin-revenue').textContent = '-';
            document.getElementById('admin-tickets').textContent = '-';
        }
    }
    loadAdminData();
});

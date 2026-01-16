document.addEventListener('DOMContentLoaded', async function() {
    const token = localStorage.getItem('authToken');
    if (!token) {
        window.location.href = 'index.html';
        return;
    }

    // Set default tab
    switchTab('dashboard');
    
    // Load initial user info
    // (Optional: fetch admin profile name)
});

// Global for tab switching (called from HTML)
window.switchTab = function(tabName, element) {
    // 1. Update Sidebar
    if(element) {
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        element.classList.add('active');
    }

    // 2. Hide all sections
    document.querySelectorAll('.admin-section').forEach(el => el.style.display = 'none');

    // 3. Show target section
    const target = document.getElementById(`tab-${tabName}`);
    if (target) {
        target.style.display = 'block';
        // Update Title
        const titles = {
            'dashboard': 'Visão Geral',
            'support': 'Suporte & Chat',
            'users': 'Gerenciamento de Usuários',
            'finance': 'Financeiro',
            'notifications': 'Central de Avisos',
            'team': 'Time & Permissões'
        };
        const titleEl = document.getElementById('page-title');
        if(titleEl) titleEl.innerText = titles[tabName] || 'Admin';
        
        // 4. Load Data
        if(tabName === 'dashboard') loadDashboard();
        if(tabName === 'support') loadSupportList();
        if(tabName === 'users') loadUsers();
        if(tabName === 'finance') loadFinance();
        if(tabName === 'notifications') loadNotifications();
    }
};

const API_URL = '/api/admin';
const getHeaders = () => ({
    'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
    'Content-Type': 'application/json'
});

// --- DASHBOARD ---
async function loadDashboard() {
    try {
        const res = await fetch(`${API_URL}?type=dashboard`, { headers: getHeaders() });
        if(res.status === 403) { alert('Acesso Negado'); window.location.href='index.html'; return; }
        const data = await res.json();

        // Cards
        safeSetText('dash-revenue', `R$ ${data.totalRevenue}`);
        safeSetText('dash-users', data.userCount);
        safeSetText('dash-tickets', data.ticketCount);
        safeSetText('dash-overdue', data.overdueCount);

        // Charts (Using Chart.js)
        renderCharts(data);

        // Fill Invoice Table if on Finance Tab too
        if(document.getElementById('admin-invoices-tbody') && data.recentInvoices) {
            const tbody = document.getElementById('admin-invoices-tbody');
            tbody.innerHTML = '';
            data.recentInvoices.forEach(inv => {
                 tbody.innerHTML += `<tr>
                    <td>#${inv.id}</td>
                    <td>${inv.profiles?.email || 'N/A'}</td>
                    <td>${inv.profiles?.plan || 'Standard'}</td>
                    <td>R$ ${inv.amount}</td>
                    <td>${new Date(inv.due_date).toLocaleDateString()}</td>
                    <td>${inv.status}</td>
                    <td>-</td>
                 </tr>`;
            });
        }

    } catch (e) { 
        console.error('Dashboard Load Error:', e);
        // alert('Erro ao carregar dados do V2. Mais detalhes no console.');
    }
}

function safeSetText(id, val) {
    const el = document.getElementById(id);
    if(el) el.innerText = val;
}

let revenueChartInstance = null;
let usersChartInstance = null;

function renderCharts(data) {
    const ctx1 = document.getElementById('revenueChart');
    const ctx2 = document.getElementById('usersChart');

    if (!ctx1 || !ctx2) return;

    // Destroy old if exists
    if(revenueChartInstance) revenueChartInstance.destroy();
    if(usersChartInstance) usersChartInstance.destroy();

    // Mock trend data (since we only have total for now)
    const labels = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun'];
    const revenueData = [1200, 1900, 3000, 5000, 2000, Number(data.totalRevenue) || 0]; 

    if (typeof Chart !== 'undefined') {
        revenueChartInstance = new Chart(ctx1, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Receita (R$)',
                    data: revenueData,
                    borderColor: '#4f46e5',
                    tension: 0.4,
                    fill: true,
                    backgroundColor: 'rgba(79, 70, 229, 0.1)'
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });

        usersChartInstance = new Chart(ctx2, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Novos Usuários',
                    data: [5, 12, 19, 8, 15, Number(data.userCount) || 0],
                    backgroundColor: '#10b981'
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }
}

// --- SUPPORT ---
async function loadSupportList() {
    const listEl = document.getElementById('ticket-list');
    if(!listEl) return;
    listEl.innerHTML = '<div style="padding:20px;text-align:center">Carregando...</div>';

    try {
        const res = await fetch(`${API_URL}?type=tickets`, { headers: getHeaders() });
        const tickets = await res.json();
        
        const badge = document.getElementById('badge-tickets');
        if(badge) {
            badge.innerText = tickets.filter(t => t.status === 'open').length;
            badge.style.display = 'inline-block';
        }

        listEl.innerHTML = '';
        if(tickets.length === 0) {
            listEl.innerHTML = '<div class="empty-state">Nenhum chamado encontrado</div>';
            return;
        }

        tickets.forEach(ticket => {
            const item = document.createElement('div');
            item.className = `ticket-item ${ticket.status === 'open' ? 'status-open-border' : ''}`;
            item.innerHTML = `
                <div class="ticket-header">
                    <span class="ticket-subject">${ticket.subject || 'Sem Assunto'}</span>
                    <span class="status-badge status-${ticket.status}">${ticket.status === 'open' ? 'Aberto' : 'Fechado'}</span>
                </div>
                <div class="ticket-meta">
                    <i class="fas fa-user"></i> ${ticket.profiles?.name || 'User'} 
                    &bull; ${new Date(ticket.created_at).toLocaleDateString()}
                </div>
            `;
            item.onclick = () => loadTicketDetail(ticket.id, item);
            listEl.appendChild(item);
        });
    } catch (e) { console.error(e); }
}

let currentTicketId = null;

async function loadTicketDetail(id, element) {
    // Highlight sidebar item
    document.querySelectorAll('.ticket-item').forEach(el => el.classList.remove('active'));
    element.classList.add('active');
    currentTicketId = id;

    const detailEl = document.getElementById('ticket-detail-view');
    detailEl.innerHTML = '<div class="empty-state">Carregando conversa...</div>';

    try {
        const res = await fetch(`${API_URL}?type=ticket_details&id=${id}`, { headers: getHeaders() });
        const { ticket, messages } = await res.json();

        // Render Chat Interface
        let chatHTML = `
            <div class="ticket-detail-header">
                <div>
                    <h3 style="margin:0">${ticket.subject}</h3>
                    <small style="color:#64748b">Protocolo: #${ticket.id}</small>
                </div>
                <!-- <button class="btn-primary" style="background:#ef4444" onclick="closeTicket(${ticket.id})">Fechar Chamado</button> -->
            </div>
            
            <div class="chat-container" id="chat-messages">
                <!-- Original Description as first message -->
                <div class="message user">
                    <strong>${ticket.profiles?.name || 'Usuário'}:</strong><br>
                    ${ticket.description}
                    <br><small style="opacity:0.7">${new Date(ticket.created_at).toLocaleString()}</small>
                </div>
        `;

        messages.forEach(msg => {
            const isStaff = msg.is_staff;
            chatHTML += `
                <div class="message ${isStaff ? 'staff' : 'user'}">
                    <strong>${isStaff ? 'Suporte CloudEase' : (ticket.profiles?.name || 'Usuário')}:</strong><br>
                    ${msg.message}
                    <br><small style="opacity:0.7">${new Date(msg.created_at).toLocaleString()}</small>
                </div>
            `;
        });

        chatHTML += `</div>
            <div class="chat-input-area">
                <textarea id="reply-text" rows="3" placeholder="Escreva sua resposta..."></textarea>
                <button class="btn-primary" onclick="sendReply()">Enviar Resposta <i class="fas fa-paper-plane"></i></button>
            </div>
        `;

        detailEl.innerHTML = chatHTML;
        
        // Scroll to bottom
        setTimeout(() => {
             const container = document.getElementById('chat-messages');
             if(container) container.scrollTop = container.scrollHeight;
        }, 100);

    } catch (e) { console.error(e); }
}

window.sendReply = async function() {
    const text = document.getElementById('reply-text').value;
    if(!text || !currentTicketId) return;

    try {
        const res = await fetch(API_URL, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({
                action: 'reply_ticket',
                ticket_id: currentTicketId,
                message: text
            })
        });

        if(res.ok) {
            // Reload details to show new message
             const activeItem = document.querySelector('.ticket-item.active');
             if(activeItem) loadTicketDetail(currentTicketId, activeItem);
        }
    } catch(e) { alert('Erro ao enviar'); }
};

// --- ANNOUNCEMENTS ---
async function loadNotifications() {
    const container = document.getElementById('active-announcements');
    if(!container) return;
    container.innerHTML = 'Carregando...';
    
    try {
        const res = await fetch(`${API_URL}?type=announcements`, { headers: getHeaders() });
        const list = await res.json();
        
        container.innerHTML = '';
        list.forEach(ann => {
             const div = document.createElement('div');
             div.className = 'stat-card';
             div.style.marginBottom = '12px';
             div.style.borderLeft = `4px solid ${getColor(ann.type)}`;
             div.innerHTML = `
                <div style="display:flex; justify-content:space-between">
                    <strong>${ann.title}</strong>
                    <button onclick="deleteAnnouncement('${ann.id}')" style="color:red;border:none;background:none;cursor:pointer"><i class="fas fa-trash"></i></button>
                </div>
                <p style="margin:8px 0; color:#64748b">${ann.message}</p>
                <small>${new Date(ann.created_at).toLocaleDateString()}</small>
             `;
             container.appendChild(div);
        });

        if(list.length === 0) container.innerHTML = '<p class="empty-state">Nenhum aviso ativo.</p>';
    } catch(e) { console.error(e); }
}

window.postAnnouncement = async function() {
    const title = document.getElementById('announcement-title').value;
    const msg = document.getElementById('announcement-msg').value;
    const type = document.getElementById('announcement-type').value;

    if(!title || !msg) return alert('Preencha título e mensagem');

    await fetch(API_URL, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ action: 'create_announcement', title, message: msg, type })
    });

    document.getElementById('announcement-title').value = '';
    document.getElementById('announcement-msg').value = '';
    loadNotifications(); // Refresh
};

window.deleteAnnouncement = async function(id) {
    if(!confirm('Excluir este aviso?')) return;
    await fetch(API_URL, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ action: 'delete_announcement', id })
    });
    loadNotifications();
};

function getColor(type) {
    if(type === 'error') return '#ef4444';
    if(type === 'warning') return '#f59e0b';
    if(type === 'success') return '#10b981';
    return '#3b82f6';
}

// --- USERS & FINANCE (Simplified Reuse) ---
async function loadUsers() {
    const res = await fetch(`${API_URL}?type=users`, { headers: getHeaders() });
    const users = await res.json();
    const tbody = document.getElementById('admin-users-tbody');
    if(tbody) {
        tbody.innerHTML = '';
        users.forEach(u => {
            tbody.innerHTML += `<tr>
                <td>${u.name || '-'}</td>
                <td>${u.email}</td>
                <td><span class="status-badge">${u.status || 'active'}</span></td>
                <td>${u.last_login ? new Date(u.last_login).toLocaleDateString() : '-'}</td>
            </tr>`;
        });
    }
}

// Finance uses Dashboard + extra fetch logic if needed, reusing "Dashboard" stats for now.
function loadFinance() {
    // Rely on static content + run billing button already in HTML
    loadDashboard(); // Refresh stats with invoices
}

window.runMonthlyBilling = async function() {
    if(!confirm('Gerar faturas para todos os usuários elegíveis?')) return;
    const res = await fetch(API_URL, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ action: 'run_billing' })
    });
    const data = await res.json();
    alert(`Processo concluído. Faturas geradas: ${data.generated}`);
    loadFinance();
};


document.addEventListener('DOMContentLoaded', () => {
    loadFinancialData();
});

// Cache variables
let currentPlanId = null;
let availablePlansCache = [];

async function loadFinancialData() {
    const loader = document.getElementById('loading');
    const content = document.getElementById('content');
    
    try {
        const token = localStorage.getItem('authToken');
        if (!token) {
            window.location.href = 'index.html';
            return;
        }

        const res = await fetch('/api/financial', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (res.status === 401) {
            window.location.href = 'index.html';
            return;
        }
        
        if (!res.ok) throw new Error('Falha ao carregar dados');
        
        const data = await res.json();
        
        renderPlan(data.subscription);
        renderInvoices(data.invoices);
        renderMethods(data.paymentMethods);
        availablePlansCache = data.availablePlans || [];

        loader.style.display = 'none';
        content.style.display = 'block';

    } catch (e) {
        console.error(e);
        loader.innerHTML = `<div style="text-align:center; padding: 40px;">
            <i class="fas fa-exclamation-triangle" style="font-size: 32px; color: #f59e0b; margin-bottom: 10px;"></i>
            <p style="color: #64748b;">Não foi possível carregar as informações financeiras.</p>
            <button onclick="location.reload()" class="btn-secondary-full" style="width: auto; margin: 20px auto;">Tentar Novamente</button>
        </div>`;
    }
}

function translateStatus(status) {
    const map = {
        'active': 'Ativo',
        'past_due': 'Pagamento Pendente',
        'canceled': 'Cancelado',
        'trialing': 'Período de Teste',
        'paid': 'Pago',
        'pending': 'Pendente',
        'overdue': 'Atrasado',
        'void': 'Anulado'
    };
    return map[status] || status;
}

function renderPlan(sub) {
    if (!sub) {
        // Assume Free Tier default display logic implemented in HTML
        document.getElementById('planName').textContent = 'Plano Gratuito';
        document.getElementById('planPrice').textContent = '0,00';
        document.getElementById('planStatus').textContent = 'Ativo';
        document.getElementById('planStatus').className = 'status-badge active';
        document.getElementById('nextBillingDate').textContent = 'Vitalício';
        return; 
    }
    
    currentPlanId = sub.plan_id;
    document.getElementById('planName').textContent = sub.plan_name;
    document.getElementById('planPrice').textContent = parseFloat(sub.price).toFixed(2).replace('.', ',');
    
    const badge = document.getElementById('planStatus');
    badge.textContent = translateStatus(sub.status);
    badge.className = `status-badge ${sub.status}`;
    
    if (sub.current_period_end) {
        const date = new Date(sub.current_period_end);
        document.getElementById('nextBillingDate').textContent = date.toLocaleDateString('pt-BR');
    }
}

function renderMethods(methods) {
    const list = document.getElementById('methodsList');
    list.innerHTML = '';
    
    if (!methods || methods.length === 0) {
        list.innerHTML = '<div style="text-align:center; color:#94a3b8; padding:20px; font-size: 14px;">Nenhum método de pagamento salvo.</div>';
        return;
    }
    
    methods.forEach(m => {
        const div = document.createElement('div');
        div.className = 'payment-method-item';
        
        let icon = 'fa-credit-card';
        if (m.brand === 'visa') icon = 'fa-cc-visa';
        if (m.brand === 'mastercard') icon = 'fa-cc-mastercard';
        
        div.innerHTML = `
            <div class="method-icon"><i class="fab ${icon}"></i></div>
            <div class="method-details">
                <span class="method-title">•••• •••• •••• ${m.last4}</span>
                <span class="method-subtitle">Expira em ${m.exp_month}/${m.exp_year}</span>
            </div>
            ${m.is_default ? '<span class="default-badge">Padrão</span>' : ''}
            <button class="btn-invoice-action" title="Remover" style="color: #ef4444;"><i class="fas fa-trash"></i></button>
        `;
        list.appendChild(div);
    });
}

function renderInvoices(invoices) {
    const tbody = document.getElementById('invoicesBody');
    tbody.innerHTML = '';
    
    if (!invoices || invoices.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#94a3b8; padding:20px;">Nenhuma fatura encontrada.</td></tr>';
        return;
    }
    
    invoices.forEach(inv => {
        const tr = document.createElement('tr');
        const date = new Date(inv.created_at).toLocaleDateString('pt-BR');
        const amount = parseFloat(inv.amount).toFixed(2).replace('.', ',');
        const statusClass = inv.status === 'paid' ? 'active' : (inv.status === 'overdue' ? 'overdue' : 'pending');
        
        tr.innerHTML = `
            <td><span class="status-badge ${statusClass}">${translateStatus(inv.status)}</span></td>
            <td>${date}</td>
            <td>R$ ${amount}</td>
            <td>Assinatura Mensal</td>
            <td><i class="fas fa-credit-card"></i> Cartão **** 4242</td>
            <td>
                <button class="btn-invoice-action" title="Baixar PDF"><i class="fas fa-file-pdf"></i></button>
                <button class="btn-invoice-action" title="Visualizar"><i class="fas fa-eye"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// Modal Logic
window.openUpgradeModal = function() {
    const modal = document.getElementById('upgradeModal');
    const grid = document.getElementById('pricingGrid');
    
    grid.innerHTML = '';
    
    availablePlansCache.forEach(plan => {
        // Parse features string to array if needed
        let features = [];
        try { features = typeof plan.features === 'string' ? JSON.parse(plan.features) : plan.features; } catch(e) {}
        
        const isCurrent = plan.id === currentPlanId;
        const btnText = isCurrent ? 'Plano Atual' : 'Selecionar Plano';
        const cardClass = plan.name === 'Pro' ? 'pricing-card popular' : 'pricing-card';
        
        const card = document.createElement('div');
        card.className = cardClass;
        
        let featureHtml = '';
        if (Array.isArray(features)) {
            featureHtml = '<ul class="features-list">' + features.map(f => `<li><i class="fas fa-check"></i> ${f}</li>`).join('') + '</ul>';
        }
        
        card.innerHTML = `
            <h3>${plan.name}</h3>
            <div class="pricing-price">R$ ${parseFloat(plan.price).toFixed(2).replace('.', ',')}</div>
            <div class="pricing-sub">${plan.description || '/mês'}</div>
            
            ${featureHtml}
            
            <button class="btn-select-plan" ${isCurrent ? 'disabled style="opacity:0.6"' : ''} onclick="processUpgrade(${plan.id})">
                ${isCurrent ? '<i class="fas fa-check"></i> Atual' : 'Assinar Agora'}
            </button>
        `;
        grid.appendChild(card);
    });
    
    modal.classList.add('show'); // Assuming CSS handles display block/flex via class 'show'
    modal.style.display = 'flex';
}

window.closeUpgradeModal = function() {
    const modal = document.getElementById('upgradeModal');
    modal.style.display = 'none';
    modal.classList.remove('show');
}

window.processUpgrade = async function(planId) {
    if(!confirm('Confirmar mudança de plano? O valor será cobrado no cartão cadastrado.')) return;
    
    try {
        const token = localStorage.getItem('authToken');
        const btn = event.target;
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...';
        btn.disabled = true;
        
        const res = await fetch('/api/financial', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ action: 'upgrade', planId })
        });
        
        if (res.ok) {
            alert('Plano atualizado com sucesso!');
            closeUpgradeModal();
            loadFinancialData(); // Reload UI
        } else {
            const data = await res.json();
            alert('Erro: ' + (data.error || 'Falha na atualização'));
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    } catch(e) {
        alert('Erro de conexão');
    }
}

// Close modal on outside click
window.onclick = function(event) {
    const modal = document.getElementById('upgradeModal');
    if (event.target == modal) {
        closeUpgradeModal();
    }
}

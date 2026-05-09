document.addEventListener('DOMContentLoaded', function() {
    console.log('Dashboard script loaded');
    updateDashboard();

    // Atualiza a cada 30 segundos
    setInterval(updateDashboard, 30000);
});

const PROVIDER_LOGOS = {
    vultr: 'https://www.vultr.com/favicon.ico',
    digitalocean: 'https://www.digitalocean.com/favicon.ico',
    linode: 'https://www.linode.com/favicon.ico',
    aws: 'assets/images/aws-logo.svg'
};

async function updateDashboard() {
    const token = localStorage.getItem('authToken');
    if (!token) {
        console.log('No token found');
        return;
    }

    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };

    console.log('Fetching dashboard data...');

    // Helper to fetch and return json or null efficiently
    const fetchJson = async (url) => {
        try {
            const res = await fetch(url, { headers });
            if (!res.ok) throw new Error(`Status ${res.status}`);
            return await res.json();
        } catch (e) {
            console.error(`Error fetching ${url}:`, e);
            return null;
        }
    };

    // Parallel fetch with individual error handling handling implicitly via helper
    const [providers, servers, sites, providerCosts] = await Promise.all([
        fetchJson('/api/providers'),
        fetchJson('/api/servers'),
        fetchJson('/api/sites'),
        fetchJson('/api/provider-costs')
    ]);

    // Update Connections
    if (providers && Array.isArray(providers)) {
        setElementValue('total-connections', providers.length);
    }

    // Update Servers
    if (servers) {
        let serverCount = 0;
        if (Array.isArray(servers)) {
            serverCount = servers.length;
        } else if (servers.servers) {
             serverCount = servers.servers.length;
        }
        setElementValue('total-servers', serverCount);
    }

    // Update Sites & SSL
    if (sites && Array.isArray(sites)) {
        // Conta sites ativos (active, provisioned)
        const siteCount = sites.filter(s => s.status === 'active' || s.status === 'provisioned').length;
        setElementValue('total-sites', siteCount);

        // Conta SSL ativos (verifica se ssl_active é true)
        const sslCount = sites.filter(s => s.ssl_active === true).length;
        setElementValue('total-ssl', sslCount);
    }

    renderProviderCosts(providerCosts);
}

function setElementValue(id, value) {
    const obj = document.getElementById(id);
    if (obj) {
        obj.textContent = value;
        // Adiciona uma animação visual simples indicando atualização
        obj.style.opacity = '0.5';
        setTimeout(() => obj.style.opacity = '1', 200);
    } else {
        console.warn(`Element with id ${id} not found`);
    }
}

function formatMoney(value, currency) {
    const num = Number(value);
    if (!Number.isFinite(num)) return '--';

    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(num);
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderProviderCosts(data) {
    const container = document.getElementById('provider-costs-container');
    const exchangeRateInfo = document.getElementById('exchange-rate-info');
    const costsUpdatedAt = document.getElementById('costs-updated-at');
    if (!container || !exchangeRateInfo || !costsUpdatedAt) return;

    if (!data || !Array.isArray(data.providers)) {
        container.className = 'empty-state';
        container.innerHTML = '<i class="fas fa-exclamation-triangle"></i><p>Nao foi possivel carregar os custos em tempo real.</p>';
        exchangeRateInfo.textContent = 'Cotacao USD/BRL: indisponivel';
        costsUpdatedAt.textContent = 'Atualizado em: --';
        return;
    }

    const exchangeRate = data.exchange?.usdBrl;
    const exchangeDateRaw = data.exchange?.updatedAt || data.generatedAt;
    const exchangeDate = exchangeDateRaw ? new Date(exchangeDateRaw) : null;

    exchangeRateInfo.textContent = exchangeRate
        ? `Cotacao USD/BRL: ${Number(exchangeRate).toFixed(4)}`
        : 'Cotacao USD/BRL: indisponivel';

    costsUpdatedAt.textContent = exchangeDate && !Number.isNaN(exchangeDate.getTime())
        ? `Atualizado em: ${exchangeDate.toLocaleString('pt-BR')}`
        : 'Atualizado em: --';

    if (data.mode === 'strict') {
        costsUpdatedAt.textContent += ' | Modo estrito: apenas valores confirmados por ID de plano';
    }

    if (data.providers.length === 0) {
        container.className = 'empty-state';
        container.innerHTML = '<i class="fas fa-plug"></i><p>Nenhum provedor integrado no momento.</p>';
        return;
    }

    container.className = '';

    const providersHtml = data.providers.map((provider) => {
        const logo = PROVIDER_LOGOS[String(provider.provider || '').toLowerCase()];
        const providerTotalUsd = formatMoney(provider.totalUsd, 'USD');
        const providerTotalBrl = provider.totalBrl !== null ? formatMoney(provider.totalBrl, 'BRL') : '--';

        const providerHeader = `
            <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start; flex-wrap:wrap; margin-bottom:10px;">
                <div>
                    <div style="display:flex; align-items:center; gap:8px; font-size:15px; font-weight:700; color:#0f172a;">
                        ${logo ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(provider.providerLabel)}" style="width:18px; height:18px; object-fit:contain; border-radius:4px;">` : ''}
                        <span>${escapeHtml(provider.providerLabel)}</span>
                    </div>
                    <div style="font-size:12px; color:#64748b;">${provider.pricedServers}/${provider.totalServers} servidor(es) com preco identificado</div>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:13px; font-weight:700; color:#0f172a;">${providerTotalUsd}/mes</div>
                    <div style="font-size:12px; color:#64748b;">${providerTotalBrl}/mes</div>
                </div>
            </div>
        `;

        if (!provider.servers || provider.servers.length === 0) {
            return `
                <div style="border:1px solid #e2e8f0; border-radius:10px; padding:12px; margin-bottom:12px; background:#fff;">
                    ${providerHeader}
                    <div style="font-size:13px; color:#94a3b8;">Nenhum servidor encontrado nesse provedor.</div>
                </div>
            `;
        }

        const rows = provider.servers.map((server) => {
            const usd = server.monthlyUsd !== null ? `${formatMoney(server.monthlyUsd, 'USD')}/mes` : '--';
            const brl = server.monthlyBrl !== null ? `${formatMoney(server.monthlyBrl, 'BRL')}/mes` : '--';
            const source = server.matchMethod === 'plan_id'
                ? '<span style="font-size:11px; color:#0f766e;">Confirmado (ID do plano)</span>'
                : server.matchMethod === 'specs'
                    ? '<span style="font-size:11px; color:#b45309;">Estimado por specs</span>'
                    : '<span style="font-size:11px; color:#94a3b8;">Nao confirmado</span>';

            return `
                <tr>
                    <td style="padding:8px; border-bottom:1px solid #f1f5f9; font-weight:600; color:#0f172a;">
                        ${escapeHtml(server.name)}
                        <div>${source}</div>
                    </td>
                    <td style="padding:8px; border-bottom:1px solid #f1f5f9; color:#475569; text-transform:capitalize;">${escapeHtml(server.status || '-')}</td>
                    <td style="padding:8px; border-bottom:1px solid #f1f5f9; color:#475569;">${escapeHtml(server.planId || '-')}</td>
                    <td style="padding:8px; border-bottom:1px solid #f1f5f9; text-align:right; color:#0f172a;">${usd}</td>
                    <td style="padding:8px; border-bottom:1px solid #f1f5f9; text-align:right; color:#0f172a;">${brl}</td>
                </tr>
            `;
        }).join('');

        const warnings = [];
        if (provider.plansError) {
            warnings.push(`Nao foi possivel atualizar catalogo de planos agora: ${escapeHtml(provider.plansError)}`);
        }
        if (provider.liveServersError) {
            warnings.push(`Nao foi possivel consultar servidores em tempo real agora: ${escapeHtml(provider.liveServersError)}`);
        }

        const warning = warnings.length
            ? `<div style="margin-top:8px; font-size:12px; color:#b45309;">${warnings.join(' | ')}</div>`
            : '';

        return `
            <div style="border:1px solid #e2e8f0; border-radius:10px; padding:12px; margin-bottom:12px; background:#fff; overflow:auto;">
                ${providerHeader}
                <table style="width:100%; border-collapse:collapse; font-size:13px; min-width:700px;">
                    <thead>
                        <tr>
                            <th style="padding:8px; text-align:left; color:#475569; border-bottom:1px solid #e2e8f0;">Servidor</th>
                            <th style="padding:8px; text-align:left; color:#475569; border-bottom:1px solid #e2e8f0;">Status</th>
                            <th style="padding:8px; text-align:left; color:#475569; border-bottom:1px solid #e2e8f0;">Plano</th>
                            <th style="padding:8px; text-align:right; color:#475569; border-bottom:1px solid #e2e8f0;">USD</th>
                            <th style="padding:8px; text-align:right; color:#475569; border-bottom:1px solid #e2e8f0;">BRL</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
                ${warning}
            </div>
        `;
    }).join('');

    container.innerHTML = providersHtml;
}

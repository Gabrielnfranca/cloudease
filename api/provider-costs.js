import { supabaseUrl, supabaseKey } from '../lib/supabase.js';
import { createClient } from '@supabase/supabase-js';
import { fetchPlans, fetchServers } from '../lib/providers.js';

const PROVIDER_LABELS = {
    vultr: 'Vultr',
    digitalocean: 'DigitalOcean',
    linode: 'Linode',
    aws: 'AWS'
};

const parseNumber = (value) => {
    if (value === null || value === undefined) return null;
    const str = String(value).replace(',', '.');
    const match = str.match(/\d+(\.\d+)?/);
    return match ? Number(match[0]) : null;
};

const normalizePlanId = (value) => (value === null || value === undefined ? '' : String(value).trim().toLowerCase());

const getPlanCandidateIds = (specs = {}) => {
    const candidates = [
        specs.plan,
        specs.plan_id,
        specs.size_slug,
        specs.type,
        specs.flavor,
        specs.instance_type
    ];

    return [...new Set(candidates.map(normalizePlanId).filter(Boolean))];
};

const matchPlanBySpecs = (plans, specs = {}) => {
    const serverCpu = parseNumber(specs.cpu);
    const serverRam = parseNumber(specs.ram);
    const serverDisk = parseNumber(specs.storage);

    if (serverCpu === null || serverRam === null || serverDisk === null) return null;

    const matches = plans.filter((plan) => {
        const planCpu = Number(plan.cpu);
        const planRam = Number(plan.ram);
        const planDisk = Number(plan.disk);
        return Number.isFinite(planCpu) && Number.isFinite(planRam) && Number.isFinite(planDisk)
            && planCpu === serverCpu
            && planRam === serverRam
            && planDisk === serverDisk;
    });

    if (matches.length === 0) return null;

    const uniquePrices = new Set(matches.map((plan) => Number(plan.price)).filter((p) => Number.isFinite(p)));

    // Se houver planos com mesmas specs mas precos diferentes, evita chute.
    if (uniquePrices.size > 1) return null;

    return matches[0] || null;
};

async function getUsdBrlRate() {
    // Fonte gratuita sem chave de API para manter deploy simples.
    const response = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL');
    if (!response.ok) {
        throw new Error(`Falha ao buscar cotacao USD/BRL (status ${response.status})`);
    }

    const data = await response.json();
    const usdBrl = data?.USDBRL;
    const bid = usdBrl ? Number(usdBrl.bid) : null;

    if (!Number.isFinite(bid) || bid <= 0) {
        throw new Error('Cotacao USD/BRL invalida');
    }

    return {
        rate: bid,
        source: 'AwesomeAPI',
        updatedAt: usdBrl?.create_date || new Date().toISOString()
    };
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token nao fornecido' });
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
        global: {
            headers: {
                Authorization: authHeader
            }
        }
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return res.status(401).json({ error: 'Sessao invalida' });
    }

    const userId = user.id;

    try {
        const [providersResult, serversResult, exchange] = await Promise.all([
            supabase
                .from('providers')
                .select('id, provider_name, label, api_key')
                .eq('user_id', userId)
                .order('created_at', { ascending: false }),
            supabase
                .from('servers_cache')
                .select('id, provider_id, external_id, name, status, specs')
                .eq('user_id', userId)
                .order('created_at', { ascending: false }),
            getUsdBrlRate().catch((error) => ({ error: error.message }))
        ]);

        if (providersResult.error) throw providersResult.error;
        if (serversResult.error) throw serversResult.error;

        const providers = providersResult.data || [];
        const servers = serversResult.data || [];

        const serversByProviderId = new Map();
        for (const server of servers) {
            if (!serversByProviderId.has(server.provider_id)) {
                serversByProviderId.set(server.provider_id, []);
            }
            serversByProviderId.get(server.provider_id).push(server);
        }

        const exchangeRate = exchange?.rate || null;
        const exchangeMeta = {
            source: exchange?.source || 'N/A',
            updatedAt: exchange?.updatedAt || null,
            unavailableReason: exchange?.error || null
        };

        const providerCosts = [];

        for (const provider of providers) {
            const providerKey = String(provider.provider_name || '').toLowerCase();
            const providerServers = serversByProviderId.get(provider.id) || [];

            let plans = [];
            let plansError = null;
            let liveServers = [];
            let liveServersError = null;

            try {
                plans = await fetchPlans(providerKey, provider.api_key);
            } catch (error) {
                plansError = error.message;
            }

            try {
                liveServers = await fetchServers(providerKey, provider.api_key);
            } catch (error) {
                liveServersError = error.message;
            }

            const planMap = new Map(
                (plans || []).map((plan) => [normalizePlanId(plan.id), {
                    ...plan,
                    price: Number(plan.price)
                }])
            );

            const liveSpecsByExternalId = new Map(
                (liveServers || [])
                    .filter((server) => server && server.external_id)
                    .map((server) => [String(server.external_id), server.specs || {}])
            );

            const serverRows = providerServers.map((server) => {
                const cachedSpecs = server.specs || {};
                const liveSpecs = liveSpecsByExternalId.get(String(server.external_id || '')) || {};
                const specs = { ...cachedSpecs, ...liveSpecs };
                const candidates = getPlanCandidateIds(specs);

                let matchedPlan = null;
                let matchMethod = null;
                for (const candidateId of candidates) {
                    if (planMap.has(candidateId)) {
                        matchedPlan = planMap.get(candidateId);
                        matchMethod = 'plan_id';
                        break;
                    }
                }

                if (!matchedPlan && plans.length) {
                    matchedPlan = matchPlanBySpecs(plans, specs);
                    if (matchedPlan) matchMethod = 'specs';
                }

                const monthlyUsd = matchedPlan && Number.isFinite(Number(matchedPlan.price))
                    ? Number(matchedPlan.price)
                    : null;

                const monthlyBrl = monthlyUsd !== null && exchangeRate
                    ? Number((monthlyUsd * exchangeRate).toFixed(2))
                    : null;

                return {
                    id: server.id,
                    name: server.name || 'Servidor sem nome',
                    status: server.status || 'unknown',
                    planId: matchedPlan?.id || specs.plan || specs.plan_id || null,
                    monthlyUsd,
                    monthlyBrl,
                    hasPrice: monthlyUsd !== null,
                    matchMethod: matchMethod || 'unmatched'
                };
            }).sort((a, b) => (b.monthlyUsd || -1) - (a.monthlyUsd || -1));

            const totalUsd = serverRows.reduce((sum, row) => sum + (row.monthlyUsd || 0), 0);
            const totalBrl = exchangeRate ? Number((totalUsd * exchangeRate).toFixed(2)) : null;
            const pricedServers = serverRows.filter((row) => row.hasPrice).length;

            providerCosts.push({
                provider: providerKey,
                providerLabel: PROVIDER_LABELS[providerKey] || provider.label || providerKey,
                connectionLabel: provider.label || PROVIDER_LABELS[providerKey] || providerKey,
                totalServers: serverRows.length,
                pricedServers,
                totalUsd: Number(totalUsd.toFixed(2)),
                totalBrl,
                plansError,
                liveServersError,
                servers: serverRows
            });
        }

        return res.status(200).json({
            providers: providerCosts,
            exchange: {
                usdBrl: exchangeRate,
                ...exchangeMeta
            },
            generatedAt: new Date().toISOString()
        });
    } catch (error) {
        console.error('Erro ao calcular custos por provedor:', error);
        return res.status(500).json({ error: 'Falha ao calcular custos em tempo real' });
    }
}

import { supabaseUrl, supabaseKey } from '../lib/supabase.js';
import { createClient } from '@supabase/supabase-js';
import { fetchServerRealtimeMetrics } from '../lib/provisioner.js';

function getHealth(cpuUsagePct, memoryUsagePct, diskUsagePct) {
    const cpu = Number(cpuUsagePct);
    const memory = Number(memoryUsagePct);
    const disk = Number(diskUsagePct);

    if ([cpu, memory, disk].some((n) => n >= 90)) return 'critical';
    if ([cpu, memory, disk].some((n) => n >= 80)) return 'warning';
    return 'healthy';
}

function getSuggestion(cpuUsagePct, memoryUsagePct, diskUsagePct) {
    const cpu = Number(cpuUsagePct);
    const memory = Number(memoryUsagePct);
    const disk = Number(diskUsagePct);

    if (disk >= 90) {
        return 'Disco em nivel critico. Recomendado expandir armazenamento imediatamente.';
    }
    if (cpu >= 85 && memory >= 85) {
        return 'CPU e memoria altas. Recomendado upgrade do servidor ou dividir carga.';
    }
    if (cpu >= 85) {
        return 'CPU elevada. Avalie upgrade de vCPU ou criar novo servidor para balancear carga.';
    }
    if (memory >= 85) {
        return 'Memoria elevada. Avalie upgrade de RAM ou otimizar processos/aplicacao.';
    }
    if (disk >= 80) {
        return 'Disco em alerta. Planeje aumento de volume antes de atingir limite.';
    }

    return 'Servidor operando dentro do esperado.';
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

    try {
        const { data: servers, error } = await supabase
            .from('servers_cache')
            .select(`
                id,
                name,
                ip_address,
                status,
                specs,
                providers (provider_name, label)
            `)
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (error) {
            throw error;
        }

        const validServers = (servers || []).filter((server) => {
            const ip = String(server.ip_address || '').trim();
            return ip && ip !== '0.0.0.0' && ip !== '-' && ip !== 'Pendente';
        });

        const metrics = await Promise.all(validServers.map(async (server) => {
            const realtime = await fetchServerRealtimeMetrics(server.ip_address);

            if (!realtime.available) {
                return {
                    id: server.id,
                    name: server.name || 'Servidor sem nome',
                    ipAddress: server.ip_address,
                    provider: server.providers?.label || server.providers?.provider_name || 'Desconhecido',
                    status: server.status || 'unknown',
                    available: false,
                    reason: realtime.reason || 'Nao foi possivel coletar metricas em tempo real'
                };
            }

            const cpuUsagePct = Number(realtime.cpuUsagePct || 0);
            const memoryUsagePct = Number(realtime.memoryUsagePct || 0);
            const diskUsagePct = Number(realtime.diskUsagePct || 0);

            return {
                id: server.id,
                name: server.name || 'Servidor sem nome',
                ipAddress: server.ip_address,
                provider: server.providers?.label || server.providers?.provider_name || 'Desconhecido',
                status: server.status || 'unknown',
                available: true,
                cpuUsagePct,
                memoryUsagePct,
                diskUsagePct,
                memoryUsedKb: Number(realtime.memoryUsedKb || 0),
                memoryTotalKb: Number(realtime.memoryTotalKb || 0),
                diskUsedKb: Number(realtime.diskUsedKb || 0),
                diskTotalKb: Number(realtime.diskTotalKb || 0),
                rxKbps: Number(realtime.rxKbps || 0),
                txKbps: Number(realtime.txKbps || 0),
                load1: Number(realtime.load1 || 0),
                load5: Number(realtime.load5 || 0),
                load15: Number(realtime.load15 || 0),
                health: getHealth(cpuUsagePct, memoryUsagePct, diskUsagePct),
                suggestion: getSuggestion(cpuUsagePct, memoryUsagePct, diskUsagePct),
                collectedAt: realtime.collectedAt
            };
        }));

        const available = metrics.filter((m) => m.available);
        const avg = (field) => available.length
            ? Number((available.reduce((sum, item) => sum + (Number(item[field]) || 0), 0) / available.length).toFixed(1))
            : null;

        return res.status(200).json({
            generatedAt: new Date().toISOString(),
            refreshSeconds: 10,
            summary: {
                totalServers: validServers.length,
                availableServers: available.length,
                unavailableServers: validServers.length - available.length,
                avgCpuUsagePct: avg('cpuUsagePct'),
                avgMemoryUsagePct: avg('memoryUsagePct'),
                avgDiskUsagePct: avg('diskUsagePct'),
                overloadedServers: available.filter((m) => m.health !== 'healthy').length
            },
            servers: metrics
        });
    } catch (err) {
        console.error('Erro ao coletar metricas em tempo real:', err);
        return res.status(500).json({ error: 'Falha ao coletar metricas dos servidores' });
    }
}

import { supabaseUrl, supabaseKey } from '../lib/supabase.js';
import { createClient } from '@supabase/supabase-js';
import { createInstance, fetchServers, deleteInstance } from '../lib/providers.js';
import { discoverSites } from '../lib/provisioner.js';

export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST,DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token não fornecido' });
    }

    // Authenticated Client
    const supabase = createClient(supabaseUrl, supabaseKey, {
        global: {
            headers: {
                Authorization: authHeader
            }
        }
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        return res.status(401).json({ error: 'Sessão inválida' });
    }
    const userId = user.id;

    if (req.method === 'GET') {
        const { sync } = req.query;

        // SYNC LOGIC
        if (sync === 'true') {
            try {
                const { data: providers } = await supabase.from('providers').select('*').eq('user_id', userId);
                
                for (const provider of providers) {
                    try {
                        const providerKey = provider.provider_name.toLowerCase();
                        const remoteServers = await fetchServers(providerKey, provider.api_key);
                        
                        for (const server of remoteServers) {
                            // Upsert logic (Insert or Update) based on external_id + provider_id
                            // First check existing to get ID
                            const { data: existing } = await supabase
                                .from('servers_cache')
                                .select('id')
                                .eq('provider_id', provider.id)
                                .eq('external_id', server.external_id)
                                .single(); // Might be null

                            const payload = {
                                user_id: userId,
                                provider_id: provider.id,
                                external_id: server.external_id,
                                name: server.name,
                                ip_address: server.ip_address,
                                status: server.status,
                                specs: server.specs,
                                last_synced: new Date()
                            };

                            let serverId;
                            if (existing) {
                                await supabase.from('servers_cache').update(payload).eq('id', existing.id);
                                serverId = existing.id;
                            } else {
                                const { data: newServer } = await supabase.from('servers_cache').insert([payload]).select().single();
                                serverId = newServer.id;
                            }

                            // Site Discovery (simplified)
                            if (server.status === 'active' && server.ip_address !== '0.0.0.0') {
                                try {
                                    const sites = await discoverSites(server.ip_address);
                                    if (sites) {
                                        for (const domain of sites) {
                                            // Check site existence
                                            const { data: existingSite } = await supabase.from('sites').select('id').eq('domain', domain).single();
                                            if (!existingSite) {
                                                await supabase.from('sites').insert([{
                                                    user_id: userId,
                                                    server_id: serverId,
                                                    domain,
                                                    status: 'active'
                                                }]);
                                            }
                                        }
                                    }
                                } catch (e) { console.error('Site sync error', e); }
                            }
                        }
                    } catch (err) {
                        console.error(`Sync error for ${provider.provider_name}:`, err);
                    }
                }
                return res.status(200).json({ success: true });
            } catch (error) {
                return res.status(500).json({ error: 'Sync failed' });
            }
        }

        // LIST LOGIC
        const { data: servers, error } = await supabase
            .from('servers_cache')
            .select(`
                *,
                providers ( label, provider_name, created_at )
            `)
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) return res.status(500).json({ error: 'Erro ao listar servidores' });

        const formatted = servers.map(s => ({
            id: s.id,
            provider: formatProviderName(s.providers?.provider_name),
            name: s.name,
            logo: getProviderLogo(s.providers?.provider_name),
            cpu: s.specs?.cpu || 'N/A',
            ram: s.specs?.ram || 'N/A',
            storage: s.specs?.storage || 'N/A',
            os: s.specs?.os || 'Linux',
            region: s.specs?.region || 'Unknown',
            ipv4: s.ip_address,
            status: s.status,
            created_at: s.created_at
        }));

        return res.status(200).json(formatted);
    }

    if (req.method === 'POST') {
        // Create Request
        const { provider, region, plan, app, name, os_id } = req.body;
        
        const { data: provData } = await supabase
            .from('providers')
            .select('*')
            .eq('provider_name', provider)
            .eq('user_id', userId)
            .single();

        if (!provData) return res.status(400).json({ error: 'Provedor não conectado' });

        try {
            const result = await createInstance(provider, provData.api_key, { region, plan, app, name, os_id });
            
            let externalId = 'pending';
            if (result.instance?.id) externalId = result.instance.id;
            else if (result.droplet?.id) externalId = result.droplet.id;
            else if (result.id) externalId = result.id;

            await supabase.from('servers_cache').insert([{
                user_id: userId,
                provider_id: provData.id,
                external_id: externalId,
                name,
                status: 'creating',
                specs: { app, plan, region }
            }]);

            return res.status(201).json({ success: true, message: 'Criando servidor...' });
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    }

    if (req.method === 'DELETE') {
        const { id } = req.query;
        // Fetch server to get external ID
        const { data: server } = await supabase
            .from('servers_cache')
            .select(`*, providers(api_key, provider_name)`)
            .eq('id', id)
            .eq('user_id', userId)
            .single();

        if (server) {
            if (server.providers && server.external_id && server.external_id !== 'pending') {
                try {
                    console.log(`Deletando servidor remoto: ${server.providers.provider_name} #${server.external_id}`);
                    await deleteInstance(server.providers.provider_name.toLowerCase(), server.providers.api_key, server.external_id);
                } catch (e) { 
                    console.error('Remote delete failed', e);
                    return res.status(500).json({ error: 'Erro ao deletar no provedor: ' + e.message }); 
                }
            }
            await supabase.from('servers_cache').delete().eq('id', id);
        }
        return res.status(200).json({ success: true });
    }
}

function formatProviderName(name) {
    if (!name) return 'Desconhecido';
    return name.charAt(0).toUpperCase() + name.slice(1);
}

function getProviderLogo(name) {
    if (name === 'vultr') return 'https://www.vultr.com/favicon.ico';
    if (name === 'digitalocean') return 'https://www.digitalocean.com/favicon.ico';
    if (name === 'linode') return 'https://www.linode.com/favicon.ico';
    return 'assets/images/server-icon.png';
}

import { supabaseUrl, supabaseKey } from '../lib/supabase.js';
import { createClient } from '@supabase/supabase-js';
import { createInstance, fetchServers, deleteInstance, fetchPlans, fetchRegions, fetchOS } from '../lib/providers.js';
import { discoverSites } from '../lib/provisioner.js';
import { Client } from 'ssh2';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

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
                providers ( label, provider_name, created_at ),
                sites (count)
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
            ip_address: s.ip_address,
            status: s.status,
            created_at: s.created_at,
            sites_count: s.sites?.[0]?.count || 0
        }));

        return res.status(200).json(formatted);
    }

    if (req.method === 'POST') {
        const { action } = req.body || {};

        if (action === 'install_n8n_existing') {
            const { server_id } = req.body || {};
            if (!server_id) return res.status(400).json({ error: 'Servidor não informado' });

            const { data: server, error: serverError } = await supabase
                .from('servers_cache')
                .select('id, name, ip_address, status')
                .eq('id', server_id)
                .eq('user_id', userId)
                .single();

            if (serverError || !server) return res.status(404).json({ error: 'Servidor não encontrado' });
            if (!server.ip_address || server.ip_address === '0.0.0.0') return res.status(400).json({ error: 'Servidor sem IP válido' });

            const normalizedStatus = String(server.status || '').toLowerCase();
            if (normalizedStatus !== 'active') return res.status(400).json({ error: 'Servidor precisa estar ativo para instalar o n8n' });

            const n8nUser = 'admin';
            const n8nPassword = generateCredential(14);

            const installScript = buildN8nInstallScript(n8nUser, n8nPassword);
            try {
                await runSshScript(server.ip_address, installScript);
                return res.status(200).json({
                    success: true,
                    message: 'n8n instalado com sucesso',
                    server: {
                        id: server.id,
                        name: server.name,
                        ip_address: server.ip_address
                    },
                    access: {
                        service: 'n8n',
                        url: `http://${server.ip_address}:5678`,
                        user: n8nUser,
                        password: n8nPassword
                    }
                });
            } catch (error) {
                return res.status(500).json({ error: 'Falha ao instalar n8n: ' + error.message });
            }
        }

        // Create Request
        const { provider, region, plan, app, name, os_id } = req.body;

        if (!provider || !region || !plan || !os_id) {
            return res.status(400).json({ error: 'Dados obrigatórios ausentes para criar servidor' });
        }
        
        const { data: provData } = await supabase
            .from('providers')
            .select('*')
            .eq('provider_name', provider)
            .eq('user_id', userId)
            .single();

        if (!provData) return res.status(400).json({ error: 'Provedor não conectado' });

        try {
            const providerKey = String(provider).toLowerCase();
            const [plans, regions, osCatalog] = await Promise.all([
                fetchPlans(providerKey, provData.api_key),
                fetchRegions(providerKey, provData.api_key),
                fetchOS(providerKey, provData.api_key)
            ]);

            const selectedRegion = (regions || []).find((item) => String(item.id) === String(region));
            if (!selectedRegion) {
                return res.status(400).json({ error: 'Região inválida para o provedor selecionado' });
            }

            const selectedPlan = (plans || []).find((item) => String(item.id) === String(plan));
            if (!selectedPlan) {
                return res.status(400).json({ error: 'Plano inválido para o provedor selecionado' });
            }

            const hasLocations = Array.isArray(selectedPlan.locations) && selectedPlan.locations.length > 0;
            if (hasLocations) {
                const isPlanAvailableInRegion = selectedPlan.locations.some((loc) => String(loc).trim().toLowerCase() === String(region).trim().toLowerCase());
                if (!isPlanAvailableInRegion) {
                    return res.status(400).json({ error: 'Plano não disponível na região selecionada' });
                }
            }

            const selectedOs = (osCatalog || []).find((item) => String(item.id) === String(os_id));
            if (!selectedOs) {
                return res.status(400).json({ error: 'Sistema operacional inválido para o provedor selecionado' });
            }

            const result = await createInstance(providerKey, provData.api_key, {
                region,
                plan,
                app,
                name: (name || 'Novo Servidor').trim(),
                os_id
            });
            
            let externalId = 'pending';
            if (result.instance?.id) externalId = result.instance.id;
            else if (result.droplet?.id) externalId = result.droplet.id;
            else if (result.id) externalId = result.id;

            await supabase.from('servers_cache').insert([{
                user_id: userId,
                provider_id: provData.id,
                external_id: externalId,
                name: (name || 'Novo Servidor').trim(),
                status: 'creating',
                specs: {
                    app,
                    plan: selectedPlan.id,
                    region: selectedRegion.id,
                    os_id: selectedOs.id,
                    cpu: selectedPlan.cpu ? `${selectedPlan.cpu} vCPU` : undefined,
                    ram: selectedPlan.ram ? `${selectedPlan.ram} MB` : undefined,
                    storage: selectedPlan.disk ? `${selectedPlan.disk} GB` : undefined,
                    monthly_price_usd: Number.isFinite(Number(selectedPlan.price)) ? Number(selectedPlan.price) : null
                }
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
    if (name === 'aws') return 'assets/images/aws-logo.svg';
    return 'assets/images/server-icon.png';
}

function generateCredential(length = 14) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    let value = '';
    for (let i = 0; i < length; i += 1) {
        value += chars[crypto.randomInt(0, chars.length)];
    }
    return value;
}

function getPrivateKey() {
    if (process.env.SSH_PRIVATE_KEY) {
        return process.env.SSH_PRIVATE_KEY.replace(/\\n/g, '\n');
    }
    return fs.readFileSync(path.join(process.cwd(), 'keys', 'cloudease_rsa'));
}

function runSshScript(serverIp, scriptContent) {
    return new Promise((resolve, reject) => {
        let privateKey;
        try {
            privateKey = getPrivateKey();
        } catch (err) {
            reject(new Error('Chave SSH não encontrada para provisionamento'));
            return;
        }

        const conn = new Client();
        conn.on('ready', () => {
            conn.exec('bash -s', (err, stream) => {
                if (err) {
                    conn.end();
                    reject(err);
                    return;
                }

                let stderr = '';
                stream.stderr.on('data', (data) => {
                    stderr += data.toString();
                });

                stream.on('close', (code) => {
                    conn.end();
                    if (code === 0) {
                        resolve();
                    } else {
                        reject(new Error(stderr || `Comando remoto falhou com código ${code}`));
                    }
                });

                stream.end(scriptContent);
            });
        }).on('error', (err) => {
            reject(err);
        }).connect({
            host: serverIp,
            port: 22,
            username: 'root',
            privateKey,
            readyTimeout: 25000
        });
    });
}

function buildN8nInstallScript(user, password) {
    return `#!/bin/bash
set -e
export DEBIAN_FRONTEND=noninteractive

if ! command -v docker >/dev/null 2>&1; then
  apt-get update -y
  apt-get install -y ca-certificates curl gnupg lsb-release
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo \"$VERSION_CODENAME\") stable" > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable docker
  systemctl start docker
fi

mkdir -p /opt/n8n
cat > /opt/n8n/docker-compose.yml <<'YAML'
services:
  n8n:
    image: n8nio/n8n:latest
    restart: always
    ports:
      - "5678:5678"
    environment:
      - N8N_BASIC_AUTH_ACTIVE=true
      - N8N_BASIC_AUTH_USER=${user}
      - N8N_BASIC_AUTH_PASSWORD=${password}
      - N8N_HOST=0.0.0.0
      - N8N_PORT=5678
      - N8N_PROTOCOL=http
      - NODE_ENV=production
    volumes:
      - /opt/n8n/data:/home/node/.n8n
YAML

docker compose -f /opt/n8n/docker-compose.yml up -d
`;
}

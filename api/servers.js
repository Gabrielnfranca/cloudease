import db from '../lib/db.js';
import { createInstance, fetchServers } from '../lib/providers.js';

export default async function handler(req, res) {
    if (req.method === 'GET') {
        // Sincronização com Provedores
        try {
            const { rows: providers } = await db.query('SELECT * FROM providers WHERE user_id = 1');
            
            for (const provider of providers) {
                try {
                    const remoteServers = await fetchServers(provider.provider_name, provider.api_key);
                    
                    for (const server of remoteServers) {
                        // Tenta encontrar servidor existente pelo ID externo
                        let { rows: existing } = await db.query(
                            'SELECT id FROM servers_cache WHERE provider_id = $1 AND external_id = $2',
                            [provider.id, server.external_id]
                        );

                        // Se não achou pelo ID, tenta achar um 'pending' com o mesmo nome (criado recentemente)
                        if (existing.length === 0) {
                            const { rows: pending } = await db.query(
                                "SELECT id FROM servers_cache WHERE provider_id = $1 AND external_id = 'pending' AND name = $2",
                                [provider.id, server.name]
                            );
                            if (pending.length > 0) {
                                existing = pending;
                            }
                        }

                        if (existing.length > 0) {
                            // Atualiza
                            await db.query(
                                `UPDATE servers_cache SET 
                                    external_id = $1, 
                                    ip_address = $2, 
                                    status = $3, 
                                    specs = $4, 
                                    last_synced = NOW() 
                                WHERE id = $5`,
                                [server.external_id, server.ip_address, server.status, server.specs, existing[0].id]
                            );
                        } else {
                            // Insere novo
                            await db.query(
                                `INSERT INTO servers_cache (provider_id, external_id, name, ip_address, status, specs)
                                VALUES ($1, $2, $3, $4, $5, $6)`,
                                [provider.id, server.external_id, server.name, server.ip_address, server.status, server.specs]
                            );
                        }
                    }
                } catch (err) {
                    console.error(`Erro sync ${provider.provider_name}:`, err);
                }
            }
        } catch (error) {
            console.error('Erro geral de sync:', error);
        }

        // Listar servidores
        try {
            const query = `
                SELECT 
                    sc.*,
                    p.provider_name,
                    p.label as provider_label
                FROM servers_cache sc
                LEFT JOIN providers p ON sc.provider_id = p.id
                ORDER BY sc.created_at DESC
            `;
            const { rows } = await db.query(query);
            if (rows.length === 0) {
                return res.status(200).json([]);
            }
            const servers = rows.map(row => {
                const specs = row.specs || {};
                return {
                    id: row.id,
                    provider: formatProviderName(row.provider_name),
                    name: row.name,
                    logo: getProviderLogo(row.provider_name),
                    cpu: specs.cpu || 'N/A',
                    ram: specs.ram || 'N/A',
                    storage: specs.storage || 'N/A',
                    os: specs.os || 'Linux',
                    region: specs.region || 'Unknown',
                    plan: specs.plan || 'Standard',
                    ipv4: row.ip_address,
                    status: row.status,
                    created_at: row.created_at
                };
            });
            res.status(200).json(servers);
        } catch (error) {
            console.error('Erro ao buscar servidores:', error);
            res.status(500).json({ error: 'Erro interno ao buscar servidores' });
        }
    } else if (req.method === 'POST') {
        // Criar servidor
        const { provider, region, plan, app, name } = req.body;
        if (!provider || !region || !plan || !name) {
            return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
        }
        try {
            // Buscar token do provedor no banco de dados
            const { rows } = await db.query(
                'SELECT api_key, id FROM providers WHERE provider_name = $1 AND user_id = 1 LIMIT 1',
                [provider]
            );
            if (rows.length === 0) {
                return res.status(400).json({ error: 'Provedor não conectado. Vá em Conexões e conecte sua conta primeiro.' });
            }
            const { api_key: token, id: providerId } = rows[0];
            // Chamar API do provedor para criar a máquina
            const result = await createInstance(provider, token, {
                region,
                plan,
                app,
                name
            });

            // Extrai ID corretamente baseado no provedor
            let externalId = 'pending';
            if (result.instance?.id) externalId = result.instance.id; // Vultr
            else if (result.droplet?.id) externalId = result.droplet.id; // DigitalOcean
            else if (result.id) externalId = result.id; // Linode/Genérico

            // Salvar referência no banco de dados local (Cache)
            await db.query(`
                INSERT INTO servers_cache (provider_id, external_id, name, status, specs)
                VALUES ($1, $2, $3, 'creating', $4)
            `, [
                providerId, 
                externalId,
                name,
                { app: app, plan: plan, region: region }
            ]);
            return res.status(201).json({ 
                success: true, 
                message: 'Servidor sendo criado! O processo de instalação pode levar alguns minutos.',
                details: result
            });
        } catch (error) {
            console.error('Erro ao criar servidor:', error);
            return res.status(500).json({ error: error.message || 'Erro interno ao criar servidor' });
        }
    } else {
        res.status(405).json({ error: 'Method not allowed' });
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

import db from '../lib/db.js';
import { createInstance, fetchServers, deleteInstance } from '../lib/providers.js';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'sua_chave_secreta_super_segura';

export default async function handler(req, res) {
    // Autenticação JWT
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token de autenticação não fornecido' });
    }

    const token = authHeader.split(' ')[1];
    let userId;

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        userId = decoded.userId;
    } catch (error) {
        return res.status(401).json({ error: 'Token inválido ou expirado' });
    }
    if (req.method === 'GET') {
        const { sync } = req.query;

        // Sincronização com Provedores (Apenas se solicitado)
        if (sync === 'true') {
            try {
                const { rows: providers } = await db.query('SELECT * FROM providers WHERE user_id = $1', [userId]);
                
                for (const provider of providers) {
                    try {
                        // Garante que o nome do provedor esteja em minúsculo para bater com a chave do objeto PROVIDERS
                        const providerKey = provider.provider_name.toLowerCase();
                        const remoteServers = await fetchServers(providerKey, provider.api_key);
                        
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
                                        created_at = COALESCE($5, created_at),
                                        last_synced = NOW() 
                                    WHERE id = $6`,
                                    [server.external_id, server.ip_address, server.status, server.specs, server.created_at, existing[0].id]
                                );
                            } else {
                                // Insere novo
                                await db.query(
                                    `INSERT INTO servers_cache (provider_id, external_id, name, ip_address, status, specs, created_at)
                                    VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                                    [provider.id, server.external_id, server.name, server.ip_address, server.status, server.specs, server.created_at || new Date()]
                                );
                            }
                        }
                    } catch (err) {
                        console.error(`Erro sync ${provider.provider_name}:`, err);
                        // Se falhar a sync, retorna erro para o cliente saber
                        return res.status(500).json({ error: `Erro ao sincronizar com ${provider.provider_name}: ${err.message}` });
                    }
                }
            } catch (error) {
                console.error('Erro geral de sync:', error);
                return res.status(500).json({ error: `Erro geral de sincronização: ${error.message}` });
            }
        }

        // Listar servidores
        try {
            const query = `
                SELECT 
                    sc.*,
                    p.provider_name,
                    p.label as provider_label
                FROM servers_cache sc
                JOIN providers p ON sc.provider_id = p.id
                WHERE p.user_id = $1
                ORDER BY sc.created_at DESC
            `;
            const { rows } = await db.query(query, [userId]);
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
        const { provider, region, plan, app, name, os_id } = req.body;
        if (!provider || !region || !plan || !name) {
            return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
        }
        try {
            // Buscar token do provedor no banco de dados
            const { rows } = await db.query(
                'SELECT api_key, id FROM providers WHERE provider_name = $1 AND user_id = $2 LIMIT 1',
                [provider, userId]
            );
            if (rows.length === 0) {
                return res.status(400).json({ error: 'Provedor não conectado. Vá em Conexões e conecte sua conta primeiro.' });
            }
            const { api_key: token, id: providerId } = rows[0];
            // Chamar API do provedor para criar a máquina
            console.log(`Criando servidor na ${provider} para usuário ${userId}...`);
            const result = await createInstance(provider, token, {
                region,
                plan,
                app,
                name,
                os_id
            });
            console.log('Resultado da criação:', JSON.stringify(result));

            // Extrai ID corretamente baseado no provedor
            let externalId = 'pending';
            if (result.instance?.id) externalId = result.instance.id; // Vultr
            else if (result.droplet?.id) externalId = result.droplet.id; // DigitalOcean
            else if (result.id) externalId = result.id; // Linode/Genérico

            console.log(`ID Externo extraído: ${externalId}`);

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
            console.log('Servidor salvo no cache com sucesso.');
            
            return res.status(201).json({ 
                success: true, 
                message: 'Servidor sendo criado! O processo de instalação pode levar alguns minutos.',
                details: result
            });
        } catch (error) {
            console.error('Erro ao criar servidor:', error);
            return res.status(500).json({ error: error.message || 'Erro interno ao criar servidor' });
        }
    } else if (req.method === 'DELETE') {
        // Excluir servidor
        const { id } = req.query;
        if (!id) {
            return res.status(400).json({ error: 'ID do servidor é obrigatório' });
        }

        try {
            // Buscar informações do servidor para saber qual provedor e ID externo
            const { rows } = await db.query(`
                SELECT sc.id, sc.external_id, p.provider_name, p.api_key 
                FROM servers_cache sc
                JOIN providers p ON sc.provider_id = p.id
                WHERE sc.id = $1 AND p.user_id = $2
            `, [id, userId]);

            if (rows.length === 0) {
                return res.status(404).json({ error: 'Servidor não encontrado ou sem permissão.' });
            }

            const server = rows[0];

            // Se o ID externo for 'pending', significa que o servidor ainda não foi totalmente criado ou falhou.
            // Nesse caso, apenas removemos do banco de dados local.
            if (server.external_id !== 'pending') {
                // Excluir no provedor
                try {
                    await deleteInstance(server.provider_name.toLowerCase(), server.api_key, server.external_id);
                } catch (providerError) {
                    console.error('Erro ao excluir no provedor (ignorando para limpar DB):', providerError);
                    // Continuar para limpar o banco mesmo se falhar na API (ex: já deletado)
                }
            }

            // Excluir do banco de dados local
            await db.query('DELETE FROM servers_cache WHERE id = $1', [id]);

            // Também excluir sites associados (opcional, mas recomendado para manter consistência)
            await db.query('DELETE FROM sites WHERE server_id = $1', [id]);

            return res.status(200).json({ success: true, message: 'Servidor excluído com sucesso.' });

        } catch (error) {
            console.error('Erro ao excluir servidor:', error);
            return res.status(500).json({ error: error.message || 'Erro interno ao excluir servidor' });
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

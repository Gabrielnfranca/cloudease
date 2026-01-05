import db from '../lib/db.js';
import { validateToken, fetchServers } from '../lib/providers.js';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'sua_chave_secreta_super_segura';

export default async function handler(req, res) {
    // Autenticação JWT
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token de autenticação não fornecido' });
    }

    const tokenAuth = authHeader.split(' ')[1];
    let userId;

    try {
        const decoded = jwt.verify(tokenAuth, JWT_SECRET);
        userId = decoded.userId;
    } catch (error) {
        return res.status(401).json({ error: 'Token inválido ou expirado' });
    }

    // GET: Listar provedores
    if (req.method === 'GET') {
        try {
            // Busca provedores do usuário
            // Faz um LEFT JOIN com servers_cache para contar quantos servidores cada provedor tem
            const query = `
                SELECT 
                    p.id,
                    p.provider_name,
                    p.label,
                    p.created_at,
                    COUNT(sc.id) as total_servers
                FROM providers p
                LEFT JOIN servers_cache sc ON p.id = sc.provider_id
                WHERE p.user_id = $1
                GROUP BY p.id
                ORDER BY p.created_at DESC
            `;

            const { rows } = await db.query(query, [userId]);

            const providers = rows.map(row => ({
                id: row.id,
                provider: row.provider_name,
                name: row.label,
                ip_address: '-', // Provedores geralmente não têm um IP único, isso seria para servidores
                total_servers: parseInt(row.total_servers),
                created_at: row.created_at,
                status: 'Ativo' // Assumindo ativo se está no banco
            }));

            return res.status(200).json(providers);
        } catch (error) {
            console.error('Erro ao buscar provedores:', error);
            return res.status(500).json({ error: 'Erro interno ao buscar conexões' });
        }
    }

    // POST: Conectar novo provedor
    if (req.method === 'POST') {
        const { provider, name, token } = req.body;

        if (!provider || !name || !token) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        try {
            // 1. Validar o token com a API do provedor
            const isValid = await validateToken(provider, token);
            
            if (!isValid) {
                return res.status(401).json({ error: 'Token inválido ou erro de conexão com o provedor. Verifique sua API Key.' });
            }

            // 2. Salvar no banco de dados
            const query = `
                INSERT INTO providers (user_id, provider_name, label, api_key)
                VALUES ($1, $2, $3, $4)
                RETURNING id;
            `;
            
            const result = await db.query(query, [userId, provider, name, token]);
            const providerId = result.rows[0].id;
            
            console.log(`Provedor ${provider} conectado com sucesso: ${name}, ID: ${providerId}`);

            // 3. Sincronizar servidores imediatamente
            try {
                const servers = await fetchServers(provider, token);
                
                for (const server of servers) {
                    await db.query(`
                        INSERT INTO servers_cache (provider_id, external_id, name, ip_address, status, specs)
                        VALUES ($1, $2, $3, $4, $5, $6)
                    `, [providerId, server.external_id, server.name, server.ip_address, server.status, server.specs]);
                }
                console.log(`${servers.length} servidores sincronizados.`);
            } catch (syncError) {
                console.error('Erro ao sincronizar servidores inicial:', syncError);
                // Não falha a requisição principal, apenas loga o erro
            }

            return res.status(200).json({ success: true, message: 'Provedor conectado e servidores sincronizados!' });

        } catch (error) {
            console.error('Erro ao conectar provedor:', error);
            return res.status(500).json({ error: 'Erro interno do servidor' });
        }
    }

    // DELETE: Remover provedor
    if (req.method === 'DELETE') {
        const { id } = req.query;

        if (!id) {
            return res.status(400).json({ error: 'Provider ID is required' });
        }

        try {
            // 1. Delete associated servers from cache (only if provider belongs to user)
            // First verify ownership
            const checkOwner = await db.query('SELECT id FROM providers WHERE id = $1 AND user_id = $2', [id, userId]);
            if (checkOwner.rows.length === 0) {
                return res.status(404).json({ error: 'Provider not found or access denied' });
            }

            await db.query('DELETE FROM servers_cache WHERE provider_id = $1', [id]);

            // 2. Delete the provider
            const result = await db.query('DELETE FROM providers WHERE id = $1 AND user_id = $2 RETURNING id', [id, userId]);

            if (result.rowCount === 0) {
                return res.status(404).json({ error: 'Provider not found' });
            }

            return res.status(200).json({ success: true, message: 'Provider deleted successfully' });
        } catch (error) {
            console.error('Error deleting provider:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}

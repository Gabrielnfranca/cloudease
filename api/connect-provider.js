import db from '../lib/db';
import { validateToken, fetchServers } from '../lib/providers';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

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
        // Garante que existe um usuário admin (ID 1) para associar o provedor
        await db.query(`
            INSERT INTO users (id, name, email, password) 
            VALUES (1, 'Admin', 'admin@cloudease.com', 'temp_pass') 
            ON CONFLICT (id) DO NOTHING
        `);

        const query = `
            INSERT INTO providers (user_id, provider_name, label, api_key)
            VALUES ($1, $2, $3, $4)
            RETURNING id;
        `;
        
        const result = await db.query(query, [1, provider, name, token]);
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

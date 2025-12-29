import db from '../lib/db.js';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Busca provedores do usuário (ID 1 fixo por enquanto)
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
            WHERE p.user_id = 1
            GROUP BY p.id
            ORDER BY p.created_at DESC
        `;

        const { rows } = await db.query(query);

        const providers = rows.map(row => ({
            id: row.id,
            provider: row.provider_name,
            name: row.label,
            ip_address: '-', // Provedores geralmente não têm um IP único, isso seria para servidores
            total_servers: parseInt(row.total_servers),
            created_at: row.created_at,
            status: 'Ativo' // Assumindo ativo se está no banco
        }));

        res.status(200).json(providers);
    } catch (error) {
        console.error('Erro ao buscar provedores:', error);
        res.status(500).json({ error: 'Erro interno ao buscar conexões' });
    }
}

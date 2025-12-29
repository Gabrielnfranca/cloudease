import db from '../lib/db.js';
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

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

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

        res.status(200).json(providers);
    } catch (error) {
        console.error('Erro ao buscar provedores:', error);
        res.status(500).json({ error: 'Erro interno ao buscar conexões' });
    }
}

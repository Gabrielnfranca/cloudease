import db from '../lib/db.js';

export default async function handler(req, res) {
    // Segurança simples: só permite acesso se for admin (ID 1)
    // Em produção, use autenticação JWT/sessão
    const userId = 1;
    if (req.method === 'GET') {
        // Dashboard: usuários, chamados, faturamento
        const users = await db.query('SELECT id, name, email, status, last_login FROM users ORDER BY id DESC');
        const tickets = await db.query('SELECT t.*, u.name as user_name FROM tickets t LEFT JOIN users u ON t.user_id = u.id ORDER BY t.created_at DESC LIMIT 10');
        const revenue = await db.query('SELECT * FROM revenue ORDER BY created_at DESC LIMIT 10');
        const totalRevenue = await db.query('SELECT SUM(amount) as total FROM revenue');
        res.status(200).json({
            users: users.rows,
            tickets: tickets.rows,
            revenue: revenue.rows,
            totalRevenue: totalRevenue.rows[0]?.total || 0
        });
    } else {
        res.status(405).json({ error: 'Method not allowed' });
    }
}

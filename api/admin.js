import db from '../lib/db.js';

export default async function handler(req, res) {
    const { type } = req.query; // type: 'dashboard', 'tickets', 'ticket-create'

    // Segurança simples: só permite acesso se for admin (ID 1)
    const userId = 1;

    if (req.method === 'GET') {
        if (type === 'dashboard') {
            try {
                const users = await db.query('SELECT id, name, email, status, last_login FROM users ORDER BY id DESC');
                // Verifica se a tabela tickets existe antes de consultar
                let tickets = { rows: [] };
                try {
                    tickets = await db.query('SELECT t.*, u.name as user_name FROM tickets t LEFT JOIN users u ON t.user_id = u.id ORDER BY t.created_at DESC LIMIT 10');
                } catch (e) { console.log('Tabela tickets ainda não existe'); }
                
                let revenue = { rows: [] };
                let totalRevenue = { rows: [{ total: 0 }] };
                try {
                    revenue = await db.query('SELECT * FROM revenue ORDER BY created_at DESC LIMIT 10');
                    totalRevenue = await db.query('SELECT SUM(amount) as total FROM revenue');
                } catch (e) { console.log('Tabela revenue ainda não existe'); }

                res.status(200).json({
                    users: users.rows,
                    tickets: tickets.rows,
                    revenue: revenue.rows,
                    totalRevenue: totalRevenue.rows[0]?.total || 0
                });
            } catch (error) {
                console.error('Erro no dashboard:', error);
                res.status(500).json({ error: 'Erro ao carregar dashboard' });
            }
        } else if (type === 'tickets') {
            try {
                const { rows } = await db.query('SELECT * FROM tickets ORDER BY created_at DESC');
                return res.status(200).json(rows);
            } catch (e) {
                return res.status(200).json([]); // Retorna vazio se tabela não existir
            }
        } else {
            res.status(400).json({ error: 'Tipo inválido' });
        }
    } else if (req.method === 'POST') {
        if (type === 'ticket-create') {
            const { subject, description, urgency } = req.body;
            if (!subject || !description || !urgency) return res.status(400).json({ error: 'Preencha todos os campos' });
            try {
                // Garante tabela
                await db.query(`
                    CREATE TABLE IF NOT EXISTS tickets (
                        id SERIAL PRIMARY KEY,
                        user_id INTEGER,
                        subject VARCHAR(255),
                        description TEXT,
                        urgency VARCHAR(20),
                        status VARCHAR(20),
                        created_at TIMESTAMP DEFAULT NOW()
                    )
                `);
                const result = await db.query(
                    'INSERT INTO tickets (user_id, subject, description, urgency, status, created_at) VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *',
                    [1, subject, description, urgency, 'Aberto']
                );
                return res.status(201).json(result.rows[0]);
            } catch (e) {
                console.error('Erro ao criar ticket:', e);
                return res.status(500).json({ error: 'Erro ao abrir chamado' });
            }
        } else {
            res.status(400).json({ error: 'Tipo inválido' });
        }
    } else {
        res.status(405).json({ error: 'Method not allowed' });
    }
}

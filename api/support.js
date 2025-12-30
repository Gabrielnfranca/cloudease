import db from '../lib/db.js';

export default async function handler(req, res) {
    // Simulação de usuário logado (ID 1)
    const userId = 1;

    if (req.method === 'GET') {
        try {
            // Garante que a tabela existe
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

            const { rows } = await db.query(
                'SELECT * FROM tickets WHERE user_id = $1 ORDER BY created_at DESC',
                [userId]
            );
            res.status(200).json(rows);
        } catch (error) {
            console.error('Erro ao buscar tickets:', error);
            res.status(500).json({ error: 'Erro ao carregar chamados' });
        }
    } else if (req.method === 'POST') {
        const { subject, description, urgency } = req.body;

        if (!subject || !description || !urgency) {
            return res.status(400).json({ error: 'Preencha todos os campos' });
        }

        try {
            const result = await db.query(
                'INSERT INTO tickets (user_id, subject, description, urgency, status, created_at) VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *',
                [userId, subject, description, urgency, 'Aberto']
            );
            res.status(201).json(result.rows[0]);
        } catch (error) {
            console.error('Erro ao criar ticket:', error);
            res.status(500).json({ error: 'Erro ao abrir chamado' });
        }
    } else {
        res.status(405).json({ error: 'Method not allowed' });
    }
}

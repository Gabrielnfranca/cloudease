import db from '../lib/db';

export default async function handler(req, res) {
    if (req.method === 'GET') {
        // Lista todos os chamados do usuário (admin por padrão)
        const { rows } = await db.query('SELECT * FROM tickets ORDER BY created_at DESC');
        return res.status(200).json(rows);
    }
    if (req.method === 'POST') {
        const { subject, description, urgency } = req.body;
        if (!subject || !description || !urgency) return res.status(400).json({ error: 'Preencha todos os campos' });
        try {
            const result = await db.query(
                'INSERT INTO tickets (user_id, subject, description, urgency, status, created_at) VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *',
                [1, subject, description, urgency, 'Aberto']
            );
            return res.status(201).json(result.rows[0]);
        } catch (e) {
            return res.status(500).json({ error: 'Erro ao abrir chamado' });
        }
    }
    res.status(405).json({ error: 'Method not allowed' });
}

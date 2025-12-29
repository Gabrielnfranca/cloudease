import db from '../lib/db';

export default async function handler(req, res) {
    if (req.method === 'GET') {
        // Lista todos os domínios
        const { rows } = await db.query('SELECT * FROM domains ORDER BY created_at DESC');
        return res.status(200).json(rows);
    }
    if (req.method === 'POST') {
        const { domain } = req.body;
        if (!domain) return res.status(400).json({ error: 'Domínio é obrigatório' });
        try {
            const result = await db.query(
                'INSERT INTO domains (domain, created_at) VALUES ($1, NOW()) RETURNING *',
                [domain]
            );
            return res.status(201).json(result.rows[0]);
        } catch (e) {
            return res.status(500).json({ error: 'Erro ao adicionar domínio' });
        }
    }
    res.status(405).json({ error: 'Method not allowed' });
}

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

    if (req.method !== 'DELETE') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

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

        res.status(200).json({ success: true, message: 'Provider deleted successfully' });
    } catch (error) {
        console.error('Error deleting provider:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

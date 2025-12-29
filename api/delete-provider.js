import db from '../lib/db.js';

export default async function handler(req, res) {
    if (req.method !== 'DELETE') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { id } = req.query;

    if (!id) {
        return res.status(400).json({ error: 'Provider ID is required' });
    }

    try {
        // 1. Delete associated servers from cache
        await db.query('DELETE FROM servers_cache WHERE provider_id = $1', [id]);

        // 2. Delete the provider
        const result = await db.query('DELETE FROM providers WHERE id = $1 AND user_id = 1 RETURNING id', [id]);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Provider not found' });
        }

        res.status(200).json({ success: true, message: 'Provider deleted successfully' });
    } catch (error) {
        console.error('Error deleting provider:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

import db from '../lib/db.js';

export default async function handler(req, res) {
    try {
        const providers = await db.query('SELECT * FROM providers');
        const servers = await db.query('SELECT * FROM servers_cache');
        
        res.status(200).json({
            providers: providers.rows,
            servers: servers.rows
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

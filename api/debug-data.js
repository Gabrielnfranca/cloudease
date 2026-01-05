import db from '../lib/db.js';

export default async function handler(req, res) {
    try {
        const servers = await db.query('SELECT id, name, external_id, ip_address FROM servers_cache');
        const sites = await db.query('SELECT id, domain, server_id FROM sites');
        
        res.status(200).json({
            servers: servers.rows,
            sites: sites.rows
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

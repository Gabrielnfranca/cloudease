import db from './lib/db.js';

async function check() {
    console.log('--- Checking Sites ---');
    const sites = await db.query('SELECT id, domain, status, server_id, ip_address FROM sites');
    console.table(sites.rows);

    console.log('--- Checking Servers ---');
    const servers = await db.query('SELECT id, name, ip_address FROM servers_cache');
    console.table(servers.rows);
}

check().catch(console.error);

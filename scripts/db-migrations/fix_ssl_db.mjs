import pg from 'pg';
const { Client } = pg;
const client = new Client({
    connectionString: 'postgresql://postgres:Ganorfra150216%40%40@db.bnkttosqtddxpzgjwlkf.supabase.co:5432/postgres',
    ssl: { rejectUnauthorized: false }
});
await client.connect();
const r = await client.query('UPDATE sites SET ssl_active = false WHERE ssl_active = true RETURNING domain, ssl_active');
console.log('Sites corrigidos:', r.rows);
const r2 = await client.query('SELECT domain, ssl_active FROM sites');
console.log('Estado atual:', r2.rows);
await client.end();

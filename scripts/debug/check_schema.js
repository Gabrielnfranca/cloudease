import { Client } from 'pg';

function buildDatabaseUrl() {
    const match = (process.env.SUPABASE_URL || '').match(/^https:\/\/([a-z0-9]+)\.supabase\.co/i);
    const ref = match ? match[1] : null;
    const password = process.env.SUPABASE_DB_PASSWORD;
    return `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres?sslmode=require`;
}

const client = new Client({ connectionString: buildDatabaseUrl(), ssl: { rejectUnauthorized: false } });
await client.connect();
const r = await client.query(
    `select table_name, column_name, data_type from information_schema.columns
     where table_schema='public' and table_name in ('sites','domains','applications')
     order by table_name, ordinal_position`
);
r.rows.forEach(x => console.log(`${x.table_name}.${x.column_name} (${x.data_type})`));
await client.end();

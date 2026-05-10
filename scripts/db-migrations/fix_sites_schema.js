import { Client } from 'pg';

function buildDatabaseUrl() {
    const refMatch = (process.env.SUPABASE_URL || '').match(/^https:\/\/([a-z0-9]+)\.supabase\.co/i);
    const ref = refMatch ? refMatch[1] : null;
    const password = process.env.SUPABASE_DB_PASSWORD;

    if (!ref || !password) {
        throw new Error('SUPABASE_URL/SUPABASE_DB_PASSWORD ausentes.');
    }

    return `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres?sslmode=require`;
}

async function main() {
    const client = new Client({
        connectionString: buildDatabaseUrl(),
        ssl: { rejectUnauthorized: false }
    });

    await client.connect();

    try {
        await client.query('begin');

        await client.query(`
            alter table public.sites add column if not exists platform text default 'php';
            alter table public.sites add column if not exists php_version text;
            alter table public.sites add column if not exists enable_temp_url boolean default false;
            alter table public.sites add column if not exists "system_user" text;
            alter table public.sites add column if not exists system_password text;
            alter table public.sites add column if not exists last_error text;
            alter table public.sites add column if not exists ssl_active boolean default false;
        `);

        await client.query(`
            update public.sites
               set platform = coalesce(platform, 'php'),
                   php_version = coalesce(php_version, '8.2'),
                   enable_temp_url = coalesce(enable_temp_url, false),
                   ssl_active = coalesce(ssl_active, (status = 'active'))
             where platform is null
                or php_version is null
                or enable_temp_url is null
                or ssl_active is null;
        `);

        await client.query('commit');
        console.log('Schema de sites ajustado com sucesso.');
    } catch (err) {
        await client.query('rollback').catch(() => {});
        throw err;
    } finally {
        await client.end();
    }
}

main().catch((err) => {
    console.error('Falha ao ajustar schema de sites:', err.message);
    process.exit(1);
});

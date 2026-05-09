import fs from 'fs';
import zlib from 'zlib';
import { Client } from 'pg';

const BACKUP_PATH = process.env.BACKUP_PATH || 'C:/Users/gabri/Downloads/db_cluster-27-01-2026@03-44-00.backup.gz';
const TARGET_EMAIL = process.env.TARGET_EMAIL || 'gn.franca81@gmail.com';

function projectRefFromUrl(url) {
    const match = (url || '').match(/^https:\/\/([a-z0-9]+)\.supabase\.co/i);
    return match ? match[1] : null;
}

function buildDatabaseUrl() {
    if (process.env.DATABASE_URL_SUPABASE) return process.env.DATABASE_URL_SUPABASE;

    const ref = projectRefFromUrl(process.env.SUPABASE_URL);
    const password = process.env.SUPABASE_DB_PASSWORD;
    if (!ref || !password) {
        throw new Error('Defina DATABASE_URL_SUPABASE ou SUPABASE_URL + SUPABASE_DB_PASSWORD.');
    }

    return `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres?sslmode=require`;
}

function parseCopyValue(token) {
    if (token === '\\N') return null;

    let out = '';
    for (let i = 0; i < token.length; i += 1) {
        const ch = token[i];
        if (ch !== '\\') {
            out += ch;
            continue;
        }

        const next = token[i + 1];
        i += 1;

        if (next === 't') out += '\t';
        else if (next === 'n') out += '\n';
        else if (next === 'r') out += '\r';
        else if (next === 'b') out += '\b';
        else if (next === 'f') out += '\f';
        else if (next === '\\') out += '\\';
        else out += next;
    }

    return out;
}

function splitCopyRow(line) {
    const parts = [];
    let current = '';
    let escaped = false;

    for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];
        if (escaped) {
            current += `\\${ch}`;
            escaped = false;
            continue;
        }

        if (ch === '\\') {
            escaped = true;
            continue;
        }

        if (ch === '\t') {
            parts.push(parseCopyValue(current));
            current = '';
            continue;
        }

        current += ch;
    }

    parts.push(parseCopyValue(current));
    return parts;
}

function extractCopyBlocks(sqlText, wantedTables) {
    const lines = sqlText.split(/\r?\n/);
    const blocks = new Map();

    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        const match = line.match(/^COPY\s+([^\s]+)\s+\(([^)]+)\)\s+FROM\s+stdin;$/);
        if (!match) continue;

        const table = match[1];
        if (!wantedTables.has(table)) continue;

        const columns = match[2].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
        const rows = [];
        i += 1;
        while (i < lines.length && lines[i] !== '\\.') {
            rows.push(splitCopyRow(lines[i]));
            i += 1;
        }

        blocks.set(table, { columns, rows });
    }

    return blocks;
}

async function ensureSchema(client) {
    await client.query(`
        create extension if not exists "uuid-ossp";

        create table if not exists public.profiles (
          id uuid primary key references auth.users(id) on delete cascade,
          name text,
          email text,
          is_admin boolean default false,
          status text default 'active',
          last_login timestamp with time zone,
          created_at timestamp with time zone default now(),
          updated_at timestamp with time zone default now()
        );

        create table if not exists public.providers (
          id serial primary key,
          user_id uuid references public.profiles(id) on delete cascade not null,
          provider_name text not null,
          api_key text not null,
          label text,
          created_at timestamp with time zone default now()
        );

        create table if not exists public.servers_cache (
          id serial primary key,
          user_id uuid references public.profiles(id) on delete cascade not null,
          provider_id integer references public.providers(id) on delete set null,
          external_id text,
          name text,
          ip_address text,
          status text,
          specs jsonb,
          created_at timestamp with time zone default now(),
          last_synced timestamp with time zone default now()
        );

        create table if not exists public.sites (
          id serial primary key,
          user_id uuid references public.profiles(id) on delete cascade not null,
          server_id integer references public.servers_cache(id) on delete set null,
          domain text,
          status text default 'active',
          created_at timestamp with time zone default now()
        );
    `);
}

function rowsToObjects(block) {
    if (!block) return [];
    return block.rows.map((row) => {
        const obj = {};
        block.columns.forEach((col, idx) => {
            obj[col] = row[idx] ?? null;
        });
        return obj;
    });
}

async function main() {
    if (!fs.existsSync(BACKUP_PATH)) {
        throw new Error(`Backup nao encontrado: ${BACKUP_PATH}`);
    }

    const databaseUrl = buildDatabaseUrl();
    const gzip = fs.readFileSync(BACKUP_PATH);
    const sqlText = zlib.gunzipSync(gzip).toString('utf8');

    const tables = new Set(['public.providers', 'public.servers_cache']);
    const blocks = extractCopyBlocks(sqlText, tables);

    const providerRows = rowsToObjects(blocks.get('public.providers'));
    const serverRows = rowsToObjects(blocks.get('public.servers_cache'));

    if (providerRows.length === 0) {
        throw new Error('Backup nao contem dados em public.providers.');
    }

    const client = new Client({
        connectionString: databaseUrl,
        ssl: { rejectUnauthorized: false }
    });

    await client.connect();

    try {
        await ensureSchema(client);

        const userRes = await client.query(
            `select id from auth.users where email = $1 order by created_at desc limit 1`,
            [TARGET_EMAIL]
        );

        if (userRes.rowCount === 0) {
            throw new Error(`Usuario ${TARGET_EMAIL} nao encontrado em auth.users.`);
        }

        const targetUserId = userRes.rows[0].id;

        await client.query(
            `insert into public.profiles (id, email, name, is_admin)
             values ($1, $2, $3, true)
             on conflict (id) do update set email = excluded.email, name = excluded.name, is_admin = true, updated_at = now()`,
            [targetUserId, TARGET_EMAIL, 'Gabriel Admin']
        );

        await client.query('begin');

        await client.query('delete from public.servers_cache where user_id = $1', [targetUserId]);
        await client.query('delete from public.providers where user_id = $1', [targetUserId]);

        const providerIdMap = new Map();

        for (const row of providerRows) {
            const insert = await client.query(
                `insert into public.providers (user_id, provider_name, api_key, label, created_at)
                 values ($1, $2, $3, $4, $5)
                 returning id`,
                [
                    targetUserId,
                    row.provider_name,
                    row.api_key,
                    row.label,
                    row.created_at || new Date().toISOString()
                ]
            );

            providerIdMap.set(String(row.id), insert.rows[0].id);
        }

        let restoredServers = 0;
        for (const row of serverRows) {
            const mappedProviderId = row.provider_id != null ? providerIdMap.get(String(row.provider_id)) : null;
            if (row.provider_id != null && !mappedProviderId) continue;

            const specsValue = row.specs ? JSON.parse(row.specs) : null;

            await client.query(
                `insert into public.servers_cache (user_id, provider_id, external_id, name, ip_address, status, specs, created_at, last_synced)
                 values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [
                    targetUserId,
                    mappedProviderId,
                    row.external_id,
                    row.name,
                    row.ip_address,
                    row.status,
                    specsValue,
                    row.created_at || new Date().toISOString(),
                    row.last_synced || new Date().toISOString()
                ]
            );
            restoredServers += 1;
        }

        await client.query('commit');

        console.log(`Restore concluido: ${providerRows.length} conexoes e ${restoredServers} servidores.`);
    } catch (err) {
        await client.query('rollback').catch(() => {});
        throw err;
    } finally {
        await client.end();
    }
}

main().catch((err) => {
    console.error('Falha no restore de conexoes/servidores:', err.message);
    process.exit(1);
});

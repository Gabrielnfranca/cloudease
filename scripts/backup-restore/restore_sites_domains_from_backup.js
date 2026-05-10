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

async function ensureSitesDomainsTables(client) {
    await client.query(`
        create table if not exists public.sites (
          id serial primary key,
          user_id uuid references public.profiles(id) on delete cascade not null,
          server_id integer references public.servers_cache(id) on delete set null,
          domain text not null,
          platform text default 'php',
          php_version text,
          status text default 'provisioning',
          enable_temp_url boolean default false,
          "system_user" text,
          system_password text,
          last_error text,
          created_at timestamp with time zone default now()
        );

        create table if not exists public.applications (
          id serial primary key,
          site_id integer references public.sites(id) on delete cascade,
          db_name text,
          db_user text,
          db_pass text,
          db_host text default 'localhost',
          db_port integer default 3306,
          wp_admin_user text,
          wp_admin_pass text,
          created_at timestamp with time zone default now()
        );

        create table if not exists public.domains (
          id serial primary key,
          user_id uuid references public.profiles(id) on delete cascade not null,
          domain text not null,
          registrar text,
          dns_provider text,
          expiry_date timestamp with time zone,
          status text default 'active',
          created_at timestamp with time zone default now()
        );
    `);
}

async function main() {
    if (!fs.existsSync(BACKUP_PATH)) {
        throw new Error(`Backup nao encontrado: ${BACKUP_PATH}`);
    }

    const databaseUrl = buildDatabaseUrl();
    console.log('Lendo backup...');
    const gzip = fs.readFileSync(BACKUP_PATH);
    const sqlText = zlib.gunzipSync(gzip).toString('utf8');

    const tables = new Set(['public.sites', 'public.domains', 'public.applications', 'public.servers_cache']);
    const blocks = extractCopyBlocks(sqlText, tables);

    const siteRows = rowsToObjects(blocks.get('public.sites'));
    const domainRows = rowsToObjects(blocks.get('public.domains'));
    const appRows = rowsToObjects(blocks.get('public.applications'));
    const serverRows = rowsToObjects(blocks.get('public.servers_cache'));

    console.log(`Encontrado no backup: ${siteRows.length} sites, ${domainRows.length} dominios, ${appRows.length} aplicacoes, ${serverRows.length} servidores (para mapeamento)`);

    const client = new Client({
        connectionString: databaseUrl,
        ssl: { rejectUnauthorized: false }
    });

    await client.connect();
    console.log('Conectado ao banco de dados.');

    try {
        await ensureSitesDomainsTables(client);

        // Busca ID do usuario alvo
        const userRes = await client.query(
            `select id from auth.users where email = $1 order by created_at desc limit 1`,
            [TARGET_EMAIL]
        );

        if (userRes.rowCount === 0) {
            throw new Error(`Usuario ${TARGET_EMAIL} nao encontrado em auth.users.`);
        }

        const targetUserId = userRes.rows[0].id;
        console.log(`Usuario alvo: ${targetUserId}`);

        // Busca servidores atuais para montar mapeamento (old backup id -> new id) por nome
        const currentServers = await client.query(
            `select id, name from public.servers_cache where user_id = $1`,
            [targetUserId]
        );

        // Monta mapa nome -> novo id
        const serverNameToNewId = new Map();
        for (const row of currentServers.rows) {
            serverNameToNewId.set(row.name, row.id);
        }
        console.log('Servidores atuais:', Object.fromEntries(serverNameToNewId));

        // Monta mapa old_server_id (do backup) -> new server id (via nome)
        const oldServerIdToNewId = new Map();
        for (const row of serverRows) {
            const newId = serverNameToNewId.get(row.name);
            if (newId) {
                oldServerIdToNewId.set(String(row.id), newId);
            }
        }
        console.log('Mapeamento de server IDs (backup -> novo):', Object.fromEntries(oldServerIdToNewId));

        await client.query('begin');

        // Limpa dados existentes (na ordem correta devido a FK)
        await client.query('delete from public.applications where site_id in (select id from public.sites where user_id = $1)', [targetUserId]);
        await client.query('delete from public.sites where user_id = $1', [targetUserId]);
        await client.query('delete from public.domains where user_id = $1', [targetUserId]);

        // Restaura sites
        const siteIdMap = new Map(); // old site id -> new site id
        let restoredSites = 0;
        for (const row of siteRows) {
            const mappedServerId = row.server_id != null ? (oldServerIdToNewId.get(String(row.server_id)) ?? null) : null;

            const res = await client.query(
                `insert into public.sites
                   (user_id, server_id, domain, status, created_at)
                 values ($1,$2,$3,$4,$5)
                 returning id`,
                [
                    targetUserId,
                    mappedServerId,
                    row.domain,
                    row.status || 'active',
                    row.created_at || new Date().toISOString()
                ]
            );

            siteIdMap.set(String(row.id), res.rows[0].id);
            restoredSites += 1;
            console.log(`  Site: ${row.domain} (server_id: ${row.server_id} -> ${mappedServerId}) -> novo id ${res.rows[0].id}`);
        }

        // Restaura applications vinculadas aos sites
        let restoredApps = 0;
        for (const row of appRows) {
            const newSiteId = siteIdMap.get(String(row.site_id));
            if (!newSiteId) {
                console.log(`  Aplicacao ignorada: site_id ${row.site_id} nao mapeado`);
                continue;
            }

            await client.query(
                `insert into public.applications
                   (site_id, db_name, db_user, db_pass, db_host, db_port, wp_admin_user, wp_admin_pass, created_at)
                 values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
                [
                    newSiteId,
                    row.db_name,
                    row.db_user,
                    row.db_pass,
                    row.db_host || 'localhost',
                    row.db_port ? parseInt(row.db_port, 10) : 3306,
                    row.wp_admin_user,
                    row.wp_admin_pass,
                    row.created_at || new Date().toISOString()
                ]
            );
            restoredApps += 1;
        }

        // Restaura domains
        let restoredDomains = 0;
        for (const row of domainRows) {
            await client.query(
                `insert into public.domains
                   (user_id, domain, registrar, dns_provider, expiry_date, status, created_at)
                 values ($1,$2,$3,$4,$5,$6,$7)`,
                [
                    targetUserId,
                    row.domain,
                    row.registrar,
                    row.dns_provider,
                    row.expiry_date,
                    row.status || 'active',
                    row.created_at || new Date().toISOString()
                ]
            );
            restoredDomains += 1;
            console.log(`  Dominio: ${row.domain}`);
        }

        await client.query('commit');

        console.log(`\nRestore concluido:`);
        console.log(`  ${restoredSites} sites restaurados`);
        console.log(`  ${restoredApps} aplicacoes restauradas`);
        console.log(`  ${restoredDomains} dominios restaurados`);
    } catch (err) {
        await client.query('rollback').catch(() => {});
        throw err;
    } finally {
        await client.end();
    }
}

main().catch((err) => {
    console.error('Falha no restore de sites/dominios:', err.message);
    process.exit(1);
});

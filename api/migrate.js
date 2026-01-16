import db from '../lib/db.js';

const MIGRATION_FIX_SYNC = `
    ALTER TABLE sites ADD COLUMN IF NOT EXISTS server_id INTEGER;
    ALTER TABLE sites ADD COLUMN IF NOT EXISTS cache_type VARCHAR(50);
    ALTER TABLE sites ADD COLUMN IF NOT EXISTS enable_temp_url BOOLEAN DEFAULT FALSE;
    ALTER TABLE sites ADD COLUMN IF NOT EXISTS last_error TEXT;

    CREATE TABLE IF NOT EXISTS applications (
      id SERIAL PRIMARY KEY,
      site_id INTEGER REFERENCES sites(id) ON DELETE CASCADE,
      type VARCHAR(50) NOT NULL,
      version VARCHAR(50),
      db_name VARCHAR(100),
      db_user VARCHAR(100),
      db_pass VARCHAR(255),
      admin_email VARCHAR(255),
      admin_user VARCHAR(100),
      installation_status VARCHAR(50) DEFAULT 'pending',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id SERIAL PRIMARY KEY,
      server_id INTEGER REFERENCES servers_cache(id),
      site_id INTEGER REFERENCES sites(id) ON DELETE CASCADE,
      type VARCHAR(50),
      status VARCHAR(50) DEFAULT 'queued',
      log_output TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      finished_at TIMESTAMP WITH TIME ZONE
    );
`;

const MIGRATION_SITE_DETAILS = `
    DO $$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sites' AND column_name='system_user') THEN
            ALTER TABLE sites ADD COLUMN "system_user" VARCHAR(50);
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sites' AND column_name='system_password') THEN
            ALTER TABLE sites ADD COLUMN "system_password" VARCHAR(255);
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sites' AND column_name='ssl_active') THEN
            ALTER TABLE sites ADD COLUMN "ssl_active" BOOLEAN DEFAULT FALSE;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='applications' AND column_name='db_host') THEN
            ALTER TABLE applications ADD COLUMN db_host VARCHAR(100) DEFAULT 'localhost';
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='applications' AND column_name='db_port') THEN
            ALTER TABLE applications ADD COLUMN db_port INTEGER DEFAULT 3306;
        END IF;
    END $$;
`;

const MIGRATION_ADMIN_PANEL = `
    CREATE TABLE IF NOT EXISTS profiles (
      id uuid not null primary key,
      email text not null,
      name text,
      created_at timestamp with time zone default timezone('utc'::text, now()) not null
    );

    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_login TIMESTAMP WITH TIME ZONE;

    CREATE TABLE IF NOT EXISTS tickets (
        id SERIAL PRIMARY KEY,
        user_id UUID REFERENCES profiles(id),
        subject VARCHAR(255) NOT NULL,
        description TEXT,
        urgency VARCHAR(20) DEFAULT 'medium',
        status VARCHAR(20) DEFAULT 'open',
        created_at TIMESTAMP DEFAULT NOW()
    );
`;

export default async function handler(req, res) {
    try {
        console.log('Iniciando migrações...');

        // Migration 1: Fix Sync
        console.log('Executando migration fix-sync...');
        await db.query(MIGRATION_FIX_SYNC);

        // Migration 2: Site Details (SFTP/Access)
        console.log('Executando migration site-details...');
        await db.query(MIGRATION_SITE_DETAILS);

        // Migration 3: Admin Panel
        console.log('Executando migration admin-panel...');
        await db.query(MIGRATION_ADMIN_PANEL);
        
        console.log('Todas as migrações concluídas.');
        res.status(200).json({ message: 'Migrações executadas com sucesso!' });
    } catch (error) {
        console.error('Erro na migration:', error);
        res.status(500).json({ error: error.message });
    }
}

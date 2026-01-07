-- Atualizações para sincronização confiável de sites e aplicações
ALTER TABLE sites ADD COLUMN IF NOT EXISTS server_id INTEGER; -- Garantir que existe
ALTER TABLE sites ADD COLUMN IF NOT EXISTS cache_type VARCHAR(50);
ALTER TABLE sites ADD COLUMN IF NOT EXISTS enable_temp_url BOOLEAN DEFAULT FALSE;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS last_error TEXT;

-- Tabela de Aplicações (Detalhes específicos do WP/App)
CREATE TABLE IF NOT EXISTS applications (
  id SERIAL PRIMARY KEY,
  site_id INTEGER REFERENCES sites(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL, -- 'wordpress', 'laravel', etc
  version VARCHAR(50),
  db_name VARCHAR(100),
  db_user VARCHAR(100),
  db_pass VARCHAR(255), -- Melhor encriptar isso em prod, mas para POC ok
  admin_email VARCHAR(255),
  admin_user VARCHAR(100),
  installation_status VARCHAR(50) DEFAULT 'pending', -- pending, db_created, files_created, completed, error
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de Jobs para logs assíncronos
CREATE TABLE IF NOT EXISTS jobs (
  id SERIAL PRIMARY KEY,
  server_id INTEGER REFERENCES servers_cache(id), -- Pode ser null se for job global
  site_id INTEGER REFERENCES sites(id) ON DELETE CASCADE,
  type VARCHAR(50),
  status VARCHAR(50) DEFAULT 'queued',
  log_output TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMP WITH TIME ZONE
);

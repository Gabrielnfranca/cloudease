-- Migration: Performance Indexes (fixed)
-- Desc: Adiciona índices em colunas existentes para otimizar queries

-- Foreign Keys existentes
CREATE INDEX IF NOT EXISTS idx_sites_server_id ON sites(server_id);
CREATE INDEX IF NOT EXISTS idx_sites_status ON sites(status);

-- Providers
CREATE INDEX IF NOT EXISTS idx_providers_user_id ON providers(user_id);
CREATE INDEX IF NOT EXISTS idx_servers_cache_provider_id ON servers_cache(provider_id);

-- Tickets & Invoices (Admin Panel)
CREATE INDEX IF NOT EXISTS idx_tickets_user_id ON tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);

CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);

-- Analyze
ANALYZE sites;
ANALYZE servers_cache;
ANALYZE tickets;
ANALYZE providers;
ANALYZE invoices;

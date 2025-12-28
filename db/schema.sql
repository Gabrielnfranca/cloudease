-- Tabela de Usuários
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de Provedores Conectados (Chaves de API)
CREATE TABLE IF NOT EXISTS providers (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  provider_name VARCHAR(50) NOT NULL, -- 'digitalocean', 'vultr', 'linode'
  api_key VARCHAR(255) NOT NULL, -- Em produção, isso deve ser criptografado!
  label VARCHAR(100), -- Nome amigável para a conta (ex: "Conta Pessoal")
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de Cache de Servidores (para não consultar a API externa toda hora)
CREATE TABLE IF NOT EXISTS servers_cache (
  id SERIAL PRIMARY KEY,
  provider_id INTEGER REFERENCES providers(id),
  external_id VARCHAR(100) NOT NULL, -- ID do servidor na DigitalOcean/Vultr
  name VARCHAR(255),
  ip_address VARCHAR(45),
  status VARCHAR(50),
  specs JSONB, -- Detalhes como CPU, RAM
  last_synced TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

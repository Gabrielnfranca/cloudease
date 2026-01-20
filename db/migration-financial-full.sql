
-- Tabela de Planos
CREATE TABLE IF NOT EXISTS plans (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    billing_cycle VARCHAR(20) DEFAULT 'monthly',
    description TEXT,
    features JSONB,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de Assinaturas
CREATE TABLE IF NOT EXISTS subscriptions (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL,
    plan_id INTEGER REFERENCES plans(id),
    status VARCHAR(20) DEFAULT 'active', -- active, past_due, canceled, trialing
    current_period_start TIMESTAMP WITH TIME ZONE,
    current_period_end TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de Faturas
CREATE TABLE IF NOT EXISTS invoices (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL,
    subscription_id INTEGER REFERENCES subscriptions(id),
    amount DECIMAL(10, 2) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending', -- pending, paid, overdue, void
    payment_method VARCHAR(50), -- pix, boleto, credit_card
    due_date TIMESTAMP WITH TIME ZONE,
    paid_at TIMESTAMP WITH TIME ZONE,
    pdf_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de Métodos de Pagamento
CREATE TABLE IF NOT EXISTS payment_methods (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL,
    type VARCHAR(20) NOT NULL, -- credit_card
    brand VARCHAR(20), -- visa, mastercard, elo
    last4 VARCHAR(4),
    exp_month INTEGER,
    exp_year INTEGER,
    holder_name VARCHAR(100),
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Inserir Planos Padrão (Se não existir)
INSERT INTO plans (name, price, features, description) 
VALUES 
('Starter', 49.90, '["1 Servidor", "5 Sites", "SSL Grátis", "Suporte por Email"]', 'Ideal para quem está começando'),
('Pro', 99.90, '["3 Servidores", "15 Sites", "SSL Grátis", "Backup Automático", "Suporte Prioritário"]', 'Para agências e profissionais'),
('Business', 199.90, '["10 Servidores", "Sites Ilimitados", "SSL Grátis", "Backup Diário", "Gerente de Conta"]', 'Para grandes operações')
ON CONFLICT DO NOTHING;

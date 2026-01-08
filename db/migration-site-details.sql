-- Migration para adicionar campos de SFTP e gerenciamento na tabela applications
-- Adiciona colunas se não existirem (embora application geralmente armazene configs do app, 
-- informações de "acesso" como SFTP user podem ficar aqui ou vinculadas ao site)

DO $$
BEGIN
    -- Adicionar colunas para SFTP/System User se não existirem na tabela sites ou applications
    -- Vamos adicionar em 'sites' pois é um dado de sistema do site, não necessariamente da aplicação (WP)
    
    -- Check system_user in sites
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sites' AND column_name='system_user') THEN
        ALTER TABLE sites ADD COLUMN system_user VARCHAR(50);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sites' AND column_name='system_password') THEN
        ALTER TABLE sites ADD COLUMN system_password VARCHAR(255);
    END IF;
    
    -- Check db_host in applications (often localhost, but good to have)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='applications' AND column_name='db_host') THEN
        ALTER TABLE applications ADD COLUMN db_host VARCHAR(100) DEFAULT 'localhost';
    END IF;

    -- Check db_port in applications
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='applications' AND column_name='db_port') THEN
        ALTER TABLE applications ADD COLUMN db_port INTEGER DEFAULT 3306;
    END IF;

END $$;

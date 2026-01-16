-- Migration para adicionar coluna ssl_active na tabela sites
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sites' AND column_name='ssl_active') THEN
        ALTER TABLE sites ADD COLUMN "ssl_active" BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

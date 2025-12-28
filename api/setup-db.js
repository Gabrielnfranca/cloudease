import db from '../lib/db';

export default async function handler(req, res) {
    try {
        // Criação da tabela de usuários
        await db.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Criação da tabela de provedores
        await db.query(`
            CREATE TABLE IF NOT EXISTS providers (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                provider_name VARCHAR(50) NOT NULL,
                api_key VARCHAR(255) NOT NULL,
                label VARCHAR(100),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Criação da tabela de cache de servidores
        await db.query(`
            CREATE TABLE IF NOT EXISTS servers_cache (
                id SERIAL PRIMARY KEY,
                provider_id INTEGER REFERENCES providers(id),
                external_id VARCHAR(100) NOT NULL,
                name VARCHAR(255),
                ip_address VARCHAR(45),
                status VARCHAR(50),
                specs JSONB,
                last_synced TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        res.status(200).json({ message: 'Banco de dados configurado com sucesso!' });
    } catch (error) {
        console.error('Erro ao configurar banco de dados:', error);
        res.status(500).json({ error: 'Erro ao configurar banco de dados', details: error.message });
    }
}

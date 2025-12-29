import db from '../lib/db.js';
import bcrypt from 'bcryptjs';

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

        // Criação da tabela de sites
        await db.query(`
            CREATE TABLE IF NOT EXISTS sites (
                id SERIAL PRIMARY KEY,
                server_id INTEGER, -- Referência ao ID do servidor (pode ser o ID do cache ou externo)
                domain VARCHAR(255) NOT NULL,
                platform VARCHAR(50),
                php_version VARCHAR(10),
                cache_type VARCHAR(50),
                status VARCHAR(50) DEFAULT 'active',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Criar usuário admin padrão
        const email = 'admin@cloudease.com';
        const password = 'admin123';
        const name = 'Administrador';

        const userCheck = await db.query('SELECT id FROM users WHERE email = $1', [email]);
        
        let message = 'Banco de dados configurado com sucesso!';

        if (userCheck.rows.length === 0) {
             const salt = await bcrypt.genSalt(10);
             const hashedPassword = await bcrypt.hash(password, salt);
             
             await db.query(
                'INSERT INTO users (name, email, password) VALUES ($1, $2, $3)',
                [name, email, hashedPassword]
            );
            message += ' Usuário admin criado: admin@cloudease.com / admin123';
        } else {
            message += ' Usuário admin já existe.';
        }

        res.status(200).json({ success: true, message });
    } catch (error) {
        console.error('Erro ao configurar banco de dados:', error);
        res.status(500).json({ 
            error: 'Erro ao configurar banco de dados', 
            details: error.message,
            stack: error.stack 
        });
    }
}

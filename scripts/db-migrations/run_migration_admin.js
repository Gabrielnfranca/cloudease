import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../lib/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carregar variáveis de ambiente
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf-8');
    envConfig.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) {
            process.env[key.trim()] = value.trim();
        }
    });
}

async function runMigration() {
    try {
        const sqlPath = path.resolve(__dirname, '../db/migration-admin-features.sql');
        const sql = fs.readFileSync(sqlPath, 'utf-8');
        
        console.log("Executando migração: db/migration-admin-features.sql");
        await db.query(sql);
        console.log("✅ Migração Admin Features concluída com sucesso!");
    } catch (error) {
        console.error("❌ Erro ao executar migração:", error);
    }
}

runMigration();

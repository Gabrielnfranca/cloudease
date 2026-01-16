import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../lib/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carregar variáveis de ambiente do arquivo .env manualmente
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf-8');
    envConfig.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) {
            process.env[key.trim()] = value.trim();
        }
    });
    console.log("Variáveis de ambiente carregadas do .env");
} else {
    console.warn("Arquivo .env não encontrado. Tentando usar variáveis de ambiente do sistema...");
}

async function runMigration() {
    try {
        const sqlPath = path.resolve(__dirname, '../db/migration-financial.sql');
        const sql = fs.readFileSync(sqlPath, 'utf-8');
        
        console.log("Executando migração: db/migration-financial.sql");
        console.log("Conectando ao banco de dados...");
        
        // Executar o SQL
        await db.query(sql);
        
        console.log("✅ Migração concluída com sucesso!");
    } catch (error) {
        console.error("❌ Erro ao executar migração:", error);
    } 
}

runMigration();

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../lib/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carregar .env
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

async function checkSchema() {
    const tables = ['sites', 'servers_cache', 'providers', 'tickets', 'invoices'];
    
    for (const table of tables) {
        try {
            const res = await db.query(`
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = $1
            `, [table]);
            
            console.log(`\n--- Table: ${table} ---`);
            res.rows.forEach(r => console.log(`${r.column_name} (${r.data_type})`));
            
            const hasUserId = res.rows.some(r => r.column_name === 'user_id');
            console.log(`Has user_id? ${hasUserId ? 'YES' : 'NO'}`);
        } catch (e) {
            console.error(`Error checking ${table}:`, e.message);
        }
    }
    process.exit();
}

checkSchema();

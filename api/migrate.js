import db from '../lib/db.js';
import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
    try {
        const migrationPath = path.join(process.cwd(), 'db', 'migration-fix-sync.sql');
        const migrationSql = fs.readFileSync(migrationPath, 'utf8');

        console.log('Executando migration...');
        await db.query(migrationSql);
        
        res.status(200).json({ message: 'Migração executada com sucesso! Tabelas jobs e applications criadas.' });
    } catch (error) {
        console.error('Erro na migration:', error);
        res.status(500).json({ error: error.message });
    }
}

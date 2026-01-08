import db from '../lib/db.js';
import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
    try {
        // Migration 1: Fix Sync
        const migrationPath = path.join(process.cwd(), 'db', 'migration-fix-sync.sql');
        const migrationSql = fs.readFileSync(migrationPath, 'utf8');
        console.log('Executando migration fix-sync...');
        await db.query(migrationSql);

        // Migration 2: Site Details (SFTP/Access)
        const migrationDetailsPath = path.join(process.cwd(), 'db', 'migration-site-details.sql');
        if (fs.existsSync(migrationDetailsPath)) {
             const migrationDetailsSql = fs.readFileSync(migrationDetailsPath, 'utf8');
             console.log('Executando migration site-details...');
             await db.query(migrationDetailsSql);
        }
        
        res.status(200).json({ message: 'Migrações executadas com sucesso!' });
    } catch (error) {
        console.error('Erro na migration:', error);
        res.status(500).json({ error: error.message });
    }
}

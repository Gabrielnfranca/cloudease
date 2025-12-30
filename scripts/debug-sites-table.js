import db from '../lib/db.js';
import fs from 'fs';
import path from 'path';

// Load .env manually
try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
        const envConfig = fs.readFileSync(envPath, 'utf-8');
        envConfig.split('\n').forEach(line => {
            const parts = line.split('=');
            if (parts.length >= 2) {
                const key = parts[0].trim();
                const value = parts.slice(1).join('=').trim();
                if (key && value && !key.startsWith('#')) {
                    process.env[key] = value;
                }
            }
        });
        console.log('.env loaded');
    }
} catch (e) {
    console.log('Could not load .env', e);
}

async function checkColumns() {
    try {
        console.log('Checking sites table columns...');
        const result = await db.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'sites';
        `);
        console.table(result.rows);
        
        console.log('Testing SELECT query...');
        const query = `
            SELECT 
                s.id, 
                s.domain, 
                s.platform, 
                s.php_version, 
                s.status, 
                s.created_at,
                s.enable_temp_url,
                s.last_error
            FROM sites s
            LIMIT 1
        `;
        await db.query(query);
        console.log('SELECT query successful!');
        
    } catch (error) {
        console.error('Error:', error.message);
    }
    process.exit(0);
}

checkColumns();

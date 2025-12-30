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

async function checkError() {
    try {
        const res = await db.query('SELECT domain, status, last_error, created_at FROM sites ORDER BY created_at DESC LIMIT 1');
        console.log('Latest Site Status:');
        console.table(res.rows);
    } catch (error) {
        console.error('Error:', error);
    }
    process.exit(0);
}

checkError();

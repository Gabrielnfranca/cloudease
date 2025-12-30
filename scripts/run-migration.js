import fs from 'fs';
import path from 'path';
import db from '../lib/db.js';

// Load .env manually since dotenv is not installed
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

async function run() {
    try {
        console.log('Running migration...');
        await db.query('ALTER TABLE sites ADD COLUMN IF NOT EXISTS enable_temp_url BOOLEAN DEFAULT TRUE;');
        console.log('Migration successful!');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

run();

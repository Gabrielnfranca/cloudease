import { supabaseUrl, supabaseKey } from '../lib/supabase.js';
import { createClient } from '@supabase/supabase-js';
import db from '../lib/db.js';

export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST,DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // Authenticate
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token não fornecido' });
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey, {
        global: {
            headers: { Authorization: authHeader }
        }
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        return res.status(401).json({ error: 'Sessão inválida' });
    }
    const userIdStr = user.id; // UUID from Supabase

    // Ensure Tables Exist (Light migration check)
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS tickets (
                id SERIAL PRIMARY KEY,
                user_id UUID, -- Altered to UUID to match Supabase Auth
                subject VARCHAR(255),
                description TEXT,
                urgency VARCHAR(20),
                department VARCHAR(50),
                status VARCHAR(20),
                related_resource_type VARCHAR(20),
                related_resource_id INTEGER,
                related_resource_label VARCHAR(255),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `);
        // Add columns if missing (Safe Migration)
        await db.query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tickets' AND column_name='department') THEN
                    ALTER TABLE tickets ADD COLUMN department VARCHAR(50);
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tickets' AND column_name='related_resource_type') THEN
                    ALTER TABLE tickets ADD COLUMN related_resource_type VARCHAR(20);
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tickets' AND column_name='related_resource_id') THEN
                    ALTER TABLE tickets ADD COLUMN related_resource_id INTEGER;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tickets' AND column_name='related_resource_label') THEN
                    ALTER TABLE tickets ADD COLUMN related_resource_label VARCHAR(255);
                END IF;
                -- Compatibility check: user_id type
                -- If it was INTEGER (from simulation), specific migration might be needed, but assuming UUID for new project is safer or text cast.
            END $$;
        `);
    } catch (e) {
        console.error('Schema check error', e);
    }

    if (req.method === 'GET') {
        try {
            // Note: user_id::text casting used to support legacy integer ids if mixed, but ideally should match
            const { rows } = await db.query(
                `SELECT * FROM tickets WHERE user_id::text = $1 ORDER BY created_at DESC`,
                [userIdStr]
            );
            res.status(200).json(rows);
        } catch (error) {
            console.error('Erro ao buscar tickets:', error);
            res.status(500).json({ error: 'Erro ao carregar chamados' });
        }
    } else if (req.method === 'POST') {
        const { subject, description, urgency, department, related_resource_type, related_resource_id } = req.body;

        if (!subject || !description || !urgency) {
            return res.status(400).json({ error: 'Preencha todos os campos obrigatórios' });
        }

        let resourceLabel = null;
        if (related_resource_type && related_resource_id) {
            // Fetch label for display
            try {
                if (related_resource_type === 'server') {
                    const { rows } = await db.query('SELECT name, ip_address FROM servers_cache WHERE id = $1', [related_resource_id]);
                    if (rows[0]) resourceLabel = `${rows[0].name} (${rows[0].ip_address})`;
                } else if (related_resource_type === 'site') {
                    const { rows } = await db.query('SELECT domain FROM sites WHERE id = $1', [related_resource_id]);
                    if (rows[0]) resourceLabel = rows[0].domain;
                }
            } catch (e) {
                console.error('Resource fetch error', e);
            }
        }

        try {
            const result = await db.query(
                `INSERT INTO tickets 
                (user_id, subject, description, urgency, department, status, related_resource_type, related_resource_id, related_resource_label, created_at) 
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()) 
                RETURNING *`,
                [userIdStr, subject, description, urgency, department, 'Aberto', related_resource_type, related_resource_id, resourceLabel]
            );
            res.status(201).json(result.rows[0]);
        } catch (error) {
            console.error('Erro ao criar ticket:', error);
            res.status(500).json({ error: 'Erro ao abrir chamado' });
        }
    } else {
        res.status(405).json({ error: 'Method not allowed' });
    }
}

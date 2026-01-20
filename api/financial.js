import { supabaseUrl, supabaseKey } from '../lib/supabase.js';
import { createClient } from '@supabase/supabase-js';
import db from '../lib/db.js';

export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST,PUT,DELETE');
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
        global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        return res.status(401).json({ error: 'Sessão inválida' });
    }
    const userId = user.id;

    if (req.method === 'GET') {
        try {
            // 1. Assinatura e Plano
            const { rows: subRows } = await db.query(`
                SELECT s.*, p.name as plan_name, p.price, p.features, p.description, p.billing_cycle
                FROM subscriptions s
                JOIN plans p ON s.plan_id = p.id
                WHERE s.user_id = $1 
                ORDER BY s.created_at DESC
                LIMIT 1
            `, [userId]);

            const subscription = subRows[0] || null;

            // 2. Faturas
            const { rows: invoices } = await db.query(`
                SELECT * FROM invoices WHERE user_id = $1 ORDER BY created_at DESC LIMIT 12
            `, [userId]);

            // 3. Métodos
            const { rows: methods } = await db.query(`
                SELECT * FROM payment_methods WHERE user_id = $1 ORDER BY is_default DESC
            `, [userId]);
            
            // 4. Planos Disponíveis
            const { rows: plans } = await db.query('SELECT * FROM plans WHERE active = TRUE ORDER BY price ASC');

            return res.status(200).json({
                subscription,
                invoices,
                paymentMethods: methods,
                availablePlans: plans
            });
        } catch (error) {
            console.error('Financial API Error:', error);
            return res.status(500).json({ error: 'Erro ao buscar dados financeiros' });
        }
    }

    if (req.method === 'POST') {
        // Mock Upgrades/Payment Updates
        const { action, planId } = req.body;

        if (action === 'upgrade') {
            // Mock upgrade logic
            try {
                // Deactivate old
                 await db.query(`UPDATE subscriptions SET status = 'canceled' WHERE user_id = $1`, [userId]);
                 
                 // Activate new
                 const { rows } = await db.query(`
                    INSERT INTO subscriptions (user_id, plan_id, status, current_period_start, current_period_end)
                    VALUES ($1, $2, 'active', NOW(), NOW() + INTERVAL '1 month')
                    RETURNING *
                 `, [userId, planId]);
                 
                 return res.status(200).json({ success: true, subscription: rows[0] });
            } catch (err) {
                 return res.status(500).json({ error: err.message });
            }
        }
    }
    
    return res.status(405).json({ error: 'Method not allowed' });
}

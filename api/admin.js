import { supabase } from '../lib/supabase.js';

export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const { type } = req.query; 

    // 1. Authenticate user
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token não fornecido' });
    }
    const token = authHeader.split(' ')[1];
    
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
        return res.status(401).json({ error: 'Sessão inválida' });
    }

    // 2. Check if Admin (Verify 'is_admin' column in profiles)
    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single();
    
    if (profileError || !profile || !profile.is_admin) {
        // Fallback for dev: if specific email, allow
        if (user.email !== 'admin@cloudease.com') { // Replace with your admin email
            return res.status(403).json({ error: 'Acesso negado. Apenas administradores.' });
        }
    }

    if (req.method === 'GET') {
        if (type === 'dashboard') {
            try {
                // Fetch Users
                const { data: users, error: errUsers } = await supabase
                    .from('profiles')
                    .select('id, name, email, status, last_login, created_at')
                    .order('created_at', { ascending: false });

                // Fetch Tickets
                // We need to fetch user names manually if relation isn't perfect or use foreign key
                // Note: The select query assumes 'tickets' has foreign key to 'profiles'
                const { data: tickets, error: errTickets } = await supabase
                    .from('tickets')
                    .select('*, profiles(name, email)') 
                    .order('created_at', { ascending: false })
                    .limit(10);
                
                // Fetch Revenue (Mock or Real Table)
                let revenue = [];
                let totalRevenue = 0;
                const { data: invoices, error: errInv } = await supabase
                    .from('invoices')
                    .select('*')
                    .order('created_at', { ascending: false })
                    .limit(10);
                
                if (invoices) {
                    revenue = invoices;
                    // Calculate total
                    const { data: allInv } = await supabase.from('invoices').select('amount');
                    if (allInv) {
                        totalRevenue = allInv.reduce((sum, inv) => sum + Number(inv.amount), 0);
                    }
                }

                if (errUsers) throw errUsers;

                return res.status(200).json({
                    users: users || [],
                    tickets: tickets || [],
                    revenue: revenue || [],
                    totalRevenue: totalRevenue
                });

            } catch (error) {
                console.error('Admin Dashboard Error:', error);
                return res.status(500).json({ error: error.message });
            }
        } 
        
        else if (type === 'tickets') {
             const { data: tickets } = await supabase.from('tickets').select('*, profiles(name)').order('created_at', {ascending:false});
             return res.status(200).json(tickets || []);
        }

        return res.status(400).json({ error: 'Tipo inválido' });
    }

    if (req.method === 'POST') {
        const { action, id } = req.body;
        
        // Admin Actions
        if (action === 'delete_user') {
            // Requires Service Role usually to delete from Auth, but we can delete from public tables
            // To delete from Auth, we need supabaseAdmin client (server-side only with service key)
            // For now, we will just mark as 'banned' in profile or delete profile data
            try {
                await supabase.from('profiles').update({ status: 'banned' }).eq('id', id);
                return res.status(200).json({ success: true });
            } catch (e) { return res.status(500).json({error: e.message}); }
        }

        if (action === 'update_ticket') {
            const { status, ticket_id } = req.body;
            await supabase.from('tickets').update({ status }).eq('id', ticket_id);
            return res.status(200).json({ success: true });
        }
    }

    res.status(405).json({ error: 'Method not allowed' });
}

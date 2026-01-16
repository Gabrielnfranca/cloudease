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
        // Fallback for dev: check specific email or ID
        const allowedAdmins = ['admin@cloudease.com', 'gabrielnfranca@cloudease.com', 'gn.franca81@gmail.com'];
        const allowedIds = [
            'cd4cdf58-ed33-4447-8202-f0d109948245', // Old ID
            '0a01cb43-a7a3-44e7-83c1-dee74018a2a0'  // New ID for gn.franca81
        ]; 

        const userEmail = user.email ? user.email.toLowerCase().trim() : '';
        
        if (!allowedAdmins.includes(userEmail) && !allowedIds.includes(user.id)) {
            console.warn(`Tentativa de acesso admin negada para: ${userEmail} (${user.id})`);
            return res.status(403).json({ error: `Acesso negado. O usuário ${userEmail} não possui permissão de administrador.` });
        }
    }

    if (req.method === 'GET') {
        if (type === 'dashboard') {
            try {
                // Fetch Users (Plan & Status for Finance)
                const { data: users, error: errUsers } = await supabase
                    .from('profiles')
                    .select('id, name, email, status, last_login, created_at, plan, subscription_status')
                    .order('created_at', { ascending: false });

                // Fetch Tickets
                const { data: tickets, error: errTickets } = await supabase
                    .from('tickets')
                    .select('*, profiles(name, email)') 
                    .order('created_at', { ascending: false })
                    .limit(10);
                
                // Fetch Revenue (Enhanced for Finance)
                // Get invoices with profile relation
                const { data: invoices, error: errInv } = await supabase
                    .from('invoices')
                    .select('*, profiles(email, plan)')
                    .order('created_at', { ascending: false })
                    .limit(20);
                
                let revenue = invoices || [];
                let totalRevenue = 0;
                let projectedRevenue = 0;
                let overdueCount = 0;
                let payingUsersCount = 0;

                // Calculate Totals & Stats
                if (users) {
                     // Determine paying users status (mock logic if columns empty)
                     payingUsersCount = users.filter(u => (u.plan && u.plan !== 'free') || (u.subscription_status === 'active')).length;
                     // Simple projection: paying users * fixed price assumption (e.g. 29.90)
                     projectedRevenue = payingUsersCount * 29.90;
                     overdueCount = users.filter(u => u.subscription_status === 'overdue').length;
                }

                if (invoices) {
                     // Total revenue from paid invoices
                     const { data: allInv } = await supabase.from('invoices').select('amount').eq('status', 'paid');
                     if (allInv) {
                        totalRevenue = allInv.reduce((sum, inv) => sum + Number(inv.amount), 0);
                     }
                }

                if (errUsers) throw errUsers;

                return res.status(200).json({
                    users: users || [],
                    tickets: tickets || [],
                    revenue: revenue, // Old field compatibility
                    invoices: invoices || [], // New field
                    totalRevenue: totalRevenue.toFixed(2),
                    projectedRevenue: projectedRevenue.toFixed(2),
                    payingUsersCount,
                    overdueCount
                });

            } catch (error) {
                console.error('Admin Dashboard Error:', error);
                // Fallback: return partial data or error
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
        const { action, id, invoice_id } = req.body;
        
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

        if (action === 'run_billing') {
            try {
                // Mock: Find users who should pay
                const { data: payUsers } = await supabase.from('profiles').select('*').neq('plan', 'free');
                let generated = 0;

                if (payUsers) {
                    for (const user of payUsers) {
                        const amount = user.plan === 'enterprise' ? 99.90 : 29.90;
                        const {error: invErr} = await supabase.from('invoices').insert({
                            user_id: user.id,
                            amount: amount,
                            status: 'pending',
                            due_date: new Date(new Date().setDate(new Date().getDate() + 5)),
                            pdf_url: `https://cloudease.com.br/invoices/nf-${Date.now()}.pdf`,
                            sent_email: true
                        });
                        if (!invErr) generated++;
                    }
                }
                return res.json({ success: true, generated });
            } catch (e) {
                return res.status(500).json({ error: e.message });
            }
        }

        if (action === 'send_invoice_email') {
            // Mock email sending
            await new Promise(r => setTimeout(r, 500)); 
            // Update invoice to say sent
            await supabase.from('invoices').update({ sent_email: true }).eq('id', invoice_id);
            return res.json({ success: true });
        }

        if (action === 'update_ticket') {
            const { status, ticket_id } = req.body;
            await supabase.from('tickets').update({ status }).eq('id', ticket_id);
            return res.status(200).json({ success: true });
        }
    }

    res.status(405).json({ error: 'Method not allowed' });
}

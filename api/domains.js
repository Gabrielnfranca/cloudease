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

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token não fornecido' });
    }
    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
        return res.status(401).json({ error: 'Sessão inválida' });
    }
    const userId = user.id;

    if (req.method === 'GET') {
        const { data: rows, error } = await supabase
            .from('domains')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });
            
        if (error) return res.status(500).json({ error: error.message });
        return res.status(200).json(rows);
    }

    if (req.method === 'POST') {
        const { domain, registrar } = req.body; // Added registrar based on frontend
        if (!domain) return res.status(400).json({ error: 'Domínio é obrigatório' });
        
        const { data, error } = await supabase
            .from('domains')
            .insert([{ 
                domain, 
                registrar: registrar || null,
                user_id: userId, 
                created_at: new Date() 
            }])
            .select()
            .single();

        if (error) return res.status(500).json({ error: error.message });
        return res.status(201).json(data);
    }
    
    res.status(405).json({ error: 'Method not allowed' });
}

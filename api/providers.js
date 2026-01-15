import { supabaseUrl, supabaseKey } from '../lib/supabase.js';
import { createClient } from '@supabase/supabase-js';
import { validateToken, fetchServers } from '../lib/providers.js';

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

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token não fornecido' });
    }
    const token = authHeader.split(' ')[1];

    // Create authenticated client for RLS
    const supabase = createClient(supabaseUrl, supabaseKey, {
        global: {
            headers: {
                Authorization: authHeader
            }
        }
    });

    // Verify user using the session
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        return res.status(401).json({ error: 'Sessão inválida' });
    }
    const userId = user.id;

    if (req.method === 'GET') {
        // Simplified query to avoid Foreign Key issues causing 500 errors
        const { data: providers, error } = await supabase
            .from('providers')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Provider fetch error:', error);
            return res.status(500).json({ error: 'Erro ao buscar conexões: ' + error.message });
        }
        
        const formatted = providers.map(p => ({
            id: p.id,
            provider: p.provider_name,
            name: p.label,
            total_servers: 0, // Temporariamente 0 para evitar erro de join
            created_at: p.created_at,
            status: 'Ativo'
        }));
        return res.status(200).json(formatted);
    }

    if (req.method === 'POST') {
        const { provider, name, token } = req.body;
        
        try {
            const isValid = await validateToken(provider, token);
            if (!isValid) return res.status(401).json({ error: 'Token inválido' });

            const { data: newProvider, error } = await supabase
                .from('providers')
                .insert([{ user_id: userId, provider_name: provider, label: name, api_key: token }])
                .select()
                .single();

            if (error) throw error;

            // Simple async init sync
            try {
                const servers = await fetchServers(provider, token);
                for (const s of servers) {
                    await supabase.from('servers_cache').insert([{
                        user_id: userId,
                        provider_id: newProvider.id,
                        external_id: s.external_id,
                        name: s.name,
                        status: s.status,
                        specs: s.specs
                    }]);
                }
            } catch (e) { console.error('Initial sync error', e); }

            return res.status(200).json({ success: true, message: 'Conectado!' });
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    }

    if (req.method === 'DELETE') {
        const { id } = req.query;
        // RLS protects us, so simple delete checks owner automatically
        const { error } = await supabase.from('providers').delete().eq('id', id);
        if (error) return res.status(500).json({ error: 'Erro ao deletar' });
        return res.status(200).json({ success: true });
    }
}
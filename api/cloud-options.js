import { supabaseUrl, supabaseKey } from '../lib/supabase.js';
import { createClient } from '@supabase/supabase-js';
import { fetchPlans, fetchRegions, fetchOS } from '../lib/providers.js';

export default async function handler(req, res) {
    // Autenticação JWT
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token de autenticação não fornecido' });
    }

    const tokenAuth = authHeader.split(' ')[1];
    
    // Create authenticated client
    const supabase = createClient(supabaseUrl, supabaseKey, {
        global: {
            headers: {
                Authorization: authHeader
            }
        }
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        return res.status(401).json({ error: 'Token inválido ou expirado' });
    }
    
    const userId = user.id;

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    const { provider } = req.body;
    if (!provider) {
        return res.status(400).json({ error: 'Provider is required' });
    }
    try {
        // Busca token do provedor para o usuário autenticado via Supabase RLS
        const { data: providerData, error: providerError } = await supabase
            .from('providers')
            .select('api_key')
            .eq('provider_name', provider)
            .eq('user_id', userId)
            .single();

        if (providerError || !providerData) {
            return res.status(400).json({ error: 'Provedor não conectado.' });
        }
        
        const token = providerData.api_key;

        // Busca planos, regiões e OS
        const [plans, regions, os] = await Promise.all([
            fetchPlans(provider, token),
            fetchRegions(provider, token),
            fetchOS(provider, token)
        ]);
        res.status(200).json({ plans, regions, os });
    } catch (error) {
        console.error('Erro ao buscar opções:', error);
        res.status(500).json({ error: 'Erro ao buscar opções do provedor: ' + error.message });
    }
}

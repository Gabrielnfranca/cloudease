import { supabase } from '../lib/supabase.js';

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

    // 1. Validar Token do Supabase
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token não fornecido' });
    }
    const token = authHeader.split(' ')[1];

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
        return res.status(401).json({ error: 'Sessão inválida ou expirada' });
    }

    const userId = user.id; // UUID

    if (req.method === 'GET') {
        try {
            // Nota: RLS já protege, mas eq('id', userId) é boa prática
            // Busca dados da tabela profiles
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single();

            if (error && error.code !== 'PGRST116') throw error; // PGRST116 é 'nenhuma linha retornada'
            
            // Se não tiver perfil ainda (race condition do trigger), retorna dados básicos do Auth
            if (!data) {
                return res.status(200).json({
                    id: user.id,
                    name: user.user_metadata?.name || '',
                    email: user.email,
                    created_at: user.created_at
                });
            }

            return res.status(200).json(data);
        } catch (error) {
            console.error('Erro ao buscar usuário:', error);
            return res.status(500).json({ error: 'Erro interno' });
        }
    } else if (req.method === 'PUT') {
        // Atualização de perfil
        const { name, email, newPassword } = req.body;
        
        try {
            // Atualizar email/senha no Auth (se fornecidos)
            const updates = {};
            if (email) updates.email = email;
            if (newPassword) updates.password = newPassword;

            if (Object.keys(updates).length > 0) {
                const { error: authUpdateError } = await supabase.auth.updateUser(updates);
                if (authUpdateError) return res.status(400).json({ error: 'Erro ao atualizar dados de autenticação: ' + authUpdateError.message });
            }

            // Atualizar tabela profiles
            if (name || email) { // Email também fica duplicado na tabela profiles para facilidade
                const profileUpdates = {};
                if (name) profileUpdates.name = name;
                if (email) profileUpdates.email = email;

                const { error: profileError } = await supabase
                    .from('profiles')
                    .update(profileUpdates)
                    .eq('id', userId);
                
                if (profileError) return res.status(500).json({ error: 'Erro ao atualizar perfil' });
            }

            return res.status(200).json({ message: 'Perfil atualizado com sucesso' });

        } catch (error) {
            console.error('Erro update:', error);
            return res.status(500).json({ error: 'Erro interno' });
        }
    } else {
        res.status(405).json({ error: 'Method not allowed' });
    }
}

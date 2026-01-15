import { supabase } from '../lib/supabase.js';

export default async function handler(req, res) {
    // Permite CORS para evitar problemas no frontend
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { action } = req.query;

    if (action === 'login') {
        // DIAGNÓSTICO DE CONFIGURAÇÃO VERCEL
        if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
            console.error('ERRO CRÍTICO: Variáveis de ambiente SUPABASE ausentes.');
            return res.status(500).json({ 
                error: 'ERRO DE CONFIGURAÇÃO: As chaves do Supabase não foram configuradas no painel da Vercel.' 
            });
        }

        const { email, password } = req.body;
        console.log('Tentativa de login para:', email);

        if (!email || !password) {
            return res.status(400).json({ error: 'Email e senha são obrigatórios' });
        }

        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password
            });

            if (error) {
                return res.status(401).json({ error: error.message || 'Credenciais inválidas' });
            }

            // Busca dados extras do perfil (nome)
            const { data: profile } = await supabase
                .from('profiles')
                .select('name')
                .eq('id', data.user.id)
                .single();

            return res.status(200).json({
                success: true,
                token: data.session.access_token, // Token oficial do Supabase
                user: {
                    id: data.user.id,
                    name: profile?.name || data.user.user_metadata?.name || email.split('@')[0],
                    email: data.user.email
                }
            });

        } catch (error) {
            console.error('Erro no login:', error);
            return res.status(500).json({ error: 'Erro interno do servidor' });
        }

    } else if (action === 'register') {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres' });
        }

        try {
            // O trigger handle_new_user no banco vai criar o perfil automaticamente
            const { data, error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: { name: name } // Isso vai para user_metadata
                }
            });

            if (error) {
                return res.status(400).json({ error: error.message });
            }

            // Login automático após registro, se a sessão vier preenchida (confirmação email desligada)
            if (data.session) {
                return res.status(201).json({
                    success: true,
                    token: data.session.access_token,
                    user: {
                        id: data.user.id,
                        name: name,
                        email: email
                    }
                });
            } else {
                // Caso exija confirmação de email
                return res.status(201).json({
                    success: true,
                    message: "Cadastro realizado! Verifique seu email.",
                    user: null 
                });
            }

        } catch (error) {
            console.error('Erro no registro:', error);
            return res.status(500).json({ error: 'Erro ao criar usuário' });
        }
    } else {
        res.status(400).json({ error: 'Ação inválida' });
    }
}
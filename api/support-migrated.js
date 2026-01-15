import { supabase } from '../lib/supabase.js';

export default async function handler(req, res) {
    // 1. Em um cenário real com Supabase Auth no Frontend, 
    // o usuário já viria autenticado pelo token JWT.
    // user = req.user ou supabase.auth.getUser()

    // Para este exemplo funcionar com sua lógica atual, vamos supor que
    // você ainda passe o ID manualmente ou via seu JWT antigo.
    // NOTA: No Supabase, idealmente usamos UUID para usuários, não inteiros (1).
    const userId = 1; // Mantendo compatibilidade com seu teste atual

    if (req.method === 'GET') {
        try {
            // ANTES:
            // const { rows } = await db.query('SELECT * FROM tickets WHERE user_id = $1...', [userId]);

            // DEPOIS (COM SUPABASE):
            const { data: tickets, error } = await supabase
                .from('tickets')
                .select('*')
                .eq('user_id', userId) // Filtro equivalente ao WHERE
                .order('created_at', { ascending: false });

            if (error) throw error;

            res.status(200).json(tickets);
        } catch (error) {
            console.error('Erro Supabase:', error);
            res.status(500).json({ error: 'Erro ao carregar chamados' });
        }
    } 
    
    else if (req.method === 'POST') {
        const { subject, description, urgency } = req.body;

        if (!subject || !description || !urgency) {
            return res.status(400).json({ error: 'Preencha todos os campos' });
        }

        try {
            // ANTES:
            // await db.query('INSERT INTO ... VALUES ... RETURNING *');

            // DEPOIS (COM SUPABASE):
            const { data, error } = await supabase
                .from('tickets')
                .insert([
                    { 
                        user_id: userId,
                        subject, 
                        description, 
                        urgency, 
                        status: 'Aberto' 
                        // created_at é preenchido automaticamente pelo banco
                    }
                ])
                .select(); // .select() é necessário para retornar o objeto criado (como o RETURNING *)

            if (error) throw error;

            res.status(201).json(data[0]);
        } catch (error) {
            console.error('Erro Supabase:', error);
            res.status(500).json({ error: 'Erro ao abrir chamado' });
        }
    } else {
        res.status(405).json({ error: 'Method not allowed' });
    }
}

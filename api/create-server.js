import db from '../lib/db';
import { createInstance } from '../lib/providers';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { provider, region, plan, app, name } = req.body;

    if (!provider || !region || !plan || !name) {
        return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
    }

    try {
        // 1. Buscar token do provedor no banco de dados
        // Assumindo usuário admin (ID 1) por enquanto
        const { rows } = await db.query(
            'SELECT api_key, id FROM providers WHERE provider_name = $1 AND user_id = 1 LIMIT 1',
            [provider]
        );

        if (rows.length === 0) {
            return res.status(400).json({ error: 'Provedor não conectado. Vá em Conexões e conecte sua conta primeiro.' });
        }

        const { api_key: token, id: providerId } = rows[0];

        // 2. Chamar API do provedor para criar a máquina
        const result = await createInstance(provider, token, {
            region,
            plan,
            app,
            name
        });

        // 3. Salvar referência no banco de dados local (Cache)
        // Nota: O IP ainda não estará disponível imediatamente, será atualizado no próximo sync
        await db.query(`
            INSERT INTO servers_cache (provider_id, external_id, name, status, specs)
            VALUES ($1, $2, $3, 'creating', $4)
        `, [
            providerId, 
            result.id || result.droplet?.id || 'pending', // Vultr retorna id, DO retorna droplet.id
            name,
            { app: app, plan: plan, region: region }
        ]);

        return res.status(201).json({ 
            success: true, 
            message: 'Servidor sendo criado! O processo de instalação pode levar alguns minutos.',
            details: result
        });

    } catch (error) {
        console.error('Erro ao criar servidor:', error);
        return res.status(500).json({ error: error.message || 'Erro interno ao criar servidor' });
    }
}

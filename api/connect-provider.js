import db from '../lib/db';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { provider, name, token } = req.body;

    if (!provider || !name || !token) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        // 1. Validar o token com a API do provedor (Simulação por enquanto)
        // Em produção, faríamos um fetch para https://api.digitalocean.com/v2/account com o token
        const isValid = await validateProviderToken(provider, token);
        
        if (!isValid) {
            return res.status(401).json({ error: 'Token inválido ou erro de conexão com o provedor.' });
        }

        // 2. Salvar no banco de dados
        // Nota: user_id está hardcoded como 1 por enquanto, pois não temos sistema de login real ainda
        const query = `
            INSERT INTO providers (user_id, provider_name, label, api_key)
            VALUES ($1, $2, $3, $4)
            RETURNING id;
        `;
        
        // Comentado para não quebrar se o DB não estiver configurado ainda
        // const result = await db.query(query, [1, provider, name, token]);
        
        // Simulação de sucesso
        console.log(`Provedor ${provider} conectado com sucesso: ${name}`);

        return res.status(200).json({ success: true, message: 'Provedor conectado com sucesso!' });

    } catch (error) {
        console.error('Erro ao conectar provedor:', error);
        return res.status(500).json({ error: 'Erro interno do servidor' });
    }
}

async function validateProviderToken(provider, token) {
    // Simulação de validação
    // Se o token for "error", simula falha
    if (token === 'error') return false;
    return true;
}
import { getProviderToken } from '../lib/db-utils.js';
import { fetchPlans, fetchRegions, fetchOS } from '../lib/providers.js';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'sua_chave_secreta_super_segura';

export default async function handler(req, res) {
    // Autenticação JWT
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token de autenticação não fornecido' });
    }

    const tokenAuth = authHeader.split(' ')[1];
    let userId;

    try {
        const decoded = jwt.verify(tokenAuth, JWT_SECRET);
        userId = decoded.userId;
    } catch (error) {
        return res.status(401).json({ error: 'Token inválido ou expirado' });
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    const { provider } = req.body;
    if (!provider) {
        return res.status(400).json({ error: 'Provider is required' });
    }
    try {
        // Busca token do provedor para o usuário autenticado
        const token = await getProviderToken(provider, userId);
        if (!token) {
            return res.status(400).json({ error: 'Provedor não conectado.' });
        }
        // Busca planos, regiões e OS
        const [plans, regions, os] = await Promise.all([
            fetchPlans(provider, token),
            fetchRegions(provider, token),
            fetchOS(provider, token)
        ]);
        res.status(200).json({ plans, regions, os });
    } catch (error) {
        console.error('Erro ao buscar opções:', error);
        res.status(500).json({ error: 'Erro ao buscar opções do provedor' });
    }
}

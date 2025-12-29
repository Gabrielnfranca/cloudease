import { getProviderToken } from '../lib/db-utils.js';
import { fetchPlans, fetchRegions, fetchOS } from '../lib/providers.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    const { provider } = req.body;
    if (!provider) {
        return res.status(400).json({ error: 'Provider is required' });
    }
    try {
        // Busca token do provedor para o usuário admin (ID 1)
        const token = await getProviderToken(provider, 1);
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

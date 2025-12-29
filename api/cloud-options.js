import { getProviderToken } from '../lib/db-utils.js';
import { fetchPlans, fetchRegions } from '../lib/providers.js';

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
        // Busca planos e regiões
        const [plans, regions] = await Promise.all([
            fetchPlans(provider, token),
            fetchRegions(provider, token)
        ]);
        res.status(200).json({ plans, regions });
    } catch (error) {
        console.error('Erro ao buscar planos/regiões:', error);
        res.status(500).json({ error: 'Erro ao buscar planos/regiões' });
    }
}

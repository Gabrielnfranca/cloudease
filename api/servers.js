import db from '../lib/db';

export default async function handler(req, res) {
    try {
        // Busca servidores do banco de dados (tabela de cache)
        const { rows } = await db.query('SELECT * FROM servers_cache');

        // Se não tiver nada no banco, retornamos um array vazio
        if (rows.length === 0) {
            return res.status(200).json([]);
        }

        // Mapeia os dados do banco para o formato que o frontend espera
        const servers = rows.map(row => ({
            provider: 'Vultr', // Idealmente viria do join com providers
            name: row.name,
            logo: 'https://www.vultr.com/favicon.ico',
            cpu: row.specs?.cpu || 'N/A',
            ram: row.specs?.ram || 'N/A',
            storage: row.specs?.storage || 'N/A',
            transfer: 'N/A',
            os: 'Linux',
            region: 'Unknown',
            plan: 'Standard',
            ipv4: row.ip_address,
            ipv6: '',
            services: {}
        }));

        res.status(200).json(servers);
    } catch (error) {
        console.error('Erro ao buscar servidores:', error);
        res.status(500).json({ error: 'Erro interno ao buscar servidores' });
    }
}

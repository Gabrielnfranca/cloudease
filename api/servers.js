import db from '../lib/db';

export default async function handler(req, res) {
    try {
        // Busca servidores do banco de dados com JOIN em providers
        const query = `
            SELECT 
                sc.*,
                p.provider_name,
                p.label as provider_label
            FROM servers_cache sc
            LEFT JOIN providers p ON sc.provider_id = p.id
            ORDER BY sc.created_at DESC
        `;
        
        const { rows } = await db.query(query);

        // Se não tiver nada no banco, retornamos um array vazio
        if (rows.length === 0) {
            return res.status(200).json([]);
        }

        // Mapeia os dados do banco para o formato que o frontend espera
        const servers = rows.map(row => {
            const specs = row.specs || {};
            return {
                id: row.id,
                provider: formatProviderName(row.provider_name),
                name: row.name,
                logo: getProviderLogo(row.provider_name),
                cpu: specs.cpu || 'N/A',
                ram: specs.ram || 'N/A',
                storage: specs.storage || 'N/A',
                os: specs.os || 'Linux',
                region: specs.region || 'Unknown', // Agora pegamos do specs
                plan: specs.plan || 'Standard',
                ipv4: row.ip_address,
                status: row.status,
                created_at: row.created_at
            };
        });

        res.status(200).json(servers);
    } catch (error) {
        console.error('Erro ao buscar servidores:', error);
        res.status(500).json({ error: 'Erro interno ao buscar servidores' });
    }
}

function formatProviderName(name) {
    if (!name) return 'Desconhecido';
    return name.charAt(0).toUpperCase() + name.slice(1);
}

function getProviderLogo(name) {
    if (name === 'vultr') return 'https://www.vultr.com/favicon.ico';
    if (name === 'digitalocean') return 'https://www.digitalocean.com/favicon.ico';
    if (name === 'linode') return 'https://www.linode.com/favicon.ico';
    return 'assets/images/server-icon.png';
}

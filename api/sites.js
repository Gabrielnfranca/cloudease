import db from '../lib/db';

export default async function handler(req, res) {
    try {
        // Busca sites com informações do servidor (JOIN)
        const query = `
            SELECT 
                s.id, 
                s.domain, 
                s.platform, 
                s.php_version, 
                s.status, 
                s.created_at,
                sc.name as server_name,
                sc.ip_address
            FROM sites s
            LEFT JOIN servers_cache sc ON s.server_id = sc.id
            ORDER BY s.created_at DESC
        `;
        
        const { rows } = await db.query(query);

        // Se não tiver nada, retorna array vazio
        if (rows.length === 0) {
            return res.status(200).json([]);
        }

        // Formata os dados para o frontend
        const sites = rows.map(site => ({
            id: site.id,
            domain: site.domain,
            platform: site.platform || 'php',
            platformLabel: formatPlatform(site.platform),
            platformIcon: getPlatformIcon(site.platform),
            ssl: true, // Por padrão assumimos que vamos gerar SSL (CloudEase padrão)
            server: site.server_name || 'Desconhecido',
            ip: site.ip_address || 'Pendente',
            created_at: new Date(site.created_at).toLocaleDateString('pt-BR'),
            status: site.status
        }));

        res.status(200).json(sites);
    } catch (error) {
        console.error('Erro ao buscar sites:', error);
        res.status(500).json({ error: 'Erro interno ao buscar sites' });
    }
}

function formatPlatform(platform) {
    if (platform === 'wordpress') return 'WordPress';
    if (platform === 'html') return 'HTML Estático';
    return 'PHP ' + (platform === 'php' ? '' : platform);
}

function getPlatformIcon(platform) {
    if (platform === 'wordpress') return 'https://s.w.org/style/images/about/WordPress-logotype-wmark.png';
    if (platform === 'html') return 'assets/images/html5-logo.png'; // Placeholder
    return 'assets/images/php-logo.png'; // Placeholder
}

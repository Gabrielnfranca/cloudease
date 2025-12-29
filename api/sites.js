import db from '../lib/db';

export default async function handler(req, res) {
    if (req.method === 'GET') {
        // Listar sites
        try {
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
            if (rows.length === 0) {
                return res.status(200).json([]);
            }
            const sites = rows.map(site => ({
                id: site.id,
                domain: site.domain,
                platform: site.platform || 'php',
                platformLabel: formatPlatform(site.platform),
                platformIcon: getPlatformIcon(site.platform),
                ssl: true,
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
    } else if (req.method === 'POST') {
        // Criar site
        const { serverId, domain, platform, phpVersion, cache } = req.body;
        if (!serverId || !domain) {
            return res.status(400).json({ error: 'Servidor e Domínio são obrigatórios' });
        }
        try {
            // Verificar se o domínio já existe
            const check = await db.query('SELECT id FROM sites WHERE domain = $1', [domain]);
            if (check.rows.length > 0) {
                return res.status(400).json({ error: 'Este domínio já está cadastrado.' });
            }
            // Salvar no banco de dados
            const result = await db.query(`
                INSERT INTO sites (server_id, domain, platform, php_version, cache_type, status)
                VALUES ($1, $2, $3, $4, $5, 'provisioning')
                RETURNING id
            `, [1, domain, platform, phpVersion, cache]);
            setTimeout(async () => {
                await db.query('UPDATE sites SET status = $1 WHERE id = $2', ['active', result.rows[0].id]);
            }, 5000);
            return res.status(201).json({ 
                success: true, 
                message: 'Site registrado com sucesso! A configuração do servidor foi iniciada.',
                siteId: result.rows[0].id
            });
        } catch (error) {
            console.error('Erro ao criar site:', error);
            return res.status(500).json({ error: 'Erro interno ao criar site' });
        }
    } else {
        res.status(405).json({ error: 'Method not allowed' });
    }
}

function formatPlatform(platform) {
    if (platform === 'wordpress') return 'WordPress';
    if (platform === 'html') return 'HTML Estático';
    return 'PHP ' + (platform === 'php' ? '' : platform);
}

function getPlatformIcon(platform) {
    if (platform === 'wordpress') return 'https://s.w.org/style/images/about/WordPress-logotype-wmark.png';
    if (platform === 'html') return 'assets/images/html5-logo.png';
    return 'assets/images/php-logo.png';
}

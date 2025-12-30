import db from '../lib/db.js';
import { provisionWordPress } from '../lib/provisioner.js';

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
                ssl: site.status === 'active' ? true : false,
                server: site.server_name || 'Desconhecido',
                ip: site.ip_address || 'Pendente',
                tempUrl: site.ip_address ? `http://${site.domain}.${site.ip_address}.nip.io` : null,
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
        const { serverId, domain, platform, phpVersion, cache, wpTitle, wpAdminUser, wpAdminPass, wpAdminEmail, wpLang } = req.body;
        
        if (!serverId || !domain) {
            return res.status(400).json({ error: 'Servidor e Domínio são obrigatórios' });
        }

        // Validação básica para WP
        if (platform === 'wordpress') {
            if (!wpTitle || !wpAdminUser || !wpAdminPass || !wpAdminEmail) {
                return res.status(400).json({ error: 'Todos os campos de configuração do WordPress são obrigatórios.' });
            }
        }

        try {
            // Verificar se o domínio já existe
            const check = await db.query('SELECT id FROM sites WHERE domain = $1', [domain]);
            if (check.rows.length > 0) {
                return res.status(400).json({ error: 'Este domínio já está cadastrado.' });
            }

            // Buscar IP do servidor
            const serverQuery = await db.query('SELECT ip_address FROM servers_cache WHERE id = $1', [serverId]);
            if (serverQuery.rows.length === 0) {
                return res.status(404).json({ error: 'Servidor não encontrado.' });
            }
            const serverIp = serverQuery.rows[0].ip_address;

            // Salvar no banco de dados como 'provisioning'
            const result = await db.query(`
                INSERT INTO sites (server_id, domain, platform, php_version, cache_type, status)
                VALUES ($1, $2, $3, $4, $5, 'provisioning')
                RETURNING id
            `, [serverId, domain, platform, phpVersion, cache]);

            const siteId = result.rows[0].id;

            // Iniciar provisionamento em background
            const wpConfig = platform === 'wordpress' ? {
                title: wpTitle,
                adminUser: wpAdminUser,
                adminPass: wpAdminPass,
                adminEmail: wpAdminEmail,
                lang: wpLang || 'pt_BR'
            } : null;

            provisionWordPress(serverIp, domain, wpConfig)
                .then(async (creds) => {
                    console.log(`Site ${domain} provisionado com sucesso!`);
                    await db.query('UPDATE sites SET status = $1 WHERE id = $2', ['active', siteId]);
                })
                .catch(async (err) => {
                    console.error(`Erro ao provisionar ${domain}:`, err);
                    await db.query('UPDATE sites SET status = $1 WHERE id = $2', ['error', siteId]);
                });

            return res.status(201).json({ 
                success: true, 
                message: 'Instalação iniciada! O site estará disponível em alguns instantes.',
                siteId: siteId
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

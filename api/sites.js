import db from '../lib/db.js';
import { provisionWordPress, deleteSiteFromInstance } from '../lib/provisioner.js';

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
                    s.enable_temp_url,
                    s.last_error,
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
                tempUrl: (site.ip_address && site.enable_temp_url) ? `http://${site.domain}.${site.ip_address}.nip.io` : null,
                created_at: new Date(site.created_at).toLocaleDateString('pt-BR'),
                created_at_iso: site.created_at, // Timestamp completo para cálculos
                status: site.status,
                last_error: site.last_error
            }));
            res.status(200).json(sites);
        } catch (error) {
            console.error('Erro ao buscar sites:', error);
            res.status(500).json({ error: 'Erro interno ao buscar sites' });
        }
    } else if (req.method === 'POST') {
        // Criar site
        const { serverId, domain, enableTempUrl, platform, phpVersion, cache, wpTitle, wpAdminUser, wpAdminPass, wpAdminEmail, wpLang } = req.body;
        
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
                INSERT INTO sites (server_id, domain, platform, php_version, cache_type, status, enable_temp_url)
                VALUES ($1, $2, $3, $4, $5, 'provisioning', $6)
                RETURNING id
            `, [serverId, domain, platform, phpVersion, cache, enableTempUrl]);

            const siteId = result.rows[0].id;

            // Iniciar provisionamento em background
            const wpConfig = platform === 'wordpress' ? {
                title: wpTitle,
                adminUser: wpAdminUser,
                adminPass: wpAdminPass,
                adminEmail: wpAdminEmail,
                lang: wpLang || 'pt_BR',
                cache: cache,
                enableTempUrl: enableTempUrl
            } : { 
                cache: cache,
                enableTempUrl: enableTempUrl
            };

            provisionWordPress(serverIp, domain, wpConfig)
                .then(async (creds) => {
                    console.log(`Site ${domain} provisionado com sucesso!`);
                    await db.query('UPDATE sites SET status = $1 WHERE id = $2', ['active', siteId]);
                })
                .catch(async (err) => {
                    const errorMsg = err.message || 'Erro desconhecido';
                    await db.query('UPDATE sites SET status = $1, last_error = $2 WHERE id = $3', ['error', errorMsg
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
    } else if (req.method === 'PUT') {
        // Re-tentar provisionamento
        const { siteId } = req.body;
        
        try {
            // Buscar dados do site
            const siteQuery = await db.query(`
                SELECT s.*, sc.ip_address 
                FROM sites s
                JOIN servers_cache sc ON s.server_id = sc.id
                WHERE s.id = $1
            `, [siteId]);

            if (siteQuery.rows.length === 0) {
                return res.status(404).json({ error: 'Site não encontrado' });
            }

            const site = siteQuery.rows[0];
            
            // Atualizar status para provisioning
            await db.query('UPDATE sites SET status = $1 WHERE id = $2', ['provisioning', siteId]);

            // Configuração WP (Recuperar do banco se possível, ou usar defaults/null por enquanto)
            // Nota: Idealmente deveríamos ter salvo a config do WP no banco. 
            // Por simplificação, vamos assumir que se falhou, tentamos o básico ou o usuário recria.
            // Mas para retry funcionar bem, vamos tentar provisionar novamente.
            
            const wpConfig = site.platform === 'wordpress' ? {
                title: 'My WordPress Site', // Defaults genéricos pois não salvamos os dados sensíveis
                adminUser: 'admin',
                adminPass: 'admin123', // Isso é ruim. O ideal seria salvar os params de install temporariamente.
                adminEmail: 'admin@example.com',
                lang: 'pt_BR',
                enableTempUrl: site.enable_temp_url
            } : { enableTempUrl: site.enable_temp_url };

            // Iniciar provisionamento
            provisionWordPress(site.ip_address, site.domain, wpConfig)
                .then(async () => {
                    await db.query('UPDATE sites SET status = $1 WHERE id = $2', ['active', siteId]);
                })
                .catch(async (err) => {
                    const errorMsg = err.message || 'Erro desconhecido';
                    await db.query('UPDATE sites SET status = $1, last_error = $2 WHERE id = $3', ['error', errorMsg
                    await db.query('UPDATE sites SET status = $1 WHERE id = $2', ['error', siteId]);
                });

            return res.status(200).json({ message: 'Re-provisionamento iniciado.' });

        } catch (error) {
            console.error('Erro ao re-tentar site:', error);
            return res.status(500).json({ error: 'Erro interno' });
        }
    } else if (req.method === 'DELETE') {
        // Excluir Site
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: 'ID do site obrigatório' });

        try {
            // Buscar dados do site e servidor
            const { rows } = await db.query(`
                SELECT s.id, s.domain, sc.ip_address 
                FROM sites s
                JOIN servers_cache sc ON s.server_id = sc.id
                WHERE s.id = $1
            `, [id]);

            if (rows.length === 0) {
                return res.status(404).json({ error: 'Site não encontrado' });
            }

            const site = rows[0];

            // Tentar remover do servidor (SSH)
            // Não falhamos se o servidor não responder, pois queremos permitir limpar o banco
            try {
                if (site.ip_address) {
                    await deleteSiteFromInstance(site.ip_address, site.domain);
                }
            } catch (sshError) {
                console.error('Erro ao limpar servidor (ignorando):', sshError);
            }

            // Remover do banco
            await db.query('DELETE FROM sites WHERE id = $1', [id]);

            return res.status(200).json({ success: true, message: 'Site excluído com sucesso' });

        } catch (error) {
            console.error('Erro ao excluir site:', error);
            return res.status(500).json({ error: 'Erro interno ao excluir site' });
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

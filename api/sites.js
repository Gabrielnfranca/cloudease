import db from '../lib/db.js';
import { provisionWordPress, deleteSiteFromInstance, checkProvisionStatus, updateNginxConfig, updateSitePassword } from '../lib/provisioner.js';

function formatPlatform(platform) {
    if (platform === 'wordpress') return 'WordPress';
    if (platform === 'html') return 'HTML Estático';
    if (!platform) return 'PHP Puro';
    return platform.charAt(0).toUpperCase() + platform.slice(1);
}

function getPlatformIcon(platform) {
    if (platform === 'wordpress') return 'fab fa-wordpress';
    if (platform === 'laravel') return 'fab fa-laravel';
    return 'fab fa-php';
}

export default async function handler(req, res) {
    if (req.method === 'GET') {
        const { id, detailed } = req.query;

        if (id && detailed) {
            // Buscar Detalhes de um único site
            try {
                const query = `
                    SELECT 
                        s.*,
                        sc.name as server_name,
                        sc.ip_address,
                        p.provider_name,
                        a.db_name, a.db_user, a.db_pass
                    FROM sites s
                    LEFT JOIN servers_cache sc ON s.server_id = sc.id
                    LEFT JOIN providers p ON sc.provider_id = p.id
                    LEFT JOIN applications a ON s.id = a.site_id
                    WHERE s.id = $1
                `;
                const { rows } = await db.query(query, [id]);
                
                if (rows.length === 0) {
                    return res.status(404).json({ error: 'Site não encontrado' });
                }

                const site = rows[0];
                const detailedSite = {
                    id: site.id,
                    domain: site.domain,
                    platform: site.platform,
                    platformLabel: formatPlatform(site.platform),
                    status: site.status,
                    server_id: site.server_id,
                    server_name: site.server_name,
                    ip: site.ip_address,
                    provider_name: site.provider_name,
                    php_version: site.php_version,
                    enable_temp_url: site.enable_temp_url,
                    system_user: site.system_user,
                    system_password: site.system_password,
                    application: {
                        db_name: site.db_name,
                        db_user: site.db_user,
                        db_pass: site.db_pass,
                        db_host: site.db_host || 'localhost'
                    }
                };

                return res.status(200).json(detailedSite);

            } catch (error) {
                console.error('Erro ao buscar detalhes do site:', error);
                return res.status(500).json({ error: 'Erro interno ao buscar detalhes: ' + error.message });
            }
        }

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

            // Verificar status de sites em provisionamento (DESATIVADO PARA EVITAR TIMEOUT)
            // O processo de verificação deve ser feito via Cron ou botão manual "Atualizar Status"
            /*
            const provisioningSites = rows.filter(s => s.status === 'provisioning' && s.ip_address);
            
            if (provisioningSites.length > 0) {
                 // ... Código SSH original omitido para performance ...
            }
            */


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
            res.status(500).json({ error: 'Erro interno ao buscar sites: ' + error.message });
        }
    } else if (req.method === 'PATCH') {
        const { id, action, password, type } = req.body;
        
        if (action === 'update_password') {
            try {
                // Obter dados do site e do servidor
                const { rows } = await db.query(`
                    SELECT s.*, sc.ip_address 
                    FROM sites s
                    JOIN servers_cache sc ON s.server_id = sc.id
                    WHERE s.id = $1
                `, [id]);

                if (rows.length === 0) return res.status(404).json({ error: 'Site não encontrado' });
                
                const site = rows[0];

                if (type === 'sftp') {
                    // Atualizar senha do sistema via SSH
                    await updateSitePassword(site.ip_address, site.system_user, password);
                    
                    // Atualizar no banco
                    await db.query('UPDATE sites SET system_password = $1 WHERE id = $2', [password, id]);
                } else if (type === 'db') {
                    // TODO: Implementar rotação de senha de banco
                    throw new Error("Alteração de senha de banco de dados ainda não implementada.");
                }

                return res.status(200).json({ message: 'Senha atualizada com sucesso' });

            } catch (error) {
                 console.error('Erro ao alterar senha:', error);
                 return res.status(500).json({ error: 'Erro ao atualizar senha: ' + error.message });
            }
        }
    } else if (req.method === 'POST') {
        // Criar site
        let { serverId, domain, enableTempUrl, platform, phpVersion, cache, wpTitle, wpAdminUser, wpAdminPass, wpAdminEmail, wpLang } = req.body;
        
        if (!serverId || !domain) {
            return res.status(400).json({ error: 'Servidor e Domínio são obrigatórios' });
        }

        domain = domain.toLowerCase();

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
                    console.log(`Site ${domain}: Provisionamento iniciado.`);
                    
                    // Criar registro de Job
                    await db.query(`
                        INSERT INTO jobs (server_id, site_id, type, status, log_output)
                        VALUES ($1, $2, 'install_wordpress', 'running', 'Provisionamento iniciado via SSH')
                    `, [serverId, siteId]);

                    // Salvar Application Data e Dados de Sistema
                    if (platform === 'wordpress' && creds && creds.dbName) {
                         await db.query(`
                            INSERT INTO applications (site_id, type, db_name, db_user, db_pass, admin_email, admin_user, installation_status)
                            VALUES ($1, 'wordpress', $2, $3, $4, $5, $6, 'pending_verification')
                        `, [siteId, creds.dbName, creds.dbUser, creds.dbPass, wpAdminEmail, wpAdminUser]);
                    }

                    // Atualizar Site com System User/Pass (SFTP)
                    if (creds && creds.sysUser) {
                        await db.query(`
                            UPDATE sites SET system_user = $1, system_password = $2 WHERE id = $3
                        `, [creds.sysUser, creds.sysPass, siteId]);
                    }
                })
                .catch(async (err) => {
                    console.error(`Erro ao provisionar ${domain}:`, err);
                    const errorMsg = err.message || 'Erro desconhecido';
                    await db.query('UPDATE sites SET status = $1, last_error = $2 WHERE id = $3', ['error', errorMsg, siteId]);
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
        // Re-tentar provisionamento ou atualizar config
        const { siteId, action } = req.body;
        
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

            if (action === 'update_nginx') {
                // Apenas atualizar Nginx (para ativar link provisório)
                try {
                    await updateNginxConfig(site.ip_address, site.domain, site.enable_temp_url);
                    return res.status(200).json({ message: 'Configuração do Nginx atualizada com sucesso.' });
                } catch (err) {
                    console.error('Erro ao atualizar Nginx:', err);
                    return res.status(500).json({ error: 'Erro ao atualizar Nginx: ' + err.message });
                }
            }
            
            if (action === 'update_password') {
                const { type, password } = req.body;
                if (!password || password.length < 8) {
                    return res.status(400).json({ error: 'Senha inválida' });
                }

                // Determinar usuário
                let userToUpdate = '';
                if (type === 'sftp') {
                    userToUpdate = site.system_user;
                } else if (type === 'db') {
                    // Need to fetch db_user from applications table
                    const appQuery = await db.query('SELECT db_user FROM applications WHERE site_id = $1', [siteId]);
                    if (appQuery.rows.length > 0) {
                        userToUpdate = appQuery.rows[0].db_user;
                    }
                }

                if (!userToUpdate) {
                    return res.status(400).json({ error: 'Usuário não encontrado para este site.' });
                }

                try {
                    await updateSitePassword(site.ip_address, type, userToUpdate, password);
                    
                    // Update DB record
                    if (type === 'sftp') {
                        await db.query('UPDATE sites SET system_password = $1 WHERE id = $2', [password, siteId]);
                    } else if (type === 'db') {
                        await db.query('UPDATE applications SET db_pass = $1 WHERE site_id = $2', [password, siteId]);
                    }

                    return res.status(200).json({ message: 'Senha atualizada com sucesso.' });
                } catch (err) {
                    console.error('Erro ao atualizar senha:', err);
                    return res.status(500).json({ error: 'Erro ao atualizar senha no servidor: ' + err.message });
                }
            }
            
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
                    console.log(`Site ${site.domain}: Re-instalação iniciada em background.`);
                    // Não atualizar para active aqui.
                })
                .catch(async (err) => {
                    console.error(`Erro ao re-provisionar ${site.domain}:`, err);
                    const errorMsg = err.message || 'Erro desconhecido';
                    await db.query('UPDATE sites SET status = $1, last_error = $2 WHERE id = $3', ['error', errorMsg, siteId]);
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


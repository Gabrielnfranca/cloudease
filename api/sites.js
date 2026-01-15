import { supabaseUrl, supabaseKey } from '../lib/supabase.js';
import { createClient } from '@supabase/supabase-js';
import { provisionWordPress } from '../lib/provisioner.js';
import { Client } from 'ssh2';
import fs from 'fs';
import path from 'path';

function getPrivateKey() {
    if (process.env.SSH_PRIVATE_KEY) return process.env.SSH_PRIVATE_KEY.replace(/\\n/g, '\n');
    try {
        return fs.readFileSync(path.join(process.cwd(), 'keys', 'cloudease_rsa'));
    } catch (err) { return null; }
}

function formatPlatform(platform) {
    if (platform === 'wordpress') return 'WordPress';
    if (platform === 'html') return 'HTML Estático';
    if (!platform) return 'PHP Puro';
    return platform.charAt(0).toUpperCase() + platform.slice(1);
}

export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST,PUT,DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // Authenticate
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token não fornecido' });
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey, {
        global: {
            headers: {
                Authorization: authHeader
            }
        }
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        return res.status(401).json({ error: 'Sessão inválida' });
    }
    const userId = user.id;

    if (req.method === 'GET') {
        const { id, detailed, status_check } = req.query;

        // STATUS CHECK (Progress Bar)
        if (status_check && id) {
             const { data: site } = await supabase
                .from('sites')
                .select(`id, domain, status, servers_cache (ip_address)`)
                .eq('id', id)
                .eq('user_id', userId)
                .single();

            if (!site) return res.status(404).json({ error: 'Site not found' });
            if (site.status === 'active') return res.status(200).json({ percent: 100, step: 'Concluído', status: 'active' });
            if (site.status === 'error') return res.status(200).json({ percent: 0, step: 'Erro', status: 'error', error: site.last_error });

            // SSH Poll
            if (!site.servers_cache?.ip_address) return res.status(200).json({ percent: 10, step: 'Aguardando Servidor...' });

            const logFile = `/var/log/cloudease/${site.domain}.log`;
            const privateKey = getPrivateKey();
            if (!privateKey) return res.status(500).json({ error: 'SSH Key missing' });

            return new Promise((resolve) => {
                const conn = new Client();
                conn.on('ready', () => {
                    conn.exec(`tail -n 20 ${logFile}`, (err, stream) => {
                        if (err) {
                            conn.end();
                            return resolve(res.status(200).json({ percent: 0, step: 'Conectando...' }));
                        }
                        let output = '';
                        stream.on('data', (data) => { output += data.toString(); })
                              .on('close', () => {
                                  conn.end();
                                  
                                  // Parse Logs
                                  let percent = 10;
                                  let step = 'Iniciando...';
                                  
                                  if (output.includes('STARTING')) { percent = 10; step = 'Inicializando...'; }
                                  if (output.includes('Atualizando sistema')) { percent = 20; step = 'Atualizando Sistema...'; }
                                  if (output.includes('Instalando dependencias')) { percent = 30; step = 'Instalando Dependências...'; }
                                  if (output.includes('Instalando Docker')) { percent = 40; step = 'Instalando Docker...'; }
                                  if (output.includes('Baixando WordPress')) { percent = 60; step = 'Baixando WordPress...'; }
                                  if (output.includes('Configurando Containers')) { percent = 70; step = 'Subindo Containers...'; }
                                  if (output.includes('Configurando Nginx')) { percent = 80; step = 'Configurando Proxy em ' + site.servers_cache.ip_address + '...'; }
                                  if (output.includes('SUCCESS')) { percent = 100; step = 'Concluído!'; }
                                  if (output.includes('ERROR')) { percent = 0; step = 'Erro na Instalação'; }

                                  resolve(res.status(200).json({ percent, step, status: site.status }));
                              });
                    });
                }).on('error', (err) => {
                    console.error('SSH Error:', err);
                    resolve(res.status(200).json({ percent: 0, step: 'Erro de Conexão' }));
                }).connect({
                    host: site.servers_cache.ip_address,
                    port: 22,
                    username: 'root',
                    privateKey: privateKey,
                    readyTimeout: 5000
                });
            });
        }

        // DETAILED VIEW
        if (id && detailed) {
            try {
                const { data: site, error } = await supabase
                    .from('sites')
                    .select(`
                        *,
                        servers_cache (
                            name,
                            ip_address,
                            providers (
                                provider_name
                            )
                        ),
                        applications (
                            db_name,
                            db_user,
                            db_pass,
                            db_host
                        )
                    `)
                    .eq('id', id)
                    .eq('user_id', userId)
                    .single();

                if (error || !site) {
                    console.error('Site fetch error:', error);
                    return res.status(404).json({ error: 'Site não encontrado' });
                }

                // Transform to match legacy API structure
                const server = site.servers_cache || {};
                const provider = server.providers || {};
                const app = (site.applications && site.applications[0]) ? site.applications[0] : (site.applications || {});

                const detailedSite = {
                    id: site.id,
                    domain: site.domain,
                    platform: site.platform,
                    platformLabel: formatPlatform(site.platform),
                    status: site.status,
                    server_id: site.server_id,
                    server_name: server.name,
                    ip: server.ip_address || site.ip_address, // Fallback
                    tempUrl: (site.enable_temp_url && server.ip_address) ? `http://${site.domain}.${server.ip_address}.nip.io` : null,
                    provider_name: provider.provider_name,
                    php_version: site.php_version,
                    enable_temp_url: site.enable_temp_url,
                    system_user: site.system_user,
                    system_password: site.system_password,
                    application: {
                        db_name: app.db_name,
                        db_user: app.db_user,
                        db_pass: app.db_pass,
                        db_host: app.db_host || 'localhost'
                    }
                };

                return res.status(200).json(detailedSite);

            } catch (error) {
                console.error('Erro ao buscar detalhes do site:', error);
                return res.status(500).json({ error: 'Erro interno ao buscar detalhes' });
            }
        }

        // LIST VIEW
        try {
            const { data: sites, error } = await supabase
                .from('sites')
                .select(`
                    id, 
                    domain, 
                    platform, 
                    php_version, 
                    status, 
                    created_at,
                    enable_temp_url,
                    last_error,
                    server_id,
                    servers_cache (
                        name,
                        ip_address
                    )
                `)
                .eq('user_id', userId)
                .order('created_at', { ascending: false });

            if (error) throw error;

            // Transform data (flatten structure)
            const flattenedSites = sites.map(s => ({
                id: s.id,
                domain: s.domain,
                platform: s.platform,
                php_version: s.php_version,
                status: s.status,
                created_at: s.created_at,
                enable_temp_url: s.enable_temp_url,
                last_error: s.last_error,
                server_name: s.servers_cache?.name,
                ip_address: s.servers_cache?.ip_address
            }));

            return res.status(200).json(flattenedSites);

        } catch (error) {
            console.error(error);
            return res.status(500).json({ error: 'Erro ao listar sites' });
        }
    }

    if (req.method === 'POST') {
        const { 
            serverId, 
            domain, 
            platform, 
            phpVersion, 
            // WP specific
            wpTitle, 
            wpAdminUser, 
            wpAdminPass, 
            wpAdminEmail 
        } = req.body;
        
        if (!serverId || !domain) {
            return res.status(400).json({ error: 'Servidor e Domínio são obrigatórios.' });
        }

        try {
            // 1. Check if domain already exists for another user? RLS handles isolation, but we might want uniqueness?
            // For now, let's just insert.

            const newSite = {
                user_id: userId,
                server_id: serverId,
                domain: domain,
                platform: platform || 'php',
                php_version: phpVersion || '8.2',
                status: 'provisioning',
                system_user: domain.replace(/\./g, '').substring(0, 10), // Simple username gen
                system_password: Math.random().toString(36).slice(-10) // Tmp password
            };

            const { data: siteData, error: siteError } = await supabase
                .from('sites')
                .insert([newSite])
                .select()
                .single();

            if (siteError) throw siteError;

            // 2. If WordPress, add application details
            let appData = null;
            if (platform === 'wordpress') {
                appData = {
                    site_id: siteData.id,
                    wp_admin_user: wpAdminUser,
                    wp_admin_pass: wpAdminPass,
                    // Store other metadata in separate logic if needed, simplify for now
                    db_name: domain.replace(/\./g, '_').substring(0, 10) + '_db',
                    db_user: domain.replace(/\./g, '_').substring(0, 10) + '_user',
                    db_pass: Math.random().toString(36).slice(-12)
                };

                const { error: appError } = await supabase
                    .from('applications')
                    .insert([appData]);

                if (appError) console.error('Error creating app details:', appError);
            }

            // 3. Trigger Automatic Provisioning
            try {
                const { data: server } = await supabase
                    .from('servers_cache')
                    .select('ip_address')
                    .eq('id', serverId)
                    .single();

                if (server && server.ip_address && server.ip_address !== '0.0.0.0') {
                    console.log(`Starting provisioning on ${server.ip_address}...`);
                    
                    // Don't await to avoid timeout, but log start
                    provisionWordPress(server.ip_address, domain, {
                        dbName: appData?.db_name,
                        dbUser: appData?.db_user,
                        dbPass: appData?.db_pass,
                        wpAdminUser: wpAdminUser,
                        wpAdminPass: wpAdminPass,
                        wpAdminEmail: wpAdminEmail
                    }).then(() => console.log('Provisioning Success via API'))
                      .catch(e => console.error('Provisioning Error via API:', e));
                }
            } catch (provErr) {
                console.error('Provision trigger failed:', provErr);
            }

            return res.status(201).json({ success: true, site: siteData });

        } catch (error) {
            console.error('Create site error:', error);
            return res.status(500).json({ error: 'Erro ao criar site: ' + error.message });
        }
    }

    return res.status(405).json({ error: 'Método não permitido' });
}


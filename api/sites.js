import { supabaseUrl, supabaseKey } from '../lib/supabase.js';
import { createClient } from '@supabase/supabase-js';
import { provisionWordPress, deleteSiteFromInstance, updateNginxConfig, provisionSSL } from '../lib/provisioner.js';
import db from '../lib/db.js'; // Acesso direto ao DB para correções críticas
import { Client } from 'ssh2';
import fs from 'fs';
import path from 'path';
import dns from 'dns';
import { randomBytes } from 'crypto';

/**
 * Gera uma senha criptograficamente segura com até 15 caracteres.
 * Usa letras maiúsculas, minúsculas, números e caracteres especiais
 * seguros para uso em shell scripts (sem aspas ou backticks).
 */
function generateSecurePassword(length = 15) {
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lower = 'abcdefghjkmnpqrstuvwxyz';
    const digits = '23456789';
    const special = '@#%^&*_+=!';
    const all = upper + lower + digits + special;

    // Garante pelo menos um de cada categoria
    const mandatory = [
        upper[randomBytes(1)[0] % upper.length],
        lower[randomBytes(1)[0] % lower.length],
        digits[randomBytes(1)[0] % digits.length],
        special[randomBytes(1)[0] % special.length]
    ];

    const rest = Array.from({ length: length - mandatory.length }, () =>
        all[randomBytes(1)[0] % all.length]
    );

    // Embaralha com randomBytes para não expor posição das obrigatórias
    const combined = [...mandatory, ...rest];
    for (let i = combined.length - 1; i > 0; i--) {
        const j = randomBytes(1)[0] % (i + 1);
        [combined[i], combined[j]] = [combined[j], combined[i]];
    }

    return combined.join('');
}

/**
 * Gera um nome de usuário Linux único e menos previsível.
 * Formato: <prefixo do domínio, até 8 chars> + _ + <4 chars hex aleatório>
 * Exemplo: worldit_3f2a
 */
function generateSecureUsername(domain) {
    const prefix = (domain || 'site')
        .replace(/[^a-z0-9]/g, '')
        .substring(0, 8)
        || 'site';
    const suffix = randomBytes(2).toString('hex'); // 4 chars hex
    return `${prefix}_${suffix}`; // máx 13 chars, sempre começa com letra ou dígito
}

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
            if (!privateKey) {
                console.error('SSH Key missing in status check');
                return res.status(200).json({ percent: 0, step: 'Erro: Chave SSH não configurada', status: 'error' });
            }

            return new Promise((resolve) => {
                const conn = new Client();
                conn.on('ready', () => {
                     // Tenta ler o log principal E o log de debug de execução (se existir)
                     // Ajustado para ler log de debug na pasta root
                     const debugLogFile = `/root/debug_run_${site.domain}.log`;
                     const cmd = `tail -n 20 ${logFile}; echo "---DEBUG---"; cat ${debugLogFile} 2>/dev/null`;
                     
                     conn.exec(cmd, (err, stream) => {
                        if (err) {
                            conn.end();
                            // Pode ser que o arquivo ainda não exista (muito cedo)
                            return resolve(res.status(200).json({ percent: 5, step: 'Aguardando logs...' }));
                        }
                        let output = '';
                        let errorOutput = '';
                        stream.on('data', (data) => { output += data.toString(); })
                              .stderr.on('data', (data) => { errorOutput += data.toString(); }); // Captura stderr
                        
                        stream.on('close', () => {
                                  conn.end();
                                  
                                  // Separa logs principais dos logs de debug
                                  const parts = output.split('---DEBUG---');
                                  const mainLog = parts[0] || '';
                                  const debugLog = parts[1] || '';

                                  // Parse Logs
                                  let percent = 10;
                                  let step = 'Iniciando...';
                                  
                                  if (!mainLog || mainLog.trim() === '') {
                                      // Log vazio ou inexistente
                                      if (debugLog && debugLog.trim().length > 0) {
                                           // Temos erro no debug de execução!
                                           percent = 0;
                                           step = 'Falha na inicialização do script: ' + debugLog.substring(0, 100);
                                           // Update erro
                                           supabase.from('sites').update({ status: 'error', last_error: 'Script init failed: ' + debugLog }).eq('id', id).then();
                                      } else if (errorOutput && errorOutput.includes('No such file')) {
                                          percent = 5;
                                          step = 'Aguardando criação de logs...';
                                      } else if (errorOutput) {
                                          percent = 5;
                                          step = 'Erro ao ler logs: ' + errorOutput.substring(0, 50);
                                      } else {
                                          percent = 5; 
                                          step = 'Preparando ambiente...';
                                      }
                                  } else {
                                      output = mainLog; // Usa só o log principal para o parsing padrão
                                      if (output.includes('STARTING')) { percent = 10; step = 'Inicializando...'; }
                                      if (output.includes('Atualizando sistema')) { percent = 20; step = 'Atualizando Sistema...'; }
                                      if (output.includes('Instalando dependencias')) { percent = 30; step = 'Instalando Dependências...'; }
                                      if (output.includes('Instalando Docker')) { percent = 40; step = 'Instalando Docker...'; }
                                      if (output.includes('Baixando WordPress')) { percent = 60; step = 'Baixando WordPress...'; }
                                      if (output.includes('Configurando Containers')) { percent = 70; step = 'Subindo Containers...'; }
                                      if (output.includes('Configurando Nginx')) { percent = 80; step = 'Configurando Proxy em ' + site.servers_cache.ip_address + '...'; }
                                      if (output.includes('MySQL')) { percent = 25; step = 'Configurando MySQL...'; }
                                      if (output.includes('PHP Detectado')) { percent = 35; step = 'Configurando PHP...'; }
                                      if (output.includes('DONE')) { 
                                          percent = 100; 
                                          step = 'Concluído!'; 
                                          // Update DB status to active if not already
                                          if (site.status !== 'active') {
                                              supabase.from('sites').update({ status: 'active', last_error: null }).eq('id', id).then();
                                          }
                                      }
                                      if (output.includes('ERROR')) { 
                                          percent = 0; 
                                          step = 'Erro na Instalação: Verifique logs'; 
                                          // Update DB status to error
                                          if (site.status !== 'error') {
                                              const errorMsg = output.match(/ERROR:(.+)/)?.[1] || 'Erro desconhecido no script';
                                              supabase.from('sites').update({ status: 'error', last_error: errorMsg.trim() }).eq('id', id).then();
                                          }
                                      }
                                  }

                                  resolve(res.status(200).json({ percent, step, status: site.status, logs: output }));
                              });
                    });
                }).on('error', (err) => {
                    console.error('SSH Connection Error:', err);
                    resolve(res.status(200).json({ percent: 0, step: 'Erro de Conexão: ' + (err.message || 'Timeout') }));
                }).connect({
                    host: site.servers_cache.ip_address,
                    port: 22,
                    username: 'root',
                    privateKey: privateKey,
                    readyTimeout: 20000 // Aumentado para 20s
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
                    tempUrl: (site.enable_temp_url && server.ip_address) ? `http://${site.domain}.${server.ip_address}.nip.io/` : null,
                    provider_name: provider.provider_name,
                    php_version: site.php_version,
                    enable_temp_url: site.enable_temp_url,
                    ssl_active: site.ssl_active === true,
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
            // Tenta buscar com a nova coluna ssl_active
            let { data: sites, error } = await supabase
                .from('sites')
                .select(`
                    id, 
                    domain, 
                    platform, 
                    php_version, 
                    status, 
                    created_at,
                    enable_temp_url,
                    ssl_active,
                    last_error, 
                    server_id,
                    servers_cache (
                        name,
                        ip_address
                    )
                `)
                .eq('user_id', userId)
                .order('created_at', { ascending: false });

            // Fallback: Se der erro (provavelmente coluna ssl_active inexistente no cache da API), tenta query sem essa coluna
            if (error && (error.code === 'PGRST204' || error.message.includes('ssl_active') || error.message.includes('not exist'))) {
                console.warn('Schema desatualizado detected (falta ssl_active), usando fallback para query antiga...');
                const retryResponse = await supabase
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
                
                sites = retryResponse.data;
                error = retryResponse.error;
            }

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
                ssl_active: s.ssl_active === true,
                last_error: s.last_error,
                server_name: s.servers_cache?.name,
                ip_address: s.servers_cache?.ip_address
            }));

            return res.status(200).json(flattenedSites);

        } catch (error) {
            console.error('API Error:', error);
            // Retorna o detalhe do erro para facilitar debug no frontend
            return res.status(500).json({ error: error.message || 'Erro ao listar sites' });
        }
    }

    if (req.method === 'DELETE') {
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: 'ID do site é obrigatório' });

        try {
            // 1. Get site info to find server IP and Domain
            const { data: site, error: fetchError } = await supabase
                .from('sites')
                .select(`
                    domain, 
                    server_id, 
                    status,
                    servers_cache (ip_address),
                    applications (db_name, db_user)
                `)
                .eq('id', id)
                .eq('user_id', userId)
                .single();

            if (fetchError || !site) {
                return res.status(404).json({ error: 'Site não encontrado ou sem permissão' });
            }

            const serverIp = site.servers_cache?.ip_address;

            // 2. Remove from Server (if server exists and IP is valid)
            if (serverIp && serverIp !== '0.0.0.0' && site.status !== 'provisioning') {
                 try {
                     console.log(`Deletando site ${site.domain} do servidor ${serverIp}...`);
                     
                     // Get DB info if available
                     const app = (site.applications && site.applications.length > 0) ? site.applications[0] : {};
                     const dbConfig = {
                         dbName: app.db_name,
                         dbUser: app.db_user
                     };

                     await deleteSiteFromInstance(serverIp, site.domain, dbConfig);
                 } catch (sshError) {
                     console.error('Erro ao deletar do servidor (prosseguindo):', sshError);
                 }
            }

            // 3. Remove from Database
            const { error: delError } = await supabase
                .from('sites')
                .delete()
                .eq('id', id);

            if (delError) throw delError;

            return res.status(200).json({ success: true });

        } catch (error) {
            console.error('Erro ao excluir site:', error);
            return res.status(500).json({ error: 'Erro ao processar exclusão' });
        }
    }

    if (req.method === 'PUT') {
        const { siteId, action, enableTempUrl } = req.body;
        if (!siteId) return res.status(400).json({ error: 'ID do site é obrigatório' });

        try {
            // HANDLE SSL STATUS UPDATE (Auto-Discovery)
            if (action === 'update_ssl_status') {
                const { error: updateError } = await supabase
                    .from('sites')
                    .update({ ssl_active: true })
                    .eq('id', siteId)
                    .eq('user_id', userId);

                if (updateError) {
                    // Tenta auto-healing se falhar
                    if (updateError.message && updateError.message.includes('ssl_active')) {
                        try {
                           await db.query('ALTER TABLE sites ADD COLUMN IF NOT EXISTS ssl_active BOOLEAN DEFAULT FALSE;');
                           await supabase.from('sites').update({ ssl_active: true }).eq('id', siteId).eq('user_id', userId);
                        } catch (e) {
                            return res.status(500).json({ error: 'Falha no auto-healing DB' });
                        }
                    } else {
                        throw updateError;
                    }
                }
                
                return res.status(200).json({ success: true });
            }

            // HANDLE NGINX CONFIG UPDATE (Temp URL)
            if (action === 'update_nginx') {
                const { data: site, error: fetchError } = await supabase
                    .from('sites')
                    .select('id, domain, servers_cache (ip_address), php_version')
                    .eq('id', siteId)
                    .eq('user_id', userId)
                    .single();

                if (fetchError || !site) return res.status(404).json({ error: 'Site não encontrado' });
                
                const serverIp = site.servers_cache?.ip_address;
                if (!serverIp) return res.status(400).json({ error: 'Servidor inválido' });

                await updateNginxConfig(serverIp, site.domain, enableTempUrl, site.php_version);
                
                // Update DB state
                await supabase.from('sites').update({ enable_temp_url: enableTempUrl }).eq('id', siteId);
                
                return res.status(200).json({ success: true });
            }


            // 1. Fetch site details (Retry Provision Logic)
            const { data: site, error: fetchError } = await supabase
                .from('sites')
                .select(`
                    id, domain, platform, system_user, system_password,
                    servers_cache (ip_address),
                    applications (db_name, db_user, db_pass, admin_user, admin_email)
                `)
                .eq('id', siteId)
                .eq('user_id', userId)
                .single();

            if (fetchError || !site) {
                return res.status(404).json({ error: 'Site não encontrado' });
            }

            const serverIp = site.servers_cache?.ip_address;
            if (!serverIp) return res.status(400).json({ error: 'Servidor inválido' });

            // 2. Update status
            await supabase
                .from('sites')
                .update({ status: 'provisioning', last_error: null })
                .eq('id', siteId);

            // 3. Trigger Provisioning
            const app = (site.applications && site.applications.length > 0) ? site.applications[0] : {};
            
            console.log(`Reiniciando provisionamento para ${site.domain} em ${serverIp}...`);
            
            await provisionWordPress(serverIp, site.domain, {
                dbName: app.db_name,
                dbUser: app.db_user,
                dbPass: app.db_pass,
                sysUser: site.system_user,
                sysPass: site.system_password,
                wpAdminUser: app.wp_admin_user || app.admin_user, 
                wpAdminPass: app.wp_admin_pass, 
                wpAdminEmail: app.admin_email,
                platform: site.platform
            }).then(() => console.log('Re-Provisioning Success'))
              .catch(async (e) => {
                  console.error('Re-Provisioning Error:', e);
                  await supabase.from('sites').update({ 
                      status: 'error', 
                      last_error: e.message 
                  }).eq('id', siteId);
              });

            return res.status(200).json({ success: true });

        } catch (error) {
            console.error('Retry error:', error);
            return res.status(500).json({ error: 'Erro ao tentar novamente: ' + error.message });
        }
    }

    if (req.method === 'POST') {
        const { action, id } = req.query;

        // VERIFICAR DNS
        if (action === 'verify-dns') {
            if (!id) return res.status(400).json({ error: 'ID do site obrigatório' });
            
             const { data: site, error: fetchError } = await supabase
                .from('sites')
                .select('domain, servers_cache (ip_address)')
                .eq('id', id)
                .eq('user_id', userId)
                .single();

            if (fetchError || !site) return res.status(404).json({ error: 'Site não encontrado' });
            const serverIp = site.servers_cache?.ip_address;

            return new Promise((resolve) => {
                dns.resolve4(site.domain, (err, addresses) => {
                    if (err) {
                        return resolve(res.status(200).json({ ok: false, error: 'Não encontrado/Propagando (' + err.code + ')' }));
                    }
                    if (addresses.includes(serverIp)) {
                        return resolve(res.status(200).json({ ok: true }));
                    } else {
                        return resolve(res.status(200).json({ ok: false, error: `Domínio aponta para ${addresses[0]}, aguarde propagação.` }));
                    }
                });
            });
        }

        // INSTALAR SSL
        if (action === 'install-ssl') {
            if (!id) return res.status(400).json({ error: 'ID do site obrigatório' });

            const { data: site, error: fetchError } = await supabase
                .from('sites')
                .select('domain, servers_cache (ip_address)')
                .eq('id', id)
                .eq('user_id', userId)
                .single();

             if (fetchError || !site) return res.status(404).json({ error: 'Site não encontrado' });
             const serverIp = site.servers_cache?.ip_address;

             try {
                await provisionSSL(serverIp, site.domain);
                
                // Tenta atualizar via Supabase
                const { error: updateError } = await supabase.from('sites').update({ ssl_active: true }).eq('id', id);
                
                // Se falhar, tenta corrigir o banco e tenta de novo (Auto-Healing)
                if (updateError) {
                    console.error('Erro ao salvar status SSL:', updateError);
                    
                    if (updateError.message && updateError.message.includes('ssl_active')) {
                        console.log('Tentando corrigir coluna ssl_active...');
                        try {
                           await db.query('ALTER TABLE sites ADD COLUMN IF NOT EXISTS ssl_active BOOLEAN DEFAULT FALSE;');
                           // Retenta o update
                           await supabase.from('sites').update({ ssl_active: true }).eq('id', id);
                        } catch (fixErr) {
                            console.error('Falha crítica ao tentar corrigir DB:', fixErr);
                            // Se falhar a correção, não impede o sucesso da instalação, mas o UI pode ficar desatualizado
                        }
                    }
                }

                return res.status(200).json({ ok: true });
             } catch (err) {
                 console.error('SSL Error:', err);
                 return res.status(500).json({ ok: false, error: err.message, detail: err.stderr });
             }
        }

        const { 
            serverId, 
            domain: rawDomain,
            platform, 
            phpVersion, 
            enableTempUrl,
            // WP specific
            wpTitle, 
            wpAdminUser, 
            wpAdminPass, 
            wpAdminEmail 
        } = req.body;
        
        if (!serverId || !rawDomain) {
            return res.status(400).json({ error: 'Servidor e Domínio são obrigatórios.' });
        }

        const domain = rawDomain.toLowerCase().trim();

        try {
            // 1. Check if domain already exists for another user? RLS handles isolation, but we might want uniqueness?
            // For now, let's just insert.

            const newSite = {
                user_id: userId,
                server_id: serverId,
                domain: domain,
                platform: platform || 'php',
                php_version: phpVersion || '8.2',
                enable_temp_url: Boolean(enableTempUrl),
                status: 'provisioning',
                system_user: generateSecureUsername(domain),
                system_password: generateSecurePassword(15)
            };

            const { data: siteData, error: siteError } = await supabase
                .from('sites')
                .insert([newSite])
                .select()
                .single();

            if (siteError) throw siteError;

            // 2. If WordPress or PHP+MySQL, add application details
            let appData = null;
            if (platform === 'wordpress' || platform === 'php-mysql') {
                appData = {
                    site_id: siteData.id,
                    wp_admin_user: wpAdminUser,
                    wp_admin_pass: wpAdminUser ? wpAdminPass : null, // Só salva se tiver user (WP)
                    // Configuração de Banco de Dados Padrão (automática)
                    db_name: (domain || '').replace(/\./g, '_').substring(0, 10) + '_db',
                    db_user: (domain || '').replace(/\./g, '_').substring(0, 10) + '_user',
                    db_pass: generateSecurePassword(15)
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
                    
                    // Adicionado await para garantir que o comando SSH seja enviado antes da função terminar
                    // O provisionWordPress já usa nohup/background, então isso retorna rápido (2-5s)
                    
                    // Configs Específicas
                    const provConfig = {
                        dbName: appData?.db_name,
                        dbUser: appData?.db_user,
                        dbPass: appData?.db_pass,
                        sysUser: newSite.system_user,
                        sysPass: newSite.system_password,
                        wpAdminUser: wpAdminUser,
                        wpAdminPass: wpAdminPass,
                        wpAdminEmail: wpAdminEmail,
                        wpTitle: wpTitle,
                        enableTempUrl: Boolean(enableTempUrl),
                        platform: platform // Passa a plataforma para decidir o que instalar no script
                    };

                    await provisionWordPress(server.ip_address, domain, provConfig);
                    
                    console.log('Provisioning command sent successfully');

                }
            } catch (provErr) {
                console.error('Provision trigger failed:', provErr);
                // Não falhamos o request inteiro se o provision inicial falhar, 
                // o usuário pode tentar "Re-instalar" depois.
                // Mas atualizamos o status para erro
                 await supabase.from('sites').update({ 
                    status: 'error', 
                    last_error: provErr.message 
                }).eq('id', siteData.id);
            }

            return res.status(201).json({ success: true, site: siteData });

        } catch (error) {
            console.error('Create site error:', error);
            return res.status(500).json({ error: 'Erro ao criar site: ' + error.message });
        }
    }

    return res.status(405).json({ error: 'Método não permitido' });
}


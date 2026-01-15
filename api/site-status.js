import { supabaseUrl, supabaseKey } from '../lib/supabase.js';
import { createClient } from '@supabase/supabase-js';
import { Client } from 'ssh2';
import fs from 'fs';
import path from 'path';

function getPrivateKey() {
    if (process.env.SSH_PRIVATE_KEY) return process.env.SSH_PRIVATE_KEY.replace(/\\n/g, '\n');
    try {
        return fs.readFileSync(path.join(process.cwd(), 'keys', 'cloudease_rsa'));
    } catch (err) { return null; }
}

export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const { siteId } = req.query;
    
    // Auth
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Auth required' });
    
    const supabase = createClient(supabaseUrl, supabaseKey, {
        global: { headers: { Authorization: authHeader } }
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return res.status(401).json({ error: 'Invalid session' });

    // Fetch Site & Server Info
    const { data: site } = await supabase
        .from('sites')
        .select(`
            id, domain, status,
            servers_cache (ip_address)
        `)
        .eq('id', siteId)
        .eq('user_id', user.id)
        .single();

    if (!site) return res.status(404).json({ error: 'Site not found' });

    // If active, return 100%
    if (site.status === 'active') {
        return res.status(200).json({ percent: 100, step: 'Concluído', details: 'Site ativo' });
    }

    // Connect SSH to check log
    const ip = site.servers_cache?.ip_address;
    if (!ip) return res.status(200).json({ percent: 0, step: 'Aguardando Servidor' });

    const privateKey = getPrivateKey();
    if (!privateKey) {
        // Fallback fake progress if key missing in dev
        const age = (Date.now() - new Date(site.created_at).getTime()) / 1000;
        let p = Math.min(90, Math.floor(age / 2)); 
        return res.status(200).json({ percent: p, step: 'Provisionando...', details: 'Simulado (Chave SSH ausente)' });
    }

    try {
        const logContent = await new Promise((resolve) => {
            const conn = new Client();
            conn.on('ready', () => {
                // Read last 5 lines of log
                conn.exec(`tail -n 5 /var/log/cloudease/${site.domain}.log`, (err, stream) => {
                    if (err) { conn.end(); return resolve(''); }
                    let data = '';
                    stream.on('data', (d) => data += d).on('close', () => {
                        conn.end();
                        resolve(data.toString());
                    });
                });
            }).on('error', () => resolve(''))
              .connect({ host: ip, port: 22, username: 'root', privateKey: privateKey });
        });

        // Parse Log
        let percent = 10;
        let step = 'Iniciando...';
        
        if (logContent.includes('STARTING')) percent = 10;
        if (logContent.includes('Atualizando sistema')) { percent = 20; step = 'Atualizando OS...'; }
        if (logContent.includes('Instalando dependencias')) { percent = 30; step = 'Instalando Nginx/PHP...'; }
        if (logContent.includes('Configurando Banco')) { percent = 50; step = 'Configurando Banco de Dados...'; }
        if (logContent.includes('Instalando WordPress')) { percent = 70; step = 'Instalando WordPress...'; }
        if (logContent.includes('Configurando Nginx')) { percent = 80; step = 'Configurando Servidor Web...'; }
        if (logContent.includes('Concluido')) { percent = 100; step = 'Finalizando...'; }
        if (logContent.includes('ERROR')) { percent = 0; step = 'Erro na instalação'; }

        res.status(200).json({ percent, step, log: logContent });

    } catch (e) {
        res.status(200).json({ percent: 10, step: 'Conectando...', details: e.message });
    }
}

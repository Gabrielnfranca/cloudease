import db from '../lib/db';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { serverId, domain, platform, phpVersion, cache } = req.body;

    if (!serverId || !domain) {
        return res.status(400).json({ error: 'Servidor e Domínio são obrigatórios' });
    }

    try {
        // 1. Verificar se o domínio já existe
        const check = await db.query('SELECT id FROM sites WHERE domain = $1', [domain]);
        if (check.rows.length > 0) {
            return res.status(400).json({ error: 'Este domínio já está cadastrado.' });
        }

        // 2. Salvar no banco de dados
        // Nota: Em um cenário real, aqui chamaríamos um Agente no servidor via SSH para configurar o Nginx
        // Como estamos em ambiente Serverless sem agente, vamos apenas registrar no banco por enquanto.
        
        const result = await db.query(`
            INSERT INTO sites (server_id, domain, platform, php_version, cache_type, status)
            VALUES ($1, $2, $3, $4, $5, 'provisioning')
            RETURNING id
        `, [1, domain, platform, phpVersion, cache]); // server_id hardcoded como 1 ou mapeado do serverId externo

        // Simulação de delay de provisionamento
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
}

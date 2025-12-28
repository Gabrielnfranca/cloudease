import db from '../lib/db';

export default async function handler(req, res) {
    try {
        // Tenta uma query simples
        const result = await db.query('SELECT NOW() as time');
        
        // Verifica variáveis de ambiente (mascarando valores sensíveis)
        const envCheck = {
            POSTGRES_URL: process.env.POSTGRES_URL ? 'Definido' : 'Não definido',
            POSTGRES_USER: process.env.POSTGRES_USER ? 'Definido' : 'Não definido',
            POSTGRES_HOST: process.env.POSTGRES_HOST ? 'Definido' : 'Não definido',
            POSTGRES_DATABASE: process.env.POSTGRES_DATABASE ? 'Definido' : 'Não definido',
            NODE_ENV: process.env.NODE_ENV
        };

        res.status(200).json({
            status: 'Conexão OK',
            time: result.rows[0].time,
            env: envCheck
        });
    } catch (error) {
        console.error('Erro de conexão:', error);
        res.status(500).json({
            status: 'Erro de Conexão',
            error: error.message,
            code: error.code,
            env: {
                POSTGRES_URL: process.env.POSTGRES_URL ? 'Definido' : 'Não definido'
            }
        });
    }
}

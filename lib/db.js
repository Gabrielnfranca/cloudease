import pg from 'pg';
const { Pool } = pg;

let pool;

function getPool() {
    if (!pool) {
        if (!process.env.POSTGRES_URL) {
            throw new Error("Variável de ambiente POSTGRES_URL não definida. Verifique as configurações do projeto na Vercel.");
        }
        pool = new Pool({
            connectionString: process.env.POSTGRES_URL,
            ssl: {
                rejectUnauthorized: false // Necessário para conexões seguras na Vercel/Neon
            }
        });
    }
    return pool;
}

const db = {
    query: async (text, params) => {
        try {
            const p = getPool();
            return await p.query(text, params);
        } catch (error) {
            console.error("Erro na execução da query:", error);
            throw error;
        }
    }
};

export default db;
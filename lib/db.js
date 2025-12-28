import { createPool } from '@vercel/postgres';

let pool;

function getPool() {
    if (!pool) {
        if (!process.env.POSTGRES_URL) {
            throw new Error("Variável de ambiente POSTGRES_URL não definida. Verifique as configurações do projeto na Vercel.");
        }
        pool = createPool({
            connectionString: process.env.POSTGRES_URL,
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
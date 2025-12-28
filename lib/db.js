import { createPool } from '@vercel/postgres';

let pool;

try {
    if (!process.env.POSTGRES_URL) {
        console.warn("Aviso: POSTGRES_URL não definida. A conexão com o banco falhará.");
    }
    
    pool = createPool({
        connectionString: process.env.POSTGRES_URL,
    });
} catch (error) {
    console.error("Erro fatal ao inicializar pool do banco de dados:", error);
}

const db = {
    query: async (text, params) => {
        if (!pool) {
            throw new Error("Pool de conexão não inicializado. Verifique as variáveis de ambiente (POSTGRES_URL).");
        }
        return pool.query(text, params);
    }
};

export default db;
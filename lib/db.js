import { createPool } from '@vercel/postgres';

// Cria um pool de conexões para ser usado nas APIs
// Isso requer que as variáveis de ambiente POSTGRES_URL, etc. estejam configuradas no Vercel
const db = createPool();

export default db;
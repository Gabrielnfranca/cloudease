import { createPool } from '@vercel/postgres';

const db = createPool();

export default db;
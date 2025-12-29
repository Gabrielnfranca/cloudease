import db from './db';

export async function getProviderToken(provider, userId = 1) {
    const { rows } = await db.query(
        'SELECT api_key FROM providers WHERE provider_name = $1 AND user_id = $2 LIMIT 1',
        [provider, userId]
    );
    return rows.length > 0 ? rows[0].api_key : null;
}

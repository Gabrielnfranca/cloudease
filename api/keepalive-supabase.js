import { supabaseUrl, supabaseKey } from '../lib/supabase.js';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Permite chamada pelo Vercel Cron (header x-vercel-cron) ou por token manual opcional.
    const cronHeader = req.headers['x-vercel-cron'];
    const token = req.query?.token;
    const manualToken = process.env.KEEPALIVE_TOKEN;
    const isManualAuthorized = manualToken && token && token === manualToken;

    if (!cronHeader && !isManualAuthorized) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!supabaseUrl || !supabaseKey) {
        return res.status(500).json({ error: 'Supabase environment not configured' });
    }

    try {
        const response = await fetch(`${supabaseUrl}/auth/v1/health`, {
            method: 'GET',
            headers: {
                apikey: supabaseKey
            }
        });

        if (!response.ok) {
            const body = await response.text();
            return res.status(502).json({
                ok: false,
                message: 'Supabase healthcheck failed',
                status: response.status,
                details: body.slice(0, 500)
            });
        }

        return res.status(200).json({
            ok: true,
            message: 'Supabase keepalive executed',
            timestamp: new Date().toISOString(),
            source: cronHeader ? 'vercel-cron' : 'manual-token'
        });
    } catch (error) {
        return res.status(500).json({
            ok: false,
            message: 'Supabase keepalive error',
            error: error.message
        });
    }
}

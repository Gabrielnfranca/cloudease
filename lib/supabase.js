import { createClient } from '@supabase/supabase-js';

export const supabaseUrl = process.env.SUPABASE_URL || 'https://bnkttosqtddxpzgjwlkf.supabase.co';
export const supabaseKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJua3R0b3NxdGRkeHB6Z2p3bGtmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyNTYzNTAsImV4cCI6MjA5MzgzMjM1MH0.crlONy-3_cGqmunsp_FjqTXpzz2zFjrCfYQg4B5Yz6k';

// Exporta null se as chaves não existirem, em vez de crashar ou usar url fake
export const supabase = (supabaseUrl && supabaseKey) 
    ? createClient(supabaseUrl, supabaseKey) 
    : null;

if (!supabase) {
    console.warn('AVISO: Supabase client não inicializado por falta de variaveis de ambiente.');
}

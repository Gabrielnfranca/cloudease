import { createClient } from '@supabase/supabase-js';

export const supabaseUrl = process.env.SUPABASE_URL || 'https://bgndezyddorxhlfzfzbf.supabase.co';
export const supabaseKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnbmRlenlkZG9yeGhsZnpmemJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzOTUxMjMsImV4cCI6MjA4Mzk3MTEyM30.Iz1saewgwnTct6Tyg4gpLgZxij0bb4Wtd1HQo2hZNbI';

// Exporta null se as chaves não existirem, em vez de crashar ou usar url fake
export const supabase = (supabaseUrl && supabaseKey) 
    ? createClient(supabaseUrl, supabaseKey) 
    : null;

if (!supabase) {
    console.warn('AVISO: Supabase client não inicializado por falta de variaveis de ambiente.');
}

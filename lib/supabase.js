import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

const supabaseUrl = process.env.SUPABASE_URL || 'https://SETUP-REQUIRED.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'SETUP-REQUIRED';

// Não lançar erro no import para evitar Crash da Function
// A validação real acontece nos endpoints (ex: api/auth.js)
if (!process.env.SUPABASE_URL) {
    console.warn('AVISO: SUPABASE_URL não encontrada. Usando placeholder.');
}

export const supabase = createClient(supabaseUrl, supabaseKey);

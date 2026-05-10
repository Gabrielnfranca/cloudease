import { supabase } from '../lib/supabase.js';

async function testLogin() {
    // Check the previous user too
    const email = 'gabrielnfranca@cloudease.com';
    const password = 'Ganorfra150216@@';

    console.log(`Testando login para: ${email}...`);

    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
    });

    if (error) {
        console.error('ERRO DE LOGIN DETALHADO:', JSON.stringify(error, null, 2));
    } else {
        console.log('Login SUCESSO! Token:', data.session?.access_token?.substring(0, 20) + '...');
        console.log('User ID:', data.user.id);
    }
}

testLogin();

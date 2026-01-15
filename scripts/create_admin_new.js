import { supabase } from '../lib/supabase.js';

async function createAdmin() {
    const email = 'gn.franca81@gmail.com';
    const password = 'Ganorfra150216@@';
    const name = 'Gabriel Admin';

    console.log(`Criando/Atualizando usuário admin: ${email}...`);

    try {
        // 1. Tentar Login para verificar existência
        const { data: loginData } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (loginData?.user) {
            console.log('Usuário logado/encontrado com sucesso. ID:', loginData.user.id);
        } else {
            // 2. Criar se não existir
            const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
                email,
                password,
                options: { data: { name: name } }
            });

            if (signUpError) {
                console.error('Erro ao criar usuário:', signUpError.message);
            } else {
                console.log('Usuário criado. ID:', signUpData.user?.id);
            }
        }
    } catch (e) {
        console.error('Erro:', e);
    }
}

createAdmin();

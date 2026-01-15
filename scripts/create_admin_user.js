import { supabase } from '../lib/supabase.js';

async function createAdmin() {
    const email = 'gabrielnfranca@cloudease.com';
    const password = 'Ganorfra150216@@';
    const name = 'Gabriel Franca';

    console.log(`Criando usuário admin: ${email}...`);

    try {
        // 1. Tentar Login primeiro (caso já exista)
        const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        let userId;

        if (loginData?.user) {
            console.log('Usuário já existe. ID:', loginData.user.id);
            userId = loginData.user.id;
        } else {
            // 2. Criar usuário se não existir
            const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: { name: name }
                }
            });

            if (signUpError) {
                console.error('Erro ao criar usuário:', signUpError.message);
                return;
            }

            console.log('Usuário criado com sucesso! ID:', signUpData.user.id);
            userId = signUpData.user.id;
        }

        // 3. Tentar definir como admin no banco (pode falhar por RLS se não for service_role, mas tentamos)
        if (userId) {
            // Tenta update direto
            const { error: updateError } = await supabase
                .from('profiles')
                .update({ is_admin: true })
                .eq('id', userId);

            if (updateError) {
                console.warn('Aviso: Não foi possível setar flag is_admin no banco (provavelmente RLS). Mas o acesso será garantido pelo email no código.');
            } else {
                console.log('Flag de admin definida no banco de dados com sucesso.');
            }
        }

    } catch (e) {
        console.error('Erro inesperado:', e);
    }
}

createAdmin();

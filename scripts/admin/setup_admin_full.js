
import { supabase } from '../lib/supabase.js';

async function setupAdmin() {
    const email = 'gn.franca81@gmail.com';
    const password = 'Ganorfra150216@@';
    const name = 'Gabriel Admin';

    console.log(`Configurando admin: ${email}...`);

    try {
        // 1. Check if user exists or create
        let userId;
        const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (loginData?.user) {
            console.log('Usuário logado. ID:', loginData.user.id);
            userId = loginData.user.id;
        } else {
            console.log('Criando usuário...');
            const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
                email,
                password,
                options: { data: { name: name } }
            });

            if (signUpError) {
                console.error('Erro no cadastro:', signUpError.message);
                // If it says "User already registered" but login failed, it might be a password mismatch or unconfirmed email.
                // We'll try to get the user by other means if possible not supported by client lib directly usually.
                return;
            }
            userId = signUpData.user?.id;
            console.log('Usuário criado. ID:', userId);
        }

        if (userId) {
            // 2. Set is_admin = true in profiles
            console.log('Atualizando permissões de administrador...');
            const { error: updateError } = await supabase
                .from('profiles')
                .update({ is_admin: true }) // Also set plan mock
                .eq('id', userId);

            if (updateError) {
                console.error('Erro ao atualizar profile:', updateError);
            } else {
                console.log('Sucesso! Usuário agora é administrador.');
            }
        }

    } catch (e) {
        console.error('Erro geral:', e);
    }
}

setupAdmin();

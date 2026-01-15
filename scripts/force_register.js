import { supabase } from '../lib/supabase.js';

async function forceRegister() {
    const email = 'gn.franca81@gmail.com';
    const password = 'Ganorfra150216@@';

    console.log(`Tentando registrar novamente (agora que a confirmacao foi desligada) para: ${email}...`);

    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: { name: 'Gabriel Admin' }
        }
    });

    if (error) {
        console.error('Erro no cadastro:', error.message);
        if (error.message.includes("registered")) {
            console.log("\n>>> O usuário JÁ EXISTE em estado inválido."); 
            console.log(">>> SOLUÇÃO: Vá no painel do Supabase -> Authentication -> Users.");
            console.log(">>> DELETE o usuário 'gn.franca81@gmail.com'.");
            console.log(">>> Depois, me avise para eu criar de novo, ou ele será criado automaticamente no próximo login/registro.");
        }
    } else {
        console.log('Cadastro enviado! Verifique se retornou sessão.');
        if (data.session) {
            console.log('SUCESSO! Sessão criada. O login deve funcionar agora.');
        } else {
            console.log('Usuário criado, mas sem sessão. (Ainda pode estar pendente se a config não propagou).');
        }
    }
}

forceRegister();

document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.querySelector('form[action="/login"]');
    
    if (loginForm) {
        loginForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const submitBtn = loginForm.querySelector('button[type="submit"]');
            const originalBtnText = submitBtn.innerHTML;
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Entrando...';

            // O HTML usa 'username' mas a API espera 'email'
            // Vamos prevenir erros de espaços em branco comuns em copy-paste
            const email = document.getElementById('username').value.trim();
            const password = document.getElementById('password').value; // Senha não deve ter trim se o user quis espaço, mas geralmente não tem. Por segurança mantemos raw ou trim? Supabase ignora trailing space em senha? Melhor não arriscar.

            try {
                const response = await fetch('/api/auth?action=login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        email: email,
                        password: password
                    })
                });

                let data;
                const contentType = response.headers.get("content-type");
                if (contentType && contentType.indexOf("application/json") !== -1) {
                    data = await response.json();
                } else {
                    const text = await response.text();
                    console.error('Non-JSON response:', text);
                    throw new Error(`Server status: ${response.status}`);
                }

                if (response.ok) {
                    // Salva o token e dados do usuário
                    localStorage.setItem('authToken', data.token);
                    localStorage.setItem('user', JSON.stringify(data.user));
                    
                    // Redireciona para o dashboard
                    window.location.href = 'dashboard.html';
                } else {
                    alert('Erro: ' + (data.error || 'Falha no login'));
                }
            } catch (error) {
                console.error('Erro detalhado:', error);
                alert('Erro: ' + error.message);
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnText;
            }
        });
    }
});

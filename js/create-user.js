document.addEventListener('DOMContentLoaded', function() {
    const registerForm = document.querySelector('form[action="/register"]');
    
    if (registerForm) {
        registerForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const submitBtn = registerForm.querySelector('button[type="submit"]');
            const originalBtnText = submitBtn.innerHTML;
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Criando...';

            const name = document.getElementById('name').value;
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const confirmPassword = document.getElementById('confirm-password').value;

            if (password !== confirmPassword) {
                alert('As senhas não coincidem!');
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnText;
                return;
            }

            try {
                const response = await fetch('/api/register', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        name: name,
                        email: email,
                        password: password
                    })
                });

                const data = await response.json();

                if (response.ok) {
                    alert('Conta criada com sucesso! Faça login para continuar.');
                    window.location.href = 'index.html';
                } else {
                    alert('Erro: ' + (data.error || 'Falha ao criar conta'));
                }
            } catch (error) {
                console.error('Erro:', error);
                alert('Erro de conexão. Tente novamente.');
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnText;
            }
        });
    }
});
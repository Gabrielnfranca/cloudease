document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('connectHostForm');
    
    if (form) {
        form.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const submitBtn = form.querySelector('button[type="submit"]');
            const originalBtnText = submitBtn.innerHTML;
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Conectando...';

            const hostName = document.getElementById('hostName').value;
            const token = document.getElementById('token').value;
            
            let provider = 'digitalocean';
            if (window.location.href.includes('linode')) provider = 'linode';
            if (window.location.href.includes('vultr')) provider = 'vultr';

            try {
                const authToken = localStorage.getItem('authToken');
                const response = await fetch('/api/providers', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${authToken}`
                    },
                    body: JSON.stringify({
                        provider: provider,
                        name: hostName,
                        token: token
                    })
                });

                const contentType = response.headers.get("content-type");
                let data;
                if (contentType && contentType.indexOf("application/json") !== -1) {
                    data = await response.json();
                } else {
                    const text = await response.text();
                    console.error("Resposta não-JSON do servidor:", text);
                    throw new Error(`Erro no servidor (${response.status}). Verifique o console.`);
                }

                if (response.ok) {
                    alert('Conexão realizada com sucesso!');
                    window.location.href = 'connections.html';
                } else {
                    if (response.status === 401 && (data.error === 'Sessão inválida' || data.error === 'Token inválido')) {
                        alert('Sua sessão expirou. Você será redirecionado para o login.');
                        window.location.href = 'index.html';
                        return;
                    }
                    alert('Erro: ' + (data.error || 'Falha desconhecida'));
                }
            } catch (error) {
                console.error('Erro:', error);
                alert('Erro ao conectar: ' + error.message);
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnText;
            }
        });
    }
});
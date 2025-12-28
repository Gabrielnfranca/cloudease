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
                const response = await fetch('/api/connect-provider', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        provider: provider,
                        name: hostName,
                        token: token
                    })
                });

                const data = await response.json();

                if (response.ok) {
                    alert('Conexão realizada com sucesso!');
                    window.location.href = 'connections.html';
                } else {
                    alert('Erro: ' + data.error);
                }
            } catch (error) {
                console.error('Erro:', error);
                alert('Erro ao conectar com o servidor.');
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnText;
            }
        });
    }
});
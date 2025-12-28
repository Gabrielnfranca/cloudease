document.addEventListener('DOMContentLoaded', async function() {
    const serverSelect = document.getElementById('serverSelect');
    const form = document.getElementById('createSiteForm');

    // Carregar servidores disponíveis
    try {
        const response = await fetch('/api/servers');
        const servers = await response.json();
        
        serverSelect.innerHTML = '<option value="">Selecione um servidor...</option>';
        
        if (servers.length === 0) {
            const option = document.createElement('option');
            option.text = "Nenhum servidor encontrado. Crie um primeiro.";
            option.disabled = true;
            serverSelect.add(option);
        } else {
            servers.forEach(server => {
                const option = document.createElement('option');
                option.value = server.external_id || server.name; // Idealmente usar ID interno
                option.text = `${server.name} (${server.ipv4})`;
                serverSelect.add(option);
            });
        }
    } catch (error) {
        console.error('Erro ao carregar servidores:', error);
        serverSelect.innerHTML = '<option value="">Erro ao carregar servidores</option>';
    }

    // Envio do formulário
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const btn = form.querySelector('button[type="submit"]');
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Criando Site...';

        const formData = {
            serverId: serverSelect.value,
            domain: document.getElementById('domain').value,
            platform: document.getElementById('platform').value,
            phpVersion: document.getElementById('phpVersion').value,
            cache: document.getElementById('cache').value
        };

        try {
            const response = await fetch('/api/create-site', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            });

            const data = await response.json();

            if (response.ok) {
                alert('Site criado com sucesso! As configurações DNS podem levar algumas horas para propagar.');
                window.location.href = 'sites.html';
            } else {
                alert('Erro: ' + (data.error || 'Falha ao criar site'));
            }
        } catch (error) {
            console.error('Erro:', error);
            alert('Erro de conexão.');
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    });
});

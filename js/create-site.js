document.addEventListener('DOMContentLoaded', async function() {
    const serverSelect = document.getElementById('serverSelect');
    const form = document.getElementById('createSiteForm');

    // Carregar servidores disponíveis
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch('/api/servers', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
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
                option.value = server.id;
                option.text = `${server.name} (${server.ipv4 || server.ip_address})`;
                serverSelect.add(option);
            });
        }
    } catch (error) {
        console.error('Erro ao carregar servidores:', error);
        serverSelect.innerHTML = '<option value="">Erro ao carregar servidores</option>';
    }

    // Toggle WP Fields
    window.toggleWpFields = function() {
        const platform = document.getElementById('platform').value;
        const wpFields = document.getElementById('wp-fields');
        if (platform === 'wordpress') {
            wpFields.style.display = 'block';
        } else {
            wpFields.style.display = 'none';
        }
    };
    // Inicializa estado
    toggleWpFields();

    // Funções de Senha
    window.togglePasswordVisibility = function() {
        const passwordInput = document.getElementById('wpAdminPass');
        const icon = document.getElementById('togglePasswordIcon');
        
        if (passwordInput.type === 'password') {
            passwordInput.type = 'text';
            icon.classList.remove('fa-eye');
            icon.classList.add('fa-eye-slash');
        } else {
            passwordInput.type = 'password';
            icon.classList.remove('fa-eye-slash');
            icon.classList.add('fa-eye');
        }
    };

    window.generateStrongPassword = function() {
        const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+";
        const length = 16;
        let password = "";
        for (let i = 0; i < length; i++) {
            const randomNumber = crypto.getRandomValues(new Uint32Array(1))[0];
            password += chars[randomNumber % chars.length];
        }
        
        const passwordInput = document.getElementById('wpAdminPass');
        passwordInput.value = password;
        
        // Mostra a senha gerada
        if (passwordInput.type === 'password') {
            togglePasswordVisibility();
        }
    };

    // Envio do formulário
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const btn = form.querySelector('button[type="submit"]');
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Criando Site...';

        const platform = document.getElementById('platform').value;
        
        const formData = {
            serverId: serverSelect.value,
            domain: document.getElementById('domain').value,
            enableTempUrl: document.getElementById('enableTempUrl').checked,
            platform: platform,
            phpVersion: document.getElementById('phpVersion').value,
            cache: document.getElementById('cache').value,
            // Campos WP opcionais
            wpTitle: platform === 'wordpress' ? document.getElementById('wpTitle').value : null,
            wpAdminUser: platform === 'wordpress' ? document.getElementById('wpAdminUser').value : null,
            wpAdminPass: platform === 'wordpress' ? document.getElementById('wpAdminPass').value : null,
            wpAdminEmail: platform === 'wordpress' ? document.getElementById('wpAdminEmail').value : null,
            wpLang: platform === 'wordpress' ? document.getElementById('wpLang').value : null
        };

        try {
            const token = localStorage.getItem('authToken');
            const response = await fetch('/api/sites', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
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

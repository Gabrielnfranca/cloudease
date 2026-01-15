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
        updateCacheHelp(); // Atualiza ajuda do cache ao mudar plataforma
    };

    // Cache Help Dynamic Logic
    window.updateCacheHelp = function() {
        const platform = document.getElementById('platform').value;
        const cache = document.getElementById('cache').value;
        const helpBox = document.getElementById('cache-help');
        const color = "#2b6cb0";

        let text = "";

        if (cache === 'redis') {
            text = `
                <strong><i class="fas fa-bolt" style="color:${color}"></i> Redis (Banco de Dados em Memória):</strong>
                Ideal para <strong>${platform === 'wordpress' ? 'WordPress' : 'Sistemas PHP+MySQL'}</strong>. 
                Acelera consultas ao banco. Indispensável para lojas virtuais e sistemas dinâmicos.
            `;
            // Aviso para HTML/PHP Simples
            if (platform === 'html' || platform === 'php') {
                text += `<br><span style="color: #e53e3e; font-size: 0.9em;"><i class="fas fa-exclamation-circle"></i> Não recomendado para ${platform.toUpperCase()}. Use 'Sem Cache' ou 'FastCGI'.</span>`;
            }
        } else if (cache === 'fastcgi') {
            text = `
                <strong><i class="fas fa-tachometer-alt" style="color:${color}"></i> Nginx FastCGI (Página Estática):</strong>
                Salva a página inteira em HTML. Ultra-rápido.
                ${platform === 'wordpress' ? '<br>Excelente para Blogs e Sites Institucionais. <strong>Evite se tiver área de membros/login.</strong>' : ''}
                ${platform === 'php' ? '<br>Bom para sites PHP institucionais sem login.' : ''}
            `;
             if (platform === 'html') {
                text += `<br><span style="color: #718096; font-size: 0.9em;">Desnecessário para HTML puro (já é rápido).</span>`;
            }
        } else { // none
            text = `
                <strong><i class="fas fa-ban" style="color:#718096"></i> Sem Cache:</strong>
                O conteúdo é gerado na hora.
                ${platform === 'html' ? '<br><span style="color: #38a169; font-weight:600;">Recomendado para HTML Estático.</span>' : ''}
                ${platform === 'php' ? '<br>Recomendado se seu script PHP tiver painel de login/sessões.' : ''}
                <br>Mais seguro para evitar problemas de atualização de conteúdo.
            `;
        }

        helpBox.innerHTML = text;
    };

    // Inicializa estado
    toggleWpFields();
    updateCacheHelp();

    // Funções para Senha
    window.togglePassword = function() {
        const input = document.getElementById('wpAdminPass');
        const icon = document.getElementById('togglePass');
        if (input.type === 'password') {
            input.type = 'text';
            icon.classList.replace('fa-eye', 'fa-eye-slash');
        } else {
            input.type = 'password';
            icon.classList.replace('fa-eye-slash', 'fa-eye');
        }
    }

    window.generatePassword = function() {
        const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
        let pass = '';
        const array = new Uint32Array(20);
        window.crypto.getRandomValues(array);
        for(let i=0; i<16; i++) {
            pass += chars[array[i] % chars.length];
        }
        
        const input = document.getElementById('wpAdminPass');
        input.value = pass;
        input.type = 'text'; // Mostra a senha gerada
        
        const icon = document.getElementById('togglePass');
        icon.classList.replace('fa-eye', 'fa-eye-slash');
        
        // Efeito visual de foco
        input.focus();
    }

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
            enableTempUrl: false, // Default is disabled, user can enable later in details
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

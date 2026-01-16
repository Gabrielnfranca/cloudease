// Modal State
let currentModalType = null; // 'sftp' or 'db'
let currentSiteId = null;

document.addEventListener('DOMContentLoaded', function() {
    // Obter Site ID da URL
    const urlParams = new URLSearchParams(window.location.search);
    currentSiteId = urlParams.get('id');

    if (!currentSiteId) {
        alert('Site não especificado');
        window.location.href = 'sites.html';
        return;
    }

    loadSiteDetails(currentSiteId);

    // Tab Switching Logic
    const tabs = document.querySelectorAll('.tab-btn');
    const contents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Remove active
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));
            
            // Set active
            tab.classList.add('active');
            const target = tab.getAttribute('data-tab');
            document.getElementById(target).classList.add('active');
        });
    });

    // Close Modal Logic
    document.querySelectorAll('.close-modal, .close-modal-btn').forEach(el => {
        el.addEventListener('click', closeModal);
    });

    const newPassInput = document.getElementById('newPassword');
    if (newPassInput) {
        newPassInput.addEventListener('input', checkPasswordStrength);
    }
});

async function loadSiteDetails(siteId) {
    try {
        // Adiciona timestamp para evitar cache do navegador
        const authToken = localStorage.getItem('authToken');
        const response = await fetch(`/api/sites?id=${siteId}&detailed=true&t=${Date.now()}`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Falha ao carregar detalhes');
        }
        
        const site = await response.json();
        
        renderHeader(site);
        renderDetails(site);
        renderAccess(site);
        renderDatabase(site);
        renderSSL(site);
        
    } catch (error) {
        console.error(error);
        const container = document.querySelector('.main-content');
        container.innerHTML = `
            <div style="text-align: center; padding: 50px; color: #e53e3e;">
                <i class="fas fa-exclamation-triangle" style="font-size: 48px; margin-bottom: 20px;"></i>
                <h2>Erro ao carregar site</h2>
                <p>${error.message}</p>
                 <br>
                <a href="sites.html" class="action-btn" style="background: #e53e3e; color: white; display: inline-flex; margin-top: 20px;">
                     Voltar para Sites
                </a>
            </div>
        `;
    }
}

function renderHeader(site) {
    document.getElementById('siteDomainTitle').textContent = site.domain;
    
    const badge = document.getElementById('siteStatusBadge');
    badge.textContent = site.status === 'active' ? 'Ativo' : site.status;
    badge.className = `status-badge ${site.status}`;
    
    const visitBtn = document.getElementById('visitSiteBtn');
    // Prefer temp url if set
    // Adiciona /wp-admin para redirecionar diretamente ao login
    let url = (site.enable_temp_url && site.ip) 
        ? `http://${site.domain}.${site.ip}.nip.io/wp-admin/` 
        : `http://${site.domain}/wp-admin/`;
    
    visitBtn.href = url;
}

function getProviderIcon(name) {
    if (!name) return '<i class="fas fa-cloud" style="color: #4a5568;"></i> Desconhecido';
    
    const lower = name.toLowerCase();
    if (lower.includes('digitalocean') || lower.includes('digital ocean')) 
        return '<i class="fab fa-digital-ocean" style="color: #0080FF;"></i> DigitalOcean';
    if (lower.includes('aws') || lower.includes('amazon')) 
        return '<i class="fab fa-aws" style="color: #FF9900;"></i> AWS';
    if (lower.includes('google') || lower.includes('gcp')) 
        return '<i class="fab fa-google" style="color: #4285F4;"></i> Google Cloud';
    if (lower.includes('azure') || lower.includes('microsoft')) 
        return '<i class="fab fa-microsoft" style="color: #00BCF2;"></i> Azure';
    if (lower.includes('vultr')) 
        return '<i class="fas fa-server" style="color: #007BFC;"></i> Vultr';
    if (lower.includes('linode') || lower.includes('akamai')) 
        return '<i class="fas fa-cubes" style="color: #02b159;"></i> Linode';
    if (lower.includes('hetzner')) 
        return '<i class="fas fa-box" style="color: #d50c2d;"></i> Hetzner';
    
    return `<i class="fas fa-cloud"></i> ${name}`;
}

function renderDetails(site) {
    document.getElementById('detailDomain').textContent = site.domain;
    document.getElementById('detailIp').textContent = site.ip || 'Não atribuído';
    document.getElementById('detailServerName').textContent = site.server_name || site.server || 'Desconhecido';
    
    const providerEl = document.getElementById('detailProvider');
    if (providerEl) {
        providerEl.innerHTML = getProviderIcon(site.provider_name);
    }

    document.getElementById('detailPlatform').textContent = site.platformLabel || site.platform;
    document.getElementById('detailPhp').textContent = site.php_version || 'N/A';
    document.getElementById('detailRootPath').textContent = `/var/www/${site.domain}`;

    // Temp URL State
    const toggle = document.getElementById('tempUrlToggle');
    const statusText = document.getElementById('tempUrlStatus');
    
    if (toggle) {
        toggle.checked = site.enable_temp_url || false;
        
        if (site.enable_temp_url) {
            statusText.innerHTML = '<span style="color: #22c55e; font-weight: 500;">Ativado</span>';
        } else {
            statusText.textContent = 'Desativado';
        }
        
        // Se site não estiver ativo ou não tiver IP, desabilita
        if (site.status !== 'active' || !site.ip || site.ip === 'Pendente') {
            toggle.disabled = true;
            toggle.parentElement.title = "Aguarde o site ser ativado para alterar esta configuração.";
        } else {
             toggle.disabled = false;
        }
    }
}

window.toggleTempUrl = async function(checkbox) {
    if (checkbox.disabled) return;
    
    const enable = checkbox.checked;
    const statusLabel = document.getElementById('tempUrlStatus');
    
    // UI Feedback imediato (loading)
    checkbox.disabled = true;
    statusLabel.textContent = "Atualizando...";
    
    try {
        const authToken = localStorage.getItem('authToken');
        const response = await fetch('/api/sites', {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                siteId: currentSiteId,
                action: 'update_nginx',
                enableTempUrl: enable
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Erro ao atualizar');
        }

        // Reload details to update links (bypass cache)
        await loadSiteDetails(currentSiteId);

    } catch (error) {
        alert('Erro ao alterar configuração: ' + error.message);
        // Revert UI
        checkbox.checked = !enable;
        statusLabel.textContent = !enable ? 'Ativado' : 'Desativado';
    } finally {
        checkbox.disabled = false;
    }
};

function renderAccess(site) {
    // Inputs use .value, not .textContent
    const hostInput = document.getElementById('sftpHost');
    if (hostInput) hostInput.value = site.ip || '-';
    
    const userInput = document.getElementById('sftpUser');
    if (userInput) {
        if (site.system_user && site.system_user !== 'root') {
             userInput.value = site.system_user;
        } else {
             // Se não tiver usuário ou for root, sugerimos um novo ou mostramos root
             userInput.value = site.system_user || 'root';
        }
    }
    
    // Using value for inputs
    const passInput = document.getElementById('sftpPass');
    if (passInput) {
        passInput.value = site.system_password || '********';
        passInput.type = 'password'; // Start as password type
    }
    
    const btn = document.getElementById('webFileManagerBtn');
    if(btn) btn.href = `http://${site.ip}:8080/filemanager?root=/var/www/${site.domain}`; 
}

function renderDatabase(site) {
    if (site.application && site.application.db_name) {
        const dbNameInput = document.getElementById('dbName');
        if (dbNameInput) dbNameInput.value = site.application.db_name;
        
        const dbUserInput = document.getElementById('dbUser');
        if (dbUserInput) dbUserInput.value = site.application.db_user;
        
        const dbPassInput = document.getElementById('dbPass');
        if (dbPassInput) {
            dbPassInput.value = site.application.db_pass;
            dbPassInput.type = 'password';
        }
        
        const dbHostInput = document.getElementById('dbHost');
        if (dbHostInput) dbHostInput.value = site.application.db_host || 'localhost';
    } else {
        const dbDiv = document.getElementById('database');
        if (dbDiv) dbDiv.innerHTML = '<div class="info-card"><p>Nenhum banco de dados associado a este site.</p></div>';
    }
    
    const pmaBtn = document.getElementById('phpMyAdminBtn');
    if (site.ip && pmaBtn) {
        pmaBtn.href = `http://${site.ip}/phpmyadmin`;
    }
}

function copyToClipboard(btn, selector) {
    const el = document.querySelector(selector);
    if (!el) return;
    
    // Se o elemento estiver vazio ou com o valor padrão de carregamento, não copie
    const text = el.value || el.textContent;
    if (!text || text === '-' || text === '********') return;
    
    // Fallback para navegadores sem API Clipboard (opcional, mas boa prática)
    if (!navigator.clipboard) {
        el.select();
        document.execCommand('copy');
        showCopyFeedback(btn);
        return;
    }

    navigator.clipboard.writeText(text).then(() => {
        showCopyFeedback(btn);
    }).catch(err => {
        console.error('Erro ao copiar:', err);
    });
}

function showCopyFeedback(btn) {
    if (!btn) return;
    const originalHtml = btn.innerHTML;
    const originalTitle = btn.title;
    
    // Adiciona texto de feedback
    btn.innerHTML = '<i class="fas fa-check" style="color: #22c55e;"></i> <span style="font-weight: 600; color: #22c55e; margin-left: 6px; font-size: 13px;">Copiado!</span>';
    btn.title = "Copiado!";
    
    setTimeout(() => { 
        btn.innerHTML = originalHtml;
        btn.title = originalTitle;
    }, 2000);
}

// Modal Functions
function openPasswordModal(type) {
    currentModalType = type;
    const modal = document.getElementById('passwordModal');
    const title = document.getElementById('modalTitle');
    const input = document.getElementById('newPassword');
    
    title.textContent = type === 'sftp' ? 'Redefinir Senha SFTP' : 'Redefinir Senha Banco de Dados';
    input.value = '';
    
    generateStrongPassword(); // Auto generate
    
    modal.classList.add('show');
}

function closeModal() {
    const modal = document.getElementById('passwordModal');
    modal.classList.remove('show');
    currentModalType = null;
}

function generateStrongPassword() {
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+";
    let password = "";
    // Ensure complexity
    password += "ABCDEFGHIJKLMNOPQRSTUVWXYZ".charAt(Math.floor(Math.random() * 26));
    password += "abcdefghijklmnopqrstuvwxyz".charAt(Math.floor(Math.random() * 26));
    password += "0123456789".charAt(Math.floor(Math.random() * 10));
    password += "!@#$%^&*".charAt(Math.floor(Math.random() * 8));

    for (let i = 0; i < 16; i++) {
        password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    
    // Shuffle
    password = password.split('').sort(function(){return 0.5-Math.random()}).join('');
    
    const input = document.getElementById('newPassword');
    input.value = password;
    checkPasswordStrength();
}

function checkPasswordStrength() {
    const password = document.getElementById('newPassword').value;
    const bar = document.querySelector('.strength-bar');
    const text = document.querySelector('.strength-text');
    
    let strength = 0;
    if (password.length >= 8) strength++;
    if (password.length >= 12) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;

    bar.className = 'strength-bar';
    if (strength < 3) {
        bar.classList.add('weak');
        text.textContent = 'Fraca';
        text.style.color = '#ef4444';
    } else if (strength < 5) {
        bar.classList.add('medium');
        text.textContent = 'Média';
        text.style.color = '#f59e0b';
    } else {
        bar.classList.add('strong');
        text.textContent = 'Forte';
        text.style.color = '#10b981';
    }
}

async function saveNewPassword() {
    const newPass = document.getElementById('newPassword').value;
    if (!newPass || newPass.length < 8) {
        alert('A senha deve ter pelo menos 8 caracteres.');
        return;
    }

    const btn = document.querySelector('.btn-save');
    const originalText = btn.textContent;
    btn.textContent = 'Salvando...';
    btn.disabled = true;

    try {
        const authToken = localStorage.getItem('authToken');
        const response = await fetch('/api/sites', {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                action: 'update_password',
                siteId: currentSiteId,
                type: currentModalType, // 'sftp' or 'db'
                password: newPass
            })
        });

        const data = await response.json();

        if (response.ok) {
            alert('Senha atualizada com sucesso!');
            closeModal();
            loadSiteDetails(currentSiteId); // Reload to show new
        } else {
            throw new Error(data.error || 'Erro ao atualizar senha');
        }
    } catch (error) {
        console.error(error);
        alert(error.message);
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

// Utils
function togglePass(btn, elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    
    const icon = btn.querySelector('i');
    
    if (el.type === 'password') {
        el.type = 'text';
        el.classList.remove('blur');
        if (icon) {
            icon.classList.remove('fa-eye');
            icon.classList.add('fa-eye-slash');
        }
        btn.title = "Ocultar";
    } else {
        el.type = 'password';
        el.classList.add('blur');
        if (icon) {
            icon.classList.remove('fa-eye-slash');
            icon.classList.add('fa-eye');
        }
        btn.title = "Visualizar";
    }
}

function renderSSL(site) {
    // Fill References
    document.querySelectorAll('.domain-ref').forEach(el => el.textContent = site.domain);
    document.querySelectorAll('.ip-ref').forEach(el => el.textContent = site.ip);

    // Initial Status Check
    updateSSLStatusURI(site.ssl_active);
}

function updateSSLStatusURI(isActive) {
    const icon = document.getElementById('sslStatusIcon');
    const title = document.getElementById('sslStatusTitle');
    const desc = document.getElementById('sslStatusDesc');

    if (!icon || !title || !desc) return; // Prevent errors if elements missing

    icon.className = 'status-icon ' + (isActive ? 'secure' : 'insecure');
    
    if (isActive) {
        icon.innerHTML = '<i class="fas fa-lock"></i>';
        title.textContent = 'SSL Instalado e Ativo';
        desc.textContent = 'Seu site está protegido com HTTPS.';
        
        const stepInstall = document.getElementById('stepInstall');
        if (stepInstall) stepInstall.classList.add('disabled');
        
        const btnInstall = document.getElementById('btnInstallSSL');
        if (btnInstall) {
             btnInstall.textContent = 'Reinstalar / Renovar Forçado';
             btnInstall.disabled = false;
        }

        // Permite re-verificar DNS e reinstalar se quiser
        if (stepInstall) stepInstall.classList.remove('disabled');
    } else {
        icon.innerHTML = '<i class="fas fa-unlock"></i>';
        title.textContent = 'Não Seguro / Não Instalado';
        desc.textContent = 'O certificado SSL não está ativo. Verifique o DNS e instale.';
        
        const stepInstall = document.getElementById('stepInstall');
        if (stepInstall) stepInstall.classList.add('disabled');
        
        const btnInstall = document.getElementById('btnInstallSSL');
        if (btnInstall) btnInstall.textContent = 'Instalar SSL';
    }
}

async function verifyDNS() {
    const btn = document.querySelector('.btn-verify');
    const resultDiv = document.getElementById('dnsResult');
    const stepInstall = document.getElementById('stepInstall');
    const btnInstall = document.getElementById('btnInstallSSL');
    
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando...';
    resultDiv.textContent = '';
    resultDiv.className = 'verification-result';

    try {
        const authToken = localStorage.getItem('authToken');
        const response = await fetch(`/api/sites?id=${currentSiteId}&action=verify-dns`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        const data = await response.json();
        
        if (data.ok) {
            resultDiv.innerHTML = '<i class="fas fa-check-circle"></i> DNS verificado com sucesso! IP corresponde.';
            resultDiv.classList.add('success');
            if (stepInstall) stepInstall.classList.remove('disabled');
            if (btnInstall) btnInstall.disabled = false;
        } else {
            resultDiv.innerHTML = `<i class="fas fa-times-circle"></i> Erro: ${data.message || 'DNS não propagado ou incorreto'}`;
            resultDiv.classList.add('error');
            if (stepInstall) stepInstall.classList.add('disabled');
            if (btnInstall) btnInstall.disabled = true;
        }
    } catch (e) {
        resultDiv.textContent = 'Erro ao conectar API: ' + e.message;
        resultDiv.classList.add('error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-globe"></i> Verificar DNS';
    }
}

async function installSSL() {
    if (!confirm('Tem certeza? A instalação do SSL requer que o DNS esteja apontado corretamente.')) return;

    const btn = document.getElementById('btnInstallSSL');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Instalando... (Isso demora um pouco)';

    try {
        const authToken = localStorage.getItem('authToken');
        const response = await fetch(`/api/sites?id=${currentSiteId}&action=install-ssl`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        const data = await response.json();
        
        if (data.ok) {
            alert('SSL instalado com sucesso!');
            location.reload();
        } else {
            alert('Erro ao instalar SSL: ' + (data.detail || data.error));
        }
    } catch (e) {
        alert('Erro de conexão: ' + e.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-download"></i> Instalar SSL';
    }
}

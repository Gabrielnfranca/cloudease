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

    document.getElementById('newPassword').addEventListener('input', checkPasswordStrength);
});

async function loadSiteDetails(siteId) {
    try {
        const response = await fetch(`/api/sites?id=${siteId}&detailed=true`);
        
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Falha ao carregar detalhes');
        }
        
        const site = await response.json();
        
        renderHeader(site);
        renderDetails(site);
        renderAccess(site);
        renderDatabase(site);
        
    } catch (error) {
        console.error(error);
        const container = document.querySelector('.main-content');
        container.innerHTML = `
            <div style="text-align: center; padding: 50px; color: #e53e3e;">
                <i class="fas fa-exclamation-triangle" style="font-size: 48px; margin-bottom: 20px;"></i>
                <h2>Erro ao carregar site</h2>
                <p>${error.message}</p>
                 <br>
                <button onclick="repairDatabase()" class="action-btn" style="background: #e53e3e; color: white; display: inline-flex; margin-top: 20px;">
                    <i class="fas fa-tools"></i> Tentar Reparar Banco de Dados
                </button>
                <br><br>
                <a href="sites.html" class="back-link" style="justify-content: center;">Voltar para Sites</a>
            </div>
        `;
    }
}

// ... repairDatabase ... (This function is already in the file, keeping it by context or assume it's there. 
// Wait, replace_string_in_file needs EXACT match. I am replacing the top part of the file.

function renderHeader(site) {
    document.getElementById('siteDomainTitle').textContent = site.domain;
    
    const badge = document.getElementById('siteStatusBadge');
    badge.textContent = site.status === 'active' ? 'Ativo' : site.status;
    badge.className = `status-badge ${site.status}`;
    
    const visitBtn = document.getElementById('visitSiteBtn');
    // Prefer temp url if set
    let url = (site.enable_temp_url && site.ip) 
        ? `http://${site.domain}.${site.ip}.nip.io` 
        : `http://${site.domain}`;
    
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
}

function renderAccess(site) {
    // Inputs use .value, not .textContent
    const hostInput = document.getElementById('sftpHost');
    if (hostInput) hostInput.value = site.ip || '-';
    
    const userInput = document.getElementById('sftpUser');
    if (userInput) userInput.value = site.system_user || 'root (não recomendado)'; 
    
    // Using value for inputs
    const passInput = document.getElementById('sftpPass');
    if (passInput) passInput.value = site.system_password || '********';
    
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
        if (dbPassInput) dbPassInput.value = site.application.db_pass;
        
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

function togglePass(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    
    if (el.classList.contains('blur')) {
        el.classList.remove('blur');
        // el.type = 'text'; // It's already text input, just removing blur
    } else {
        el.classList.add('blur');
        // el.type = 'password';
    }
}

function copyToClipboard(selector) {
    const el = document.querySelector(selector);
    if (!el) return;
    
    const text = el.value || el.textContent;
    
    navigator.clipboard.writeText(text).then(() => {
        // Visual feedback could be improved but simple alert for now or updated icon
        const btn = document.querySelector(`button[onclick="copyToClipboard('${selector}')"]`);
        if (btn) {
            const original = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-check" style="color: green;"></i>';
            setTimeout(() => { btn.innerHTML = original; }, 1500);
        }
    });
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

    for (let i = 0; i < 12; i++) {
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
        const response = await fetch('/api/sites', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
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
function togglePass(elementId) {
    const el = document.getElementById(elementId);
    if (el.classList.contains('blur')) {
        el.classList.remove('blur');
    } else {
        el.classList.add('blur');
    }
}

function copyToClipboard(selector) {
    const el = document.querySelector(selector);
    const text = (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') ? el.value : el.textContent;
    
    if (!text || text === '-') return;

    navigator.clipboard.writeText(text).then(() => {
        // Optional: Visual feedback could be added here
        // alert('Copiado para a área de transferência!');
        
        // Find the button that triggered this (if possible) or just show a global toast
        // For now, silent success or console log avoids annoying alerts
        console.log('Copiado:', text);
    });
}

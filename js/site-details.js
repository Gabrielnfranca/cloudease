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

        // Sucesso
        // Não definimos texto simples aqui, deixamos o loadSiteDetails renderizar o HTML rico com o link
        // statusLabel.textContent = enable ? 'Ativado' : 'Desativado'; 
        
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

/* Duplicate togglePass removed as it is already defined correctly above */

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

/* Função duplicada removida para usar a versão com feedback visual implementada acima */

 f u n c t i o n   r e n d e r S S L ( s i t e )   { 
         / /   F i l l   R e f e r e n c e s 
         d o c u m e n t . q u e r y S e l e c t o r A l l ( ' . d o m a i n - r e f ' ) . f o r E a c h ( e l   = >   e l . t e x t C o n t e n t   =   s i t e . d o m a i n ) ; 
         d o c u m e n t . q u e r y S e l e c t o r A l l ( ' . i p - r e f ' ) . f o r E a c h ( e l   = >   e l . t e x t C o n t e n t   =   s i t e . i p ) ; 
 
         / /   I n i t i a l   S t a t u s   C h e c k 
         u p d a t e S S L S t a t u s U R I ( s i t e . s s l _ a c t i v e ) ; 
 } 
 
 f u n c t i o n   u p d a t e S S L S t a t u s U R I ( i s A c t i v e )   { 
         c o n s t   i c o n   =   d o c u m e n t . g e t E l e m e n t B y I d ( ' s s l S t a t u s I c o n ' ) ; 
         c o n s t   t i t l e   =   d o c u m e n t . g e t E l e m e n t B y I d ( ' s s l S t a t u s T i t l e ' ) ; 
         c o n s t   d e s c   =   d o c u m e n t . g e t E l e m e n t B y I d ( ' s s l S t a t u s D e s c ' ) ; 
 
         i c o n . c l a s s N a m e   =   ' s t a t u s - i c o n   '   +   ( i s A c t i v e   ?   ' s e c u r e '   :   ' i n s e c u r e ' ) ; 
         
         i f   ( i s A c t i v e )   { 
                 i c o n . i n n e r H T M L   =   ' < i   c l a s s = \  
 f a s  
 f a - l o c k \ > < / i > ' ; 
                 t i t l e . t e x t C o n t e n t   =   ' S S L   I n s t a l a d o   e   A t i v o ' ; 
                 d e s c . t e x t C o n t e n t   =   ' S e u   s i t e   e s t �   p r o t e g i d o   c o m   H T T P S . ' ; 
                 d o c u m e n t . g e t E l e m e n t B y I d ( ' s t e p I n s t a l l ' ) . c l a s s L i s t . a d d ( ' d i s a b l e d ' ) ; 
                 d o c u m e n t . g e t E l e m e n t B y I d ( ' b t n I n s t a l l S S L ' ) . t e x t C o n t e n t   =   ' R e i n s t a l a r   /   R e n o v a r   F o r � a d o ' ; 
                 d o c u m e n t . g e t E l e m e n t B y I d ( ' b t n I n s t a l l S S L ' ) . d i s a b l e d   =   f a l s e ; 
                 / /   P e r m i t e   r e - v e r i f i c a r   D N S   e   r e i n s t a l a r   s e   q u i s e r 
                 d o c u m e n t . g e t E l e m e n t B y I d ( ' s t e p I n s t a l l ' ) . c l a s s L i s t . r e m o v e ( ' d i s a b l e d ' ) ; 
         }   e l s e   { 
                 i c o n . i n n e r H T M L   =   ' < i   c l a s s = \ f a s  
 f a - u n l o c k \ > < / i > ' ; 
                 t i t l e . t e x t C o n t e n t   =   ' N � o   S e g u r o   /   N � o   I n s t a l a d o ' ; 
                 d e s c . t e x t C o n t e n t   =   ' O   c e r t i f i c a d o   S S L   n � o   e s t �   a t i v o .   V e r i f i q u e   o   D N S   e   i n s t a l e . ' ; 
                 d o c u m e n t . g e t E l e m e n t B y I d ( ' s t e p I n s t a l l ' ) . c l a s s L i s t . a d d ( ' d i s a b l e d ' ) ; 
                 d o c u m e n t . g e t E l e m e n t B y I d ( ' b t n I n s t a l l S S L ' ) . t e x t C o n t e n t   =   ' I n s t a l a r   S S L ' ; 
         } 
 } 
 
 a s y n c   f u n c t i o n   v e r i f y D N S ( )   { 
         c o n s t   b t n   =   d o c u m e n t . q u e r y S e l e c t o r ( ' . b t n - v e r i f y ' ) ; 
         c o n s t   r e s u l t D i v   =   d o c u m e n t . g e t E l e m e n t B y I d ( ' d n s R e s u l t ' ) ; 
         c o n s t   s t e p I n s t a l l   =   d o c u m e n t . g e t E l e m e n t B y I d ( ' s t e p I n s t a l l ' ) ; 
         c o n s t   b t n I n s t a l l   =   d o c u m e n t . g e t E l e m e n t B y I d ( ' b t n I n s t a l l S S L ' ) ; 
         
         b t n . d i s a b l e d   =   t r u e ; 
         b t n . i n n e r H T M L   =   ' < i   c l a s s = \ f a s  
 f a - s p i n n e r  
 f a - s p i n \ > < / i >   V e r i f i c a n d o . . . ' ; 
         r e s u l t D i v . t e x t C o n t e n t   =   ' ' ; 
         r e s u l t D i v . c l a s s N a m e   =   ' v e r i f i c a t i o n - r e s u l t ' ; 
 
         t r y   { 
                 c o n s t   a u t h T o k e n   =   l o c a l S t o r a g e . g e t I t e m ( ' a u t h T o k e n ' ) ; 
                 c o n s t   r e s p o n s e   =   a w a i t   f e t c h ( \ / a p i / s i t e s ? i d = \ & a c t i o n = v e r i f y - d n s \ ,   { 
                         m e t h o d :   ' P O S T ' , 
                         h e a d e r s :   {   ' A u t h o r i z a t i o n ' :   \ B e a r e r   \ \   } 
                 } ) ; 
                 
                 c o n s t   d a t a   =   a w a i t   r e s p o n s e . j s o n ( ) ; 
                 
                 i f   ( d a t a . o k )   { 
                         r e s u l t D i v . t e x t C o n t e n t   =   ' '  D N S   v e r i f i c a d o   c o m   s u c e s s o !   I P   c o r r e s p o n d e . ' ; 
                         r e s u l t D i v . c l a s s L i s t . a d d ( ' s u c c e s s ' ) ; 
                         s t e p I n s t a l l . c l a s s L i s t . r e m o v e ( ' d i s a b l e d ' ) ; 
                         b t n I n s t a l l . d i s a b l e d   =   f a l s e ; 
                 }   e l s e   { 
                         r e s u l t D i v . i n n e r H T M L   =   \ < i   c l a s s = \ f a s  
 f a - t i m e s - c i r c l e \ > < / i >   E r r o :   \ \ ; 
                         r e s u l t D i v . c l a s s L i s t . a d d ( ' e r r o r ' ) ; 
                         s t e p I n s t a l l . c l a s s L i s t . a d d ( ' d i s a b l e d ' ) ; 
                         b t n I n s t a l l . d i s a b l e d   =   t r u e ; 
                 } 
         }   c a t c h   ( e )   { 
                 r e s u l t D i v . t e x t C o n t e n t   =   ' E r r o   a o   c o n e c t a r   A P I :   '   +   e . m e s s a g e ; 
                 r e s u l t D i v . c l a s s L i s t . a d d ( ' e r r o r ' ) ; 
         }   f i n a l l y   { 
                 b t n . d i s a b l e d   =   f a l s e ; 
                 b t n . i n n e r H T M L   =   ' < i   c l a s s = \ f a s  
 f a - g l o b e \ > < / i >   V e r i f i c a r   D N S ' ; 
         } 
 } 
 
 a s y n c   f u n c t i o n   i n s t a l l S S L ( )   { 
         i f   ( ! c o n f i r m ( ' T e m   c e r t e z a ?   A   i n s t a l a � � o   d o   S S L   r e q u e r   q u e   o   D N S   e s t e j a   a p o n t a d o   c o r r e t a m e n t e . ' ) )   r e t u r n ; 
 
         c o n s t   b t n   =   d o c u m e n t . g e t E l e m e n t B y I d ( ' b t n I n s t a l l S S L ' ) ; 
         b t n . d i s a b l e d   =   t r u e ; 
         b t n . i n n e r H T M L   =   ' < i   c l a s s = \ f a s  
 f a - s p i n n e r  
 f a - s p i n \ > < / i >   I n s t a l a n d o . . .   ( I s s o   d e m o r a   u m   p o u c o ) ' ; 
 
         t r y   { 
                 c o n s t   a u t h T o k e n   =   l o c a l S t o r a g e . g e t I t e m ( ' a u t h T o k e n ' ) ; 
                 c o n s t   r e s p o n s e   =   a w a i t   f e t c h ( \ / a p i / s i t e s ? i d = \ & a c t i o n = i n s t a l l - s s l \ ,   { 
                         m e t h o d :   ' P O S T ' , 
                         h e a d e r s :   {   ' A u t h o r i z a t i o n ' :   \ B e a r e r   \ \   } 
                 } ) ; 
                 
                 c o n s t   d a t a   =   a w a i t   r e s p o n s e . j s o n ( ) ; 
                 
                 i f   ( d a t a . o k )   { 
                         a l e r t ( ' S S L   i n s t a l a d o   c o m   s u c e s s o ! ' ) ; 
                         l o c a t i o n . r e l o a d ( ) ; 
                 }   e l s e   { 
                         a l e r t ( ' E r r o   a o   i n s t a l a r   S S L :   '   +   d a t a . d e t a i l ;   d a t a . e r r o r ) ; 
                 } 
         }   c a t c h   ( e )   { 
                 a l e r t ( ' E r r o   d e   c o n e x � o :   '   +   e . m e s s a g e ) ; 
         }   f i n a l l y   { 
                 b t n . d i s a b l e d   =   f a l s e ; 
                 b t n . i n n e r H T M L   =   ' < i   c l a s s = \ f a s  
 f a - d o w n l o a d \ > < / i >   I n s t a l a r   S S L ' ; 
         } 
 } 
  
 
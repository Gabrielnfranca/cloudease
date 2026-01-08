document.addEventListener('DOMContentLoaded', function() {
    // Obter Site ID da URL
    const urlParams = new URLSearchParams(window.location.search);
    const siteId = urlParams.get('id');

    if (!siteId) {
        alert('Site não especificado');
        window.location.href = 'sites.html';
        return;
    }

    loadSiteDetails(siteId);

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

window.repairDatabase = async function() {
    if(!confirm("Isso tentará rodar as migrações pendentes para corrigir tabelas. Continuar?")) return;
    try {
        const btn = document.querySelector('button[onclick="repairDatabase()"]');
        if(btn) {
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Reparando...';
            btn.disabled = true;
        }
        
        const res = await fetch('/api/migrate');
        const data = await res.json();
        
        if (res.ok) {
            alert('Reparo concluído: ' + data.message);
            window.location.reload();
        } else {
            throw new Error(data.error || 'Erro desconhecido');
        }
    } catch(e) {
        alert('Erro ao tentar reparar: ' + e.message);
        const btn = document.querySelector('button[onclick="repairDatabase()"]');
        if(btn) {
            btn.innerHTML = '<i class="fas fa-tools"></i> Tentar Novamente';
            btn.disabled = false;
        }
    }
};

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

function renderDetails(site) {
    document.getElementById('detailDomain').textContent = site.domain;
    document.getElementById('detailIp').textContent = site.ip || 'Não atribuído';
    document.getElementById('detailServerName').textContent = site.server_name || site.server || 'Desconhecido';
    document.getElementById('detailPlatform').textContent = site.platformLabel || site.platform;
    document.getElementById('detailPhp').textContent = site.php_version || 'N/A';
    document.getElementById('detailRootPath').textContent = `/var/www/${site.domain}`;
}

function renderAccess(site) {
    document.getElementById('sftpHost').textContent = site.ip || '-';
    // SFTP usa o system_user gerado no provisionamento (geralmente 'cloudease' ou o user do site)
    // Se não tivermos isso salvo, fallback para generic info
    document.getElementById('sftpUser').textContent = site.system_user || 'root (não recomendado)'; 
    document.getElementById('sftpPass').textContent = site.system_password || 'Mesma senha do servidor';
    
    // Web File Manager Link (Placeholder ou real integration)
    const btn = document.getElementById('webFileManagerBtn');
     // Se tivermos um file manager instalado
    btn.href = `http://${site.ip}:8080/filemanager?root=/var/www/${site.domain}`; 
    // Ou desativar se não tiver
    // btn.style.display = 'none';
}

function renderDatabase(site) {
    // Preencher dados do banco (trazidos da tabela applications)
    if (site.application && site.application.db_name) {
        document.getElementById('dbName').textContent = site.application.db_name;
        document.getElementById('dbUser').textContent = site.application.db_user;
        document.getElementById('dbPass').textContent = site.application.db_pass;
        document.getElementById('dbHost').textContent = site.application.db_host || 'localhost';
    } else {
        document.getElementById('database').innerHTML = '<div class="info-card"><p>Nenhum banco de dados associado a este site.</p></div>';
    }
    
    const pmaBtn = document.getElementById('phpMyAdminBtn');
    if (site.ip) {
        // Assume default PMA path
        pmaBtn.href = `http://${site.ip}/phpmyadmin`;
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
    const text = document.querySelector(selector).textContent;
    navigator.clipboard.writeText(text).then(() => {
        // Show tooltip or toast
        alert('Copiado!'); // Simple feedback for now
    });
}

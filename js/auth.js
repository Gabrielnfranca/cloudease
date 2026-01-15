// auth.js - Script para proteger rotas
document.addEventListener('DOMContentLoaded', function() {
    const token = localStorage.getItem('authToken');
    const publicPages = ['index.html', 'create-user.html', 'forgot-password.html'];
    
    // Obtém o nome do arquivo atual da URL
    const path = window.location.pathname;
    const page = path.split('/').pop() || 'index.html';

    // Se não tiver token e não for página pública, redireciona para login
    if (!token && !publicPages.includes(page)) {
        window.location.href = 'index.html';
        return;
    }

    // Se tiver token e tentar acessar login, redireciona para dashboard
    if (token && (page === 'index.html' || page === '')) {
        window.location.href = 'dashboard.html';
        return;
    }

    // Atualiza informações do usuário na UI se estiver logado
    if (token) {
        const userStr = localStorage.getItem('user');
        if (userStr) {
            const user = JSON.parse(userStr);
            const userNameElements = document.querySelectorAll('.user-name');
            userNameElements.forEach(el => {
                el.textContent = user.name;
            });
        }

        // Configura botão de logout
        const logoutBtn = document.querySelector('.logout');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', function(e) {
                e.preventDefault();
                // Limpeza completa para evitar mistura de dados entre usuários
                localStorage.clear();
                sessionStorage.clear();
                window.location.href = 'index.html';
            });
        }
    }
});
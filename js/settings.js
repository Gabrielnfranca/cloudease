document.addEventListener('DOMContentLoaded', function() {
    // --- Navegação por Abas ---
    const navItems = document.querySelectorAll('.settings-nav-item');
    const sections = document.querySelectorAll('.settings-section');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            // Remove active class from all
            navItems.forEach(nav => nav.classList.remove('active'));
            sections.forEach(section => section.classList.remove('active'));

            // Add active class to clicked
            item.classList.add('active');
            const targetId = item.getAttribute('data-target');
            document.getElementById(targetId).classList.add('active');
        });
    });

    // --- Carregar Dados do Usuário ---
    async function loadUserData() {
        try {
            const authToken = localStorage.getItem('authToken');
            if (!authToken) {
                window.location.href = 'index.html';
                return;
            }

            const response = await fetch('/api/user', {
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            });

            if (response.ok) {
                const user = await response.json();
                document.getElementById('userName').value = user.name;
                document.getElementById('userEmail').value = user.email;
                
                // Atualiza avatar placeholder com iniciais
                const initials = user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
                document.getElementById('userAvatar').src = `https://ui-avatars.com/api/?name=${initials}&background=4f46e5&color=fff`;
            } else {
                console.error('Erro ao carregar usuário');
            }
        } catch (error) {
            console.error('Erro de conexão:', error);
        }
    }

    loadUserData();

    // --- Atualizar Perfil ---
    const profileForm = document.getElementById('profileForm');
    profileForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = profileForm.querySelector('button[type="submit"]');
        const originalText = btn.innerText;
        btn.disabled = true;
        btn.innerText = 'Salvando...';

        const name = document.getElementById('userName').value;
        const email = document.getElementById('userEmail').value;

        try {
            const authToken = localStorage.getItem('authToken');
            const response = await fetch('/api/user', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({ name, email })
            });

            const data = await response.json();

            if (response.ok) {
                alert('Perfil atualizado com sucesso!');
                // Atualiza nome no localStorage e na UI se necessário
                const userStr = localStorage.getItem('user');
                if (userStr) {
                    const user = JSON.parse(userStr);
                    user.name = name;
                    user.email = email;
                    localStorage.setItem('user', JSON.stringify(user));
                }
                // Recarrega para atualizar sidebar, etc
                location.reload(); 
            } else {
                alert('Erro: ' + (data.error || 'Falha ao atualizar'));
            }
        } catch (error) {
            alert('Erro de conexão');
        } finally {
            btn.disabled = false;
            btn.innerText = originalText;
        }
    });

    // --- Atualizar Senha ---
    const passwordForm = document.getElementById('passwordForm');
    passwordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const currentPassword = document.getElementById('currentPassword').value;
        const newPassword = document.getElementById('newPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;

        if (newPassword !== confirmPassword) {
            alert('A nova senha e a confirmação não coincidem.');
            return;
        }

        if (newPassword.length < 6) {
            alert('A nova senha deve ter pelo menos 6 caracteres.');
            return;
        }

        const btn = passwordForm.querySelector('button[type="submit"]');
        const originalText = btn.innerText;
        btn.disabled = true;
        btn.innerText = 'Atualizando...';

        try {
            const authToken = localStorage.getItem('authToken');
            const response = await fetch('/api/user', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({ currentPassword, newPassword })
            });

            const data = await response.json();

            if (response.ok) {
                alert('Senha atualizada com sucesso!');
                passwordForm.reset();
            } else {
                alert('Erro: ' + (data.error || 'Falha ao atualizar senha'));
            }
        } catch (error) {
            alert('Erro de conexão');
        } finally {
            btn.disabled = false;
            btn.innerText = originalText;
        }
    });

    // --- Preferências (Mockup) ---
    const darkModeToggle = document.getElementById('darkModeToggle');
    
    // Carregar estado salvo
    if (localStorage.getItem('darkMode') === 'true') {
        darkModeToggle.checked = true;
        // Aqui aplicaria o tema escuro real se existisse CSS para isso
    }

    darkModeToggle.addEventListener('change', (e) => {
        localStorage.setItem('darkMode', e.target.checked);
        alert('Preferência salva! (O tema escuro será implementado em breve)');
    });
});

document.addEventListener('DOMContentLoaded', function() {
    // Função para copiar texto para a área de transferência
    function copyToClipboard(text, button) {
        navigator.clipboard.writeText(text).then(() => {
            const originalTooltip = button.getAttribute('data-tooltip');
            button.setAttribute('data-tooltip', 'Copiado!');
            button.classList.add('copied');
            
            setTimeout(() => {
                button.setAttribute('data-tooltip', originalTooltip);
                button.classList.remove('copied');
            }, 2000);
        });
    }

    // Função para alternar visibilidade da senha
    function togglePassword(valueElement, button) {
        const isHidden = valueElement.textContent === '••••••••';
        if (isHidden) {
            // Aqui você substituiria por uma chamada à API para obter a senha real
            valueElement.textContent = 'senha123';
            button.querySelector('i').classList.replace('fa-eye', 'fa-eye-slash');
        } else {
            valueElement.textContent = '••••••••';
            button.querySelector('i').classList.replace('fa-eye-slash', 'fa-eye');
        }
    }

    // Adiciona eventos aos botões de copiar
    document.querySelectorAll('.copy-btn[data-tooltip^="Copiar"]').forEach(button => {
        button.addEventListener('click', () => {
            const valueElement = button.closest('.access-item').querySelector('.access-value');
            copyToClipboard(valueElement.textContent, button);
        });
    });

    // Adiciona eventos aos botões de mostrar senha
    document.querySelectorAll('.copy-btn[data-tooltip="Mostrar senha"]').forEach(button => {
        button.addEventListener('click', () => {
            const valueElement = button.closest('.access-item').querySelector('.access-value');
            togglePassword(valueElement, button);
        });
    });

    // Adiciona eventos aos botões de ação
    document.querySelectorAll('.action-btn').forEach(button => {
        button.addEventListener('click', () => {
            const action = button.querySelector('i').className;
            if (action.includes('terminal')) {
                console.log('Abrindo terminal...');
                // Implementar lógica para abrir terminal
            } else if (action.includes('key')) {
                console.log('Baixando chave privada...');
                // Implementar lógica para download
            } else if (action.includes('external-link')) {
                console.log('Abrindo phpMyAdmin...');
                // Implementar lógica para abrir phpMyAdmin
            } else if (action.includes('download')) {
                console.log('Iniciando backup...');
                // Implementar lógica para backup
            }
        });
    });

    // Atualiza os valores de uso em tempo real (simulado)
    function updateUsageValues() {
        document.querySelectorAll('.usage-progress').forEach(progress => {
            const currentWidth = parseInt(progress.style.width);
            const newWidth = Math.max(5, Math.min(95, currentWidth + (Math.random() * 10 - 5)));
            progress.style.width = `${newWidth}%`;
            progress.parentElement.nextElementSibling.textContent = `${Math.round(newWidth)}%`;
        });
    }

    // Atualiza os valores a cada 3 segundos
    setInterval(updateUsageValues, 3000);
});

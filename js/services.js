document.addEventListener('DOMContentLoaded', function() {
    // Função para mostrar notificação de status
    function showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
            ${message}
        `;
        document.body.appendChild(notification);
        
        // Animar entrada
        setTimeout(() => notification.classList.add('show'), 100);
        
        // Remover após 3 segundos
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    // Gerenciar switches de status
    const statusSwitches = document.querySelectorAll('.switch input[type="checkbox"]');
    statusSwitches.forEach(switch_ => {
        switch_.addEventListener('change', function() {
            const row = this.closest('tr');
            const serviceName = row.querySelector('.service-name').textContent.trim();
            const status = this.checked;
            
            // Adicionar classe de transição
            row.classList.add('status-changing');
            
            // Simular chamada de API
            setTimeout(() => {
                row.classList.remove('status-changing');
                showNotification(
                    `Serviço ${serviceName} ${status ? 'ativado' : 'desativado'} com sucesso`,
                    'success'
                );
                
                // Atualizar estado visual dos botões
                const buttons = row.querySelectorAll('.action-btn');
                buttons.forEach(btn => {
                    btn.disabled = !status;
                    btn.style.opacity = status ? '1' : '0.5';
                });
            }, 800);
        });
    });

    // Gerenciar botões de ação
    const actionButtons = document.querySelectorAll('.action-btn');
    actionButtons.forEach(button => {
        button.addEventListener('click', function() {
            if (this.disabled) return;

            const action = this.classList.contains('start') ? 'iniciar' :
                          this.classList.contains('stop') ? 'parar' :
                          'reiniciar';
            
            const row = this.closest('tr');
            const serviceName = row.querySelector('.service-name').textContent.trim();
            
            // Adicionar classe de loading
            button.classList.add('loading');
            button.disabled = true;
            
            // Se for reiniciar, adicionar animação de rotação ao ícone
            if (action === 'reiniciar') {
                const icon = button.querySelector('i');
                icon.style.animation = 'spin 1s linear infinite';
            }
            
            // Simular chamada de API
            setTimeout(() => {
                button.classList.remove('loading');
                button.disabled = false;
                
                if (action === 'reiniciar') {
                    const icon = button.querySelector('i');
                    icon.style.animation = '';
                }
                
                showNotification(
                    `Serviço ${serviceName} ${action === 'iniciar' ? 'iniciado' : 
                                            action === 'parar' ? 'parado' : 
                                            'reiniciado'} com sucesso`,
                    'success'
                );
                
                // Se parar o serviço, desativar o switch
                if (action === 'parar') {
                    const switch_ = row.querySelector('.switch input');
                    switch_.checked = false;
                    switch_.dispatchEvent(new Event('change'));
                }
                
                // Se iniciar o serviço, ativar o switch
                if (action === 'iniciar') {
                    const switch_ = row.querySelector('.switch input');
                    switch_.checked = true;
                    switch_.dispatchEvent(new Event('change'));
                }
            }, 1000);
        });
    });

    // Adicionar estilos dinâmicos
    const style = document.createElement('style');
    style.textContent = `
        @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }
        
        .status-changing {
            background: rgba(33, 150, 243, 0.05);
            transition: background-color 0.3s ease;
        }
        
        .notification {
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            background: white;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            display: flex;
            align-items: center;
            gap: 10px;
            transform: translateX(120%);
            transition: transform 0.3s ease;
            z-index: 1000;
        }
        
        .notification.show {
            transform: translateX(0);
        }
        
        .notification.success {
            border-left: 4px solid #22c55e;
        }
        
        .notification.error {
            border-left: 4px solid #ef4444;
        }
        
        .notification i {
            font-size: 18px;
        }
        
        .notification.success i {
            color: #22c55e;
        }
        
        .notification.error i {
            color: #ef4444;
        }
    `;
    document.head.appendChild(style);
});

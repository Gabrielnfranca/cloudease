document.addEventListener('DOMContentLoaded', function() {
    // Elementos do DOM
    const connectButtons = document.querySelectorAll('.connect-btn');

    // Adicionar evento de clique para cada botão de conexão
    connectButtons.forEach(button => {
        button.addEventListener('click', function(e) {
            const providerCard = e.target.closest('.provider-card');
            const providerName = providerCard.querySelector('h3').textContent;
            
            // Redirecionar para a página de configuração específica do provedor
            // Por enquanto, apenas logamos qual provedor foi selecionado
            console.log(`Provedor selecionado: ${providerName}`);
            
            // Aqui você pode adicionar o redirecionamento para a página de configuração
            // window.location.href = `configure-${providerName.toLowerCase()}.html`;
        });
    });
});

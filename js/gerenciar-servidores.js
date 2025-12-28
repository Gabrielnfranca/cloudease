document.addEventListener('DOMContentLoaded', function() {
    // Seleciona todos os botões e seções
    const buttons = document.querySelectorAll('.header-actions .new-site-btn');
    const sections = document.querySelectorAll('.content-section');

    // Função para mostrar uma seção específica
    function showSection(sectionId) {
        // Se for o botão voltar, retorna à página anterior
        if (sectionId === 'voltar') {
            window.history.back();
            return;
        }

        // Esconde todas as seções
        sections.forEach(section => {
            section.style.display = 'none';
        });

        // Remove a classe active de todos os botões
        buttons.forEach(button => {
            button.classList.remove('active');
        });

        // Mostra a seção selecionada
        const activeSection = document.getElementById(sectionId);
        if (activeSection) {
            activeSection.style.display = 'block';
        }

        // Adiciona a classe active ao botão clicado
        const activeButton = document.querySelector(`[data-section="${sectionId}"]`);
        if (activeButton) {
            activeButton.classList.add('active');
        }
    }

    // Adiciona evento de clique para cada botão
    buttons.forEach(button => {
        button.addEventListener('click', function() {
            const sectionId = this.getAttribute('data-section');
            showSection(sectionId);
        });
    });

    // Mostra a seção de detalhes por padrão
    showSection('detalhes-section');
});

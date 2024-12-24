document.addEventListener('DOMContentLoaded', function() {
    // Seleciona todos os botões e seções
    const buttons = document.querySelectorAll('.header-actions .new-site-btn');
    const sections = document.querySelectorAll('.content-section');

    // Função para mostrar uma seção específica
    function showSection(sectionId) {
        // Esconde todas as seções
        sections.forEach(section => {
            section.style.display = 'none';
        });

        // Mostra a seção selecionada
        const activeSection = document.getElementById(sectionId);
        if (activeSection) {
            activeSection.style.display = 'block';
        }

        // Atualiza o estado ativo dos botões
        buttons.forEach(button => {
            button.classList.remove('active');
            if (button.getAttribute('data-section') === sectionId) {
                button.classList.add('active');
            }
        });
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

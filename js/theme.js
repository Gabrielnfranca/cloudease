document.addEventListener('DOMContentLoaded', () => {
    const themeToggle = document.getElementById('theme-toggle');
    const htmlAuth = document.documentElement;
    const icon = themeToggle ? themeToggle.querySelector('i') : null;

    // Check Local Storage
    const currentTheme = localStorage.getItem('theme') || 'light';
    htmlAuth.setAttribute('data-theme', currentTheme);
    updateIcon(currentTheme);

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            let theme = htmlAuth.getAttribute('data-theme');
            let newTheme = theme === 'light' ? 'dark' : 'light';
            
            htmlAuth.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            updateIcon(newTheme);
        });
    }

    function updateIcon(theme) {
        if (!icon) return;
        if (theme === 'dark') {
            icon.classList.remove('fa-moon');
            icon.classList.add('fa-sun');
        } else {
            icon.classList.remove('fa-sun');
            icon.classList.add('fa-moon');
        }
    }
});

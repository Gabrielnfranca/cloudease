document.addEventListener('DOMContentLoaded', function() {
    const tabs = document.querySelectorAll('.plan-tab');
    const contents = document.querySelectorAll('.plan-content');

    tabs.forEach((tab, index) => {
        tab.addEventListener('click', () => {
            // Remove active class from all tabs and contents
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));

            // Add active class to clicked tab and corresponding content
            tab.classList.add('active');
            contents[index].classList.add('active');
        });
    });
});

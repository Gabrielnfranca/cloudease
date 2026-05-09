document.addEventListener('DOMContentLoaded', function () {
    const provider = document.body.dataset.provider;
    const wrap = document.getElementById('integrationVideoCard');
    const link = document.getElementById('integrationVideoLink');
    const hint = document.getElementById('integrationVideoHint');

    if (!provider || !wrap || !link || !hint) return;

    // Preencha os links quando os videos estiverem prontos.
    const videoLinks = {
        vultr: '',
        digitalocean: '',
        linode: '',
        aws: ''
    };

    const url = videoLinks[provider] || '';

    if (!url) {
        link.removeAttribute('href');
        link.setAttribute('aria-disabled', 'true');
        link.classList.add('disabled');
        hint.textContent = 'Video em breve. Depois e so colar o link no arquivo js/integration-videos.js.';
        return;
    }

    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener';
    hint.textContent = 'Tutorial completo passo a passo.';
});

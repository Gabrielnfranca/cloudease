document.addEventListener('DOMContentLoaded', function() {
    // Dados de exemplo dos servidores
    const servers = [
        {
            provider: 'DigitalOcean',
            name: 'Servidor Web Principal',
            logo: 'assets/images/DigitalOcean_logo2.svg.png',
            cpu: '2 vCPUs',
            ram: '4 GB',
            storage: '80 GB',
            transfer: '4 TB',
            os: 'Ubuntu 22.04 LTS',
            region: 'NYC1 (Nova York)',
            plan: 'Basic',
            ipv4: '123.456.789.0',
            ipv6: '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
            services: {
                nginx: true,
                mysql: true,
                php56: false,
                php70: false,
                php71: false,
                php72: false,
                php73: true,
                redis: true,
                postfix: true
            }
        },
        {
            provider: 'Vultr',
            name: 'Servidor de Desenvolvimento',
            logo: 'assets/images/Logo Vultr.webp',
            cpu: '1 vCPU',
            ram: '2 GB',
            storage: '40 GB',
            transfer: '2 TB',
            os: 'Ubuntu 20.04 LTS',
            region: 'MIA (Miami)',
            plan: 'Starter',
            ipv4: '987.654.321.0',
            ipv6: '2001:0db8:85a3:0000:0000:8a2e:0370:7335',
            services: {
                nginx: true,
                mysql: true,
                php56: true,
                php70: true,
                php71: false,
                php72: false,
                php73: false,
                redis: false,
                postfix: true
            }
        },
        {
            provider: 'Linode',
            name: 'Servidor de Produção',
            logo: 'assets/images/Linode-Logo-Black.svg',
            cpu: '4 vCPUs',
            ram: '8 GB',
            storage: '160 GB',
            transfer: '5 TB',
            os: 'Ubuntu 22.04 LTS',
            region: 'FRA (Frankfurt)',
            plan: 'Professional',
            ipv4: '456.789.123.0',
            ipv6: '2001:0db8:85a3:0000:0000:8a2e:0370:7336',
            services: {
                nginx: true,
                mysql: true,
                php56: false,
                php70: true,
                php71: true,
                php72: true,
                php73: true,
                redis: true,
                postfix: true
            }
        }
    ];

    // Função para selecionar um servidor e redirecionar
    function selectServer(server) {
        // Armazena os dados do servidor selecionado
        localStorage.setItem('selectedServer', JSON.stringify(server));
        // Redireciona para a página de gerenciamento
        window.location.href = 'gerenciar-servidores.html';
    }

    // Adiciona eventos de clique aos cards de servidores
    document.querySelectorAll('.server-card').forEach((card, index) => {
        card.addEventListener('click', () => {
            selectServer(servers[index]);
        });
    });

    // Adiciona eventos de clique aos botões de gerenciar
    document.querySelectorAll('.manage-server-btn').forEach((btn, index) => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); // Evita que o evento de clique do card seja acionado
            selectServer(servers[index]);
        });
    });
});

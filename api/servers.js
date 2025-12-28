export default function handler(req, res) {
    const servers = [
        {
            provider: 'Vultr',
            name: 'Servidor Principal (Via Vercel API)',
            logo: 'https://www.vultr.com/favicon.ico',
            cpu: '2 vCPUs',
            ram: '4 GB',
            storage: '80 GB',
            transfer: '4 TB',
            os: 'Ubuntu 22.04 LTS',
            region: 'NYC1 (Nova York)',
            plan: 'Basic',
            ipv4: '192.168.1.100',
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
            provider: 'DigitalOcean',
            name: 'Servidor de Backup (Via Vercel API)',
            logo: 'https://assets.digitalocean.com/favicon.ico',
            cpu: '1 vCPU',
            ram: '2 GB',
            storage: '40 GB',
            transfer: '2 TB',
            os: 'Ubuntu 20.04 LTS',
            region: 'MIA (Miami)',
            plan: 'Starter',
            ipv4: '192.168.1.101',
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
        }
    ];

    res.status(200).json(servers);
}
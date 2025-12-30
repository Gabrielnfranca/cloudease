import fetch from 'node-fetch';

const PROVIDERS = {
    vultr: {
        name: 'Vultr',
        baseUrl: 'https://api.vultr.com/v2',
        headers: (token) => ({ 'Authorization': `Bearer ${token}` }), // Vultr usa Bearer ou API-Key dependendo da versão, v2 costuma aceitar Bearer ou header especifico. A doc diz "Authorization: Bearer <key>"
        endpoints: {
            validate: '/account', // Endpoint leve para testar
            servers: '/instances'
        },
        mapServer: (server) => {
            console.log('Mapeando servidor Vultr:', JSON.stringify(server));
            return {
                external_id: server.id || 'unknown-' + Math.random(),
                name: server.label || server.os || 'Sem Nome',
                ip_address: server.main_ip || '0.0.0.0',
                status: server.status || 'unknown',
                created_at: server.date_created || new Date(),
                specs: {
                    cpu: (server.vcpu_count || 0) + ' vCPU',
                    ram: (server.ram || 0) + ' MB',
                    storage: (server.disk || 0) + ' GB',
                    os: server.os || 'Unknown'
                }
            };
        }
    },
    digitalocean: {
        name: 'DigitalOcean',
        baseUrl: 'https://api.digitalocean.com/v2',
        headers: (token) => ({ 'Authorization': `Bearer ${token}` }),
        endpoints: {
            validate: '/account',
            servers: '/droplets'
        },
        mapServer: (droplet) => ({
            external_id: String(droplet.id),
            name: droplet.name,
            ip_address: droplet.networks.v4.find(ip => ip.type === 'public')?.ip_address || '-',
            status: droplet.status,
            created_at: droplet.created_at,
            specs: {
                cpu: droplet.vcpus + ' vCPU',
                ram: droplet.memory + ' MB',
                storage: droplet.disk + ' GB',
                os: droplet.image.distribution + ' ' + droplet.image.name
            }
        })
    },
    linode: {
        name: 'Linode',
        baseUrl: 'https://api.linode.com/v4',
        headers: (token) => ({ 'Authorization': `Bearer ${token}` }),
        endpoints: {
            validate: '/profile', // ou /account
            servers: '/linode/instances'
        },
        mapServer: (linode) => ({
            external_id: String(linode.id),
            name: linode.label,
            ip_address: linode.ipv4[0],
            status: linode.status,
            created_at: linode.created,
            specs: {
                cpu: linode.specs.vcpus + ' vCPU',
                ram: linode.specs.memory + ' MB',
                storage: linode.specs.disk + ' GB',
                os: linode.image
            }
        })
    }
};

// Scripts de inicialização (Cloud-Init)
const SSH_PUBLIC_KEY = "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQDFc3P0Zsyk1D9ri2d5Cr2kqiMHMcSWK9Y5hfQcd6JVh8gE6sffp8DSaY1ef7vub8FLoaigYhuGCjrVZ8xZLpJcBQEwaI/VJqPNJ3y6e6Mgq+euLwLjdgLHcXpvPFiRrw1ehzqouB3+opPKLqVb5tQJEgO6WS4+vdLgBquDvV2WgXhODM5VYAT6r+yWF4amueOWB0GTX2kR1VSpBEenK2j2W9qNKGn3PWz75aRZLoAHAml1+BOztefPbgJEdvObyW2EBuDJVvJkuY+MajrSqI0M7gUA6uoQJccTbX4rlDvzspIZZwfHNCvVxRZwtvuyKxBW/D2rz9f6cU0q8qUTtxg13uEe5JhEuaHrGfv8mssZXmCahRbFOgbN4sMXl+1wRzuyLF6lgnMThvjakIoWFoE//tnRCc96pLJgsVt0diEJHirGKSLzGzB+uuzppRzSuSHPpXDw33hJY7fxRtqIprmMXuMbkqA2thitFDH5UsxQMzdmXbrbUqRl4HB2uyxWMSlEAtLLyMoXUNI9ndNkxzbxDlRH6xWArok+kLRLDyIJ14gyVQ6QdaYFzrv9No3UJczQZALuRspQR3ax7azMOV/ZIlELl9y/kcJmEcenejsQDElAsPKyubaQqIYipouC3SF3GCS8YNlqd1jJlKeDZaLLlEYu3mhw3Q9gK9y4YlL3Rw== gabri@DESKTOP-VNRFVI0";

const USER_DATA_SCRIPTS = {
    'base-stack': `#!/bin/bash
# CloudEase Base Stack Installation
# Instala Nginx, MySQL, PHP e dependências para gerenciar sites

export DEBIAN_FRONTEND=noninteractive

# Configura SSH Key
mkdir -p /root/.ssh
echo "${SSH_PUBLIC_KEY}" >> /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys

# Atualiza o sistema
apt-get update && apt-get upgrade -y

# Instala pacotes essenciais
apt-get install -y nginx mysql-server php-fpm php-mysql php-cli php-curl php-gd php-mbstring php-xml php-zip unzip certbot python3-certbot-nginx

# Configura MySQL (Segurança básica)
# Em produção, deve-se gerar uma senha randômica e salvar no banco do CloudEase
mysql -e "ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'root_password_secure';"

# Otimizações básicas do Nginx
sed -i 's/# server_tokens off;/server_tokens off;/' /etc/nginx/nginx.conf
systemctl restart nginx

# Cria diretório para sites
mkdir -p /var/www/html
chown -R www-data:www-data /var/www/html

# Sinaliza que a instalação terminou
touch /root/cloudease_install_complete
`
};

export async function createInstance(providerKey, token, params) {
    const provider = PROVIDERS[providerKey];
    if (!provider) throw new Error('Provedor não suportado');

    const userData = USER_DATA_SCRIPTS[params.app] || '';
    
    // Mapeamento de parâmetros para cada API (Simplificado)
    let body = {};
    let endpoint = '';

    if (providerKey === 'digitalocean') {
        endpoint = '/droplets';
        body = {
            name: params.name,
            region: params.region,
            size: params.plan, // ex: s-1vcpu-1gb
            image: 'ubuntu-22-04-x64',
            user_data: userData
        };
    } else if (providerKey === 'vultr') {
        endpoint = '/instances';
        body = {
            label: params.name,
            region: params.region,
            plan: params.plan,
            os_id: parseInt(params.os_id) || 1743, // Ubuntu 22.04 x64 default
            user_data: Buffer.from(userData).toString('base64')
        };
    }

    try {
        const response = await fetch(`${provider.baseUrl}${endpoint}`, {
            method: 'POST',
            headers: {
                ...provider.headers(token),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Falha ao criar servidor: ${response.status} - ${errorText}`);
        }

        return await response.json();
    } catch (error) {
        console.error(`Erro ao criar servidor na ${providerKey}:`, error);
        throw error;
    }
}

export async function validateToken(providerKey, token) {
    const provider = PROVIDERS[providerKey];
    if (!provider) throw new Error('Provedor não suportado');

    try {
        const response = await fetch(`${provider.baseUrl}${provider.endpoints.validate}`, {
            headers: provider.headers(token)
        });
        return response.ok;
    } catch (error) {
        console.error(`Erro ao validar token ${providerKey}:`, error);
        return false;
    }
}

export async function fetchServers(providerKey, token) {
    const provider = PROVIDERS[providerKey];
    if (!provider) throw new Error('Provedor não suportado');

    try {
        const response = await fetch(`${provider.baseUrl}${provider.endpoints.servers}`, {
            headers: provider.headers(token)
        });

        if (!response.ok) {
            throw new Error(`Falha ao buscar servidores: ${response.statusText}`);
        }

        const data = await response.json();
        
        // Normalização da resposta (cada API retorna a lista em uma propriedade diferente)
        let rawServers = [];
        if (providerKey === 'vultr') rawServers = data.instances;
        else if (providerKey === 'digitalocean') rawServers = data.droplets;
        else if (providerKey === 'linode') rawServers = data.data;

        return rawServers.map(provider.mapServer);
    } catch (error) {
        console.error(`Erro ao buscar servidores ${providerKey}:`, error);
        return [];
    }
}

export async function fetchPlans(providerKey, token) {
    const provider = PROVIDERS[providerKey];
    if (!provider) throw new Error('Provedor não suportado');
    if (providerKey === 'vultr') {
        const res = await fetch(`${provider.baseUrl}/plans`, { headers: provider.headers(token) });
        if (!res.ok) throw new Error('Erro ao buscar planos Vultr');
        const data = await res.json();
        return (data.plans || data.plans || []).map(plan => ({
            id: plan.id,
            description: plan.description,
            cpu: plan.vcpu_count,
            ram: plan.ram,
            disk: plan.disk,
            price: plan.monthly_cost || plan.price_monthly || plan.price_per_month,
            bandwidth: plan.bandwidth,
            locations: plan.locations || []
        }));
    }
    if (providerKey === 'digitalocean') {
        const res = await fetch(`${provider.baseUrl}/sizes`, { headers: provider.headers(token) });
        if (!res.ok) throw new Error('Erro ao buscar planos DigitalOcean');
        const data = await res.json();
        return (data.sizes || []).map(size => ({
            id: size.slug,
            description: `${size.vcpus} vCPU, ${size.memory}MB RAM, ${size.disk}GB`,
            cpu: size.vcpus,
            ram: size.memory,
            disk: size.disk,
            price: size.price_monthly,
            bandwidth: size.transfer
        }));
    }
    if (providerKey === 'linode') {
        const res = await fetch(`${provider.baseUrl}/linode/types`, { headers: provider.headers(token) });
        if (!res.ok) throw new Error('Erro ao buscar planos Linode');
        const data = await res.json();
        return (data.data || []).map(type => ({
            id: type.id,
            description: type.label,
            cpu: type.vcpus,
            ram: type.memory,
            disk: type.disk,
            price: type.price?.monthly,
            bandwidth: type.transfer
        }));
    }
    return [];
}

export async function fetchOS(providerKey, token) {
    const provider = PROVIDERS[providerKey];
    if (!provider) throw new Error('Provedor não suportado');
    
    if (providerKey === 'vultr') {
        const res = await fetch(`${provider.baseUrl}/os`, { headers: provider.headers(token) });
        if (!res.ok) throw new Error('Erro ao buscar OS Vultr');
        const data = await res.json();
        return (data.os || []).map(os => ({
            id: os.id,
            name: os.name,
            family: os.family
        })).filter(os => os.family === 'linux' || os.family === 'ubuntu' || os.family === 'debian' || os.family === 'centos');
    }
    // Implementar outros provedores conforme necessário
    return [
        { id: 'ubuntu-22-04-x64', name: 'Ubuntu 22.04 x64', family: 'ubuntu' },
        { id: 'debian-11-x64', name: 'Debian 11 x64', family: 'debian' }
    ];
}

export async function fetchRegions(providerKey, token) {
    const provider = PROVIDERS[providerKey];
    if (!provider) throw new Error('Provedor não suportado');
    if (providerKey === 'vultr') {
        const res = await fetch(`${provider.baseUrl}/regions`, { headers: provider.headers(token) });
        if (!res.ok) throw new Error('Erro ao buscar regiões Vultr');
        const data = await res.json();
        return (data.regions || []).map(region => ({
            id: region.id,
            name: region.city,
            country: region.country,
            continent: region.continent,
            description: `${region.city}, ${region.country}`
        }));
    }
    if (providerKey === 'digitalocean') {
        const res = await fetch(`${provider.baseUrl}/regions`, { headers: provider.headers(token) });
        if (!res.ok) throw new Error('Erro ao buscar regiões DigitalOcean');
        const data = await res.json();
        return (data.regions || []).map(region => ({
            id: region.slug,
            name: region.name,
            country: region.countries?.[0] || '',
            description: region.name
        }));
    }
    return [];
}

export async function deleteInstance(providerKey, token, externalId) {
    const provider = PROVIDERS[providerKey];
    if (!provider) throw new Error('Provedor não suportado');

    let endpoint = '';
    if (providerKey === 'vultr') {
        endpoint = `/instances/${externalId}`;
    } else if (providerKey === 'digitalocean') {
        endpoint = `/droplets/${externalId}`;
    } else if (providerKey === 'linode') {
        endpoint = `/linode/instances/${externalId}`;
    }

    try {
        const response = await fetch(`${provider.baseUrl}${endpoint}`, {
            method: 'DELETE',
            headers: provider.headers(token)
        });

        if (!response.ok && response.status !== 404) { // 404 means already deleted
            const errorText = await response.text();
            throw new Error(`Falha ao excluir servidor: ${response.status} - ${errorText}`);
        }

        return true;
    } catch (error) {
        console.error(`Erro ao excluir servidor na ${providerKey}:`, error);
        throw error;
    }
}

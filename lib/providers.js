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
        mapServer: (server) => ({
            external_id: server.id,
            name: server.label || server.os,
            ip_address: server.main_ip,
            status: server.status,
            specs: {
                cpu: server.vcpu_count + ' vCPU',
                ram: server.ram + ' MB',
                storage: server.disk + ' GB',
                os: server.os
            }
        })
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
const USER_DATA_SCRIPTS = {
    'base-stack': `#!/bin/bash
# CloudEase Base Stack Installation
# Instala Nginx, MySQL, PHP e dependências para gerenciar sites

export DEBIAN_FRONTEND=noninteractive

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
            os_id: 1743, // Ubuntu 22.04 x64
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
            bandwidth: plan.bandwidth
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
    if (providerKey === 'linode') {
        const res = await fetch(`${provider.baseUrl}/regions`, { headers: provider.headers(token) });
        if (!res.ok) throw new Error('Erro ao buscar regiões Linode');
        const data = await res.json();
        return (data.data || []).map(region => ({
            id: region.id,
            name: region.label,
            country: region.country,
            description: region.label
        }));
    }
    return [];
}

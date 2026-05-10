import fetch from 'node-fetch';

function generateRootPassword(length = 20) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*()-_=+';
    let out = '';
    for (let i = 0; i < length; i += 1) {
        out += chars[Math.floor(Math.random() * chars.length)];
    }
    return out;
}

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
            
            // Lógica aprimorada de status para Vultr
            let status = 'active';
            if (server.status === 'pending' || server.server_status === 'installingbooting' || server.server_status === 'locked') {
                status = 'pending';
            } else if (server.power_status === 'stopped') {
                status = 'stopped';
            } else if (server.status !== 'active') {
                status = server.status; // fallback
            }

            return {
                external_id: server.id || 'unknown-' + Math.random(),
                name: server.label || server.os || 'Sem Nome',
                ip_address: server.main_ip || '0.0.0.0',
                status: status,
                created_at: server.date_created || new Date(),
                specs: {
                    plan: server.plan || server.plan_id || null,
                    plan_id: server.plan || server.plan_id || null,
                    cpu: (server.vcpu_count || 0) + ' vCPU',
                    ram: (server.ram || 0) + ' MB',
                    storage: (server.disk || 0) + ' GB',
                    os: server.os || 'Unknown',
                    region: server.region || 'Unknown'
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
        mapServer: (droplet) => {
            // Mapeamento de status DigitalOcean
            let status = 'active';
            if (droplet.status === 'new' || droplet.status === 'in-progress') {
                status = 'pending';
            } else if (droplet.status === 'off') {
                status = 'stopped';
            } else {
                status = droplet.status;
            }

            return {
                external_id: String(droplet.id),
                name: droplet.name,
                ip_address: droplet.networks.v4.find(ip => ip.type === 'public')?.ip_address || '-',
                status: status,
                created_at: droplet.created_at,
                specs: {
                    plan: droplet.size_slug || droplet.size?.slug || null,
                    size_slug: droplet.size_slug || droplet.size?.slug || null,
                    cpu: droplet.vcpus + ' vCPU',
                    ram: droplet.memory + ' MB',
                    storage: droplet.disk + ' GB',
                    os: droplet.image.distribution + ' ' + droplet.image.name,
                    region: (droplet.region && droplet.region.name) ? droplet.region.name : (droplet.region ? droplet.region.slug : 'Unknown')
                }
            };
        }
    },
    linode: {
        name: 'Linode',
        baseUrl: 'https://api.linode.com/v4',
        headers: (token) => ({ 'Authorization': `Bearer ${token}` }),
        endpoints: {
            validate: '/profile', // ou /account
            servers: '/linode/instances'
        },
        mapServer: (linode) => {
            // Mapeamento de status Linode
            let status = 'active';
            const pendingStates = ['provisioning', 'booting', 'rebooting', 'rebuilding', 'migrating', 'cloning', 'restoring'];
            
            if (pendingStates.includes(linode.status)) {
                status = 'pending';
            } else if (linode.status === 'offline') {
                status = 'stopped';
            } else if (linode.status === 'running') {
                status = 'active';
            } else {
                status = linode.status;
            }

            return {
                external_id: String(linode.id),
                name: linode.label,
                ip_address: linode.ipv4[0],
                status: status,
                created_at: linode.created,
                specs: {
                    plan: linode.type || null,
                    type: linode.type || null,
                    cpu: linode.specs.vcpus + ' vCPU',
                    ram: linode.specs.memory + ' MB',
                    storage: linode.specs.disk + ' GB',
                    os: linode.image,
                    region: linode.region
                }
            };
        }
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
apt-get install -y nginx mysql-server php-fpm php-mysql php-cli php-curl php-gd php-mbstring php-xml php-zip unzip certbot python3-certbot-nginx ufw

# Configura Firewall (UFW)
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

# Configura MySQL (Segurança básica)
# Em produção, deve-se gerar uma senha randômica e salvar no banco do CloudEase
mysql -e "ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'root_password_secure';"

# Cria arquivo de credenciais para o root
echo -e "[client]\nuser=root\npassword=root_password_secure" > /root/.my.cnf

# Otimizações básicas do Nginx
sed -i 's/# server_tokens off;/server_tokens off;/' /etc/nginx/nginx.conf
systemctl restart nginx

# Cria diretório para sites
mkdir -p /var/www/html
chown -R www-data:www-data /var/www/html

# Sinaliza que a instalação terminou
touch /root/cloudease_install_complete
`,
        'n8n-stack': `#!/bin/bash
export DEBIAN_FRONTEND=noninteractive

# Configura SSH key de acesso administrativo
mkdir -p /root/.ssh
echo "${SSH_PUBLIC_KEY}" >> /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys

# Base do sistema
apt-get update && apt-get upgrade -y
apt-get install -y ca-certificates curl gnupg ufw docker.io docker-compose-plugin

systemctl enable docker
systemctl start docker

# Diretórios do n8n
mkdir -p /opt/n8n/data

cat > /opt/n8n/docker-compose.yml <<'YAML'
services:
    n8n:
        image: n8nio/n8n:latest
        container_name: n8n
        restart: unless-stopped
        ports:
            - "5678:5678"
        environment:
            - N8N_BASIC_AUTH_ACTIVE=true
            - N8N_BASIC_AUTH_USER=__N8N_USER__
            - N8N_BASIC_AUTH_PASSWORD=__N8N_PASS__
            - N8N_SECURE_COOKIE=false
            - N8N_HOST=0.0.0.0
            - N8N_PORT=5678
            - GENERIC_TIMEZONE=America/Sao_Paulo
        volumes:
            - /opt/n8n/data:/home/node/.n8n
YAML

docker compose -f /opt/n8n/docker-compose.yml up -d

# Firewall
ufw allow OpenSSH
ufw allow 5678/tcp
ufw --force enable

touch /root/cloudease_n8n_install_complete
`
};

export async function createInstance(providerKey, token, params) {
    const provider = PROVIDERS[providerKey];
    if (!provider) throw new Error('Provedor não suportado');

    let userData = USER_DATA_SCRIPTS[params.app] || '';
    const replacements = {
        '__N8N_USER__': params.n8n_user || 'admin',
        '__N8N_PASS__': params.n8n_pass || generateRootPassword(16)
    };

    for (const key of Object.keys(replacements)) {
        userData = userData.split(key).join(replacements[key]);
    }
    
    // Mapeamento de parâmetros para cada API (Simplificado)
    let body = {};
    let endpoint = '';

    if (providerKey === 'digitalocean') {
        endpoint = '/droplets';
        body = {
            name: params.name,
            region: params.region,
            size: params.plan, // ex: s-1vcpu-1gb
            image: params.os_id || 'ubuntu-22-04-x64',
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
    } else if (providerKey === 'linode') {
        endpoint = '/linode/instances';
        body = {
            label: params.name,
            region: params.region,
            type: params.plan,
            image: params.os_id || 'linode/ubuntu22.04',
            root_pass: generateRootPassword()
        };

        if (userData) {
            body.metadata = {
                user_data: Buffer.from(userData).toString('base64')
            };
        }
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
        
        if (!response.ok) {
            const text = await response.text();
            console.error(`Falha validação Vultr/Provider (${response.status}): ${text}`);
            
            if (response.status === 401) {
                throw new Error('Chave API recusada (401). Verifique: 1) Se copiou a chave inteira. 2) Se o botão "Enable API" está ativado no painel da Vultr. 3) Tente gerar uma nova chave (Refresh Key).');
            }

            throw new Error(`API recusou conexão: ${response.status} - ${text}`);
        }
        
        return true;
    } catch (error) {
        console.error(`Erro ao validar token ${providerKey}:`, error);
        throw error;
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
            const body = await response.text();
            throw new Error(`Falha ao buscar servidores (${providerKey}): ${response.status} ${response.statusText} - ${body}`);
        }

        const data = await response.json();
        
        // Normalização da resposta (cada API retorna a lista em uma propriedade diferente)
        let rawServers = [];
        if (providerKey === 'vultr') rawServers = data.instances;
        else if (providerKey === 'digitalocean') rawServers = data.droplets;
        else if (providerKey === 'linode') rawServers = data.data;

        if (!Array.isArray(rawServers)) {
            throw new Error(`Resposta inesperada ao buscar servidores (${providerKey}).`);
        }

        return rawServers.map(provider.mapServer);
    } catch (error) {
        console.error(`Erro ao buscar servidores ${providerKey}:`, error);
        throw error;
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
    if (providerKey === 'digitalocean') {
        const res = await fetch(`${provider.baseUrl}/images?type=distribution&per_page=200`, { headers: provider.headers(token) });
        if (!res.ok) throw new Error('Erro ao buscar OS DigitalOcean');
        const data = await res.json();

        return (data.images || [])
            .filter((img) => {
                const slug = String(img.slug || '').toLowerCase();
                return slug && (slug.includes('ubuntu') || slug.includes('debian') || slug.includes('rocky') || slug.includes('alma'));
            })
            .map((img) => ({
                id: img.slug,
                name: img.distribution && img.name ? `${img.distribution} ${img.name}` : (img.slug || 'Linux'),
                family: img.distribution || 'linux'
            }));
    }
    if (providerKey === 'linode') {
        const res = await fetch(`${provider.baseUrl}/images`, { headers: provider.headers(token) });
        if (!res.ok) throw new Error('Erro ao buscar OS Linode');
        const data = await res.json();

        return (data.data || [])
            .filter((img) => {
                const id = String(img.id || '').toLowerCase();
                return id.includes('ubuntu') || id.includes('debian') || id.includes('rocky') || id.includes('alma');
            })
            .map((img) => ({
                id: img.id,
                name: img.label || img.id,
                family: img.vendor || 'linux'
            }));
    }

    // Fallback para provedores ainda sem catálogo dedicado.
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
    if (providerKey === 'linode') {
        const res = await fetch(`${provider.baseUrl}/regions`, { headers: provider.headers(token) });
        if (!res.ok) throw new Error('Erro ao buscar regiões Linode');
        const data = await res.json();

        return (data.data || []).map(region => ({
            id: region.id,
            name: region.id,
            country: region.country || '',
            description: region.country ? `${region.id.toUpperCase()} (${region.country})` : region.id.toUpperCase()
        }));
    }
    return [];
}

export async function fetchProviderBilling(providerKey, token) {
    const provider = PROVIDERS[providerKey];
    if (!provider) throw new Error('Provedor não suportado');

    const toNumber = (value) => {
        if (value === null || value === undefined) return null;
        const num = Number(String(value).replace(',', '.'));
        return Number.isFinite(num) ? num : null;
    };

    try {
        if (providerKey === 'vultr') {
            const res = await fetch(`${provider.baseUrl}/account`, { headers: provider.headers(token) });
            if (!res.ok) throw new Error(`Erro billing Vultr (${res.status})`);
            const data = await res.json();
            const account = data?.account || {};

            return {
                pendingUsd: toNumber(account.pending_charges),
                balanceUsd: toNumber(account.balance),
                source: 'vultr_account'
            };
        }

        if (providerKey === 'digitalocean') {
            const res = await fetch(`${provider.baseUrl}/customers/my/balance`, { headers: provider.headers(token) });
            if (!res.ok) throw new Error(`Erro billing DigitalOcean (${res.status})`);
            const data = await res.json();

            return {
                pendingUsd: toNumber(data?.month_to_date_balance),
                balanceUsd: toNumber(data?.account_balance),
                source: 'do_balance'
            };
        }

        if (providerKey === 'linode') {
            const res = await fetch(`${provider.baseUrl}/account`, { headers: provider.headers(token) });
            if (!res.ok) throw new Error(`Erro billing Linode (${res.status})`);
            const data = await res.json();

            return {
                pendingUsd: toNumber(data?.balance_uninvoiced),
                balanceUsd: toNumber(data?.balance),
                source: 'linode_account'
            };
        }

        return {
            pendingUsd: null,
            balanceUsd: null,
            source: 'unsupported'
        };
    } catch (error) {
        throw new Error(`Falha ao buscar billing real de ${providerKey}: ${error.message}`);
    }
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

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

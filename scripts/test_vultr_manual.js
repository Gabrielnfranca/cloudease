import fetch from 'node-fetch';

const PROVIDERS = {
    vultr: {
        baseUrl: 'https://api.vultr.com/v2',
        headers: (token) => ({ 'Authorization': `Bearer ${token}` }),
        endpoints: { validate: '/account' }
    }
};

async function testVultr(token) {
    console.log(`Testando token: '${token}'`);
    const provider = PROVIDERS.vultr;
    try {
        const res = await fetch(`${provider.baseUrl}${provider.endpoints.validate}`, {
            headers: provider.headers(token)
        });
        
        console.log(`Status: ${res.status}`);
        const text = await res.text();
        console.log(`Response: ${text}`);
    } catch (e) {
        console.error('Erro de request:', e);
    }
}

// Test case 1: Empty/Bad token
testVultr('bad-token');

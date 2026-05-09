/**
 * Script para resetar ssl_active = false para sites onde o DNS
 * não aponta para o IP do servidor (SSL foi marcado incorretamente).
 * 
 * Uso: $env:SUPABASE_URL="..."; $env:SUPABASE_ANON_KEY="..."; node --input-type=module < scripts/reset_ssl_status.js
 */
import { createClient } from '@supabase/supabase-js';
import dns from 'dns/promises';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

// Busca todos os sites com ssl_active = true
const { data: sites, error } = await supabase
    .from('sites')
    .select('id, domain, ssl_active, servers_cache (ip_address)')
    .eq('ssl_active', true);

if (error) {
    console.error('Erro ao buscar sites:', error.message);
    process.exit(1);
}

console.log(`Verificando ${sites.length} site(s) com ssl_active = true...\n`);

for (const site of sites) {
    const serverIp = site.servers_cache?.ip_address;
    let dnsOk = false;
    let resolvedIp = null;

    try {
        const addresses = await dns.resolve4(site.domain);
        resolvedIp = addresses[0];
        dnsOk = serverIp && addresses.includes(serverIp);
    } catch (e) {
        resolvedIp = `[ERRO DNS: ${e.code}]`;
    }

    if (!dnsOk) {
        console.log(`❌ ${site.domain} → DNS aponta para ${resolvedIp || 'N/A'}, servidor é ${serverIp || 'N/A'}`);
        console.log(`   → Resetando ssl_active = false...`);

        const { error: updateErr } = await supabase
            .from('sites')
            .update({ ssl_active: false })
            .eq('id', site.id);

        if (updateErr) {
            console.error(`   → FALHA: ${updateErr.message}`);
        } else {
            console.log(`   → OK: ssl_active resetado para false`);
        }
    } else {
        console.log(`✅ ${site.domain} → DNS OK (${resolvedIp} = ${serverIp}), SSL permanece ativo`);
    }
}

console.log('\nConcluído.');

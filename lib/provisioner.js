import { Client } from 'ssh2';
import fs from 'fs';
import path from 'path';

// Função auxiliar para carregar a chave privada
function getPrivateKey() {
    if (process.env.SSH_PRIVATE_KEY) {
        return process.env.SSH_PRIVATE_KEY.replace(/\\n/g, '\n');
    }
    try {
        return fs.readFileSync(path.join(process.cwd(), 'keys', 'cloudease_rsa'));
    } catch (err) {
        throw new Error('Chave SSH não encontrada (ENV ou Arquivo).');
    }
}

/**
 * Instala WordPress via WP-CLI para garantir estado consistente
 */
export async function provisionWordPress(serverIp, domain, wpConfig = null) {
    return new Promise((resolve, reject) => {
        // Gerar credenciais aqui no Node para garantir persistência
        const dbName = domain.replace(/[^a-z0-9]/g, '_').substring(0, 16);
        const dbUser = dbName;
        const dbPass = Math.random().toString(36).slice(-10) + 'X' + Date.now().toString().slice(-4);

        let privateKey;
        try {
            privateKey = getPrivateKey();
        } catch (err) {
            return reject(err);
        }

        // Script robusto com 'set -e' e trap de erro
        let scriptContent = `#!/bin/bash
set -e 

LOG_FILE="/var/log/cloudease/${domain}.log"
mkdir -p /var/log/cloudease
echo "STARTING" > $LOG_FILE

log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" >> $LOG_FILE
}

error_handler() {
    local line=$1
    local cmd=$2
    log "ERROR: Falha na linha $line - Comando: $cmd"
    echo "ERROR:Falha na linha $line ($cmd)" >> $LOG_FILE
}
trap 'error_handler $LINENO "$BASH_COMMAND"' ERR

log "Iniciando provisionamento para ${domain}"

# 0. Garantir Serviço MySQL e Configuração
if [ ! -f /root/.my.cnf ]; then 
    # Tenta descobrir senha (comum em digitalocean/vultr)
    if [ -f /root/.digitalocean_password ]; then
        PASS=$(cat /root/.digitalocean_password)
        echo -e "[client]\nuser=root\npassword=$PASS" > /root/.my.cnf
    else
        # Tenta criar padrão vazio ou socket auth
        echo -e "[client]\nuser=root" > /root/.my.cnf
    fi
    chmod 600 /root/.my.cnf
fi
if command -v systemctl &> /dev/null; then
    systemctl start mysql || systemctl start mariadb || true
fi

# Detectar PHP e Instalar se necessário
if ! command -v php &> /dev/null; then
    export DEBIAN_FRONTEND=noninteractive
    
    # Wait for Apt Lock
    i=0
    while fuser /var/lib/dpkg/lock >/dev/null 2>&1 || fuser /var/lib/apt/lists/lock >/dev/null 2>&1; do
        if [ $i -gt 20 ]; then break; fi
        log "Aguardando apt lock..."
        sleep 2
        i=$((i+1))
    done

    apt-get update -qq && apt-get install -y php-cli php-fpm php-mysql mariadb-client unzip curl || true
fi
PHP_VERSION=$(php -r "echo PHP_MAJOR_VERSION.'.'.PHP_MINOR_VERSION;")
log "PHP Detectado: \${PHP_VERSION}"

# Garantir ferramentas
if ! command -v curl &> /dev/null; then apt-get install -y curl; fi
if ! command -v mysql &> /dev/null; then apt-get install -y mariadb-client || apt-get install -y default-mysql-client; fi

# Instalar WP-CLI se não existir
if ! command -v wp &> /dev/null; then 
    log "Baixando WP-CLI..."
    curl -O https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar
    chmod +x wp-cli.phar 
    mv wp-cli.phar /usr/local/bin/wp
fi

# Criação do Banco de Dados
log "Criando Banco de Dados..."
# Importante: Assume-se que o root do MySQL está configurado em /root/.my.cnf ou sem senha
mysql -e "CREATE DATABASE IF NOT EXISTS ${dbName};"
mysql -e "CREATE USER IF NOT EXISTS '${dbUser}'@'localhost' IDENTIFIED BY '${dbPass}';"
mysql -e "GRANT ALL PRIVILEGES ON ${dbName}.* TO '${dbUser}'@'localhost';"
mysql -e "FLUSH PRIVILEGES;"

# Configuração Nginx
log "Configurando Nginx..."
mkdir -p /var/www/${domain}

cat > /etc/nginx/sites-available/${domain} <<EOF
server {
    listen 80;
    server_name ${domain} www.${domain} ${(wpConfig && wpConfig.enableTempUrl) ? `${domain}.${serverIp}.nip.io` : ''};
    root /var/www/${domain};
    index index.php index.html;

    access_log /var/log/nginx/${domain}.access.log;
    error_log /var/log/nginx/${domain}.error.log;

    location / {
        try_files \\$uri \\$uri/ /index.php?\\$args;
    }

    location ~ \\.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/var/run/php/php$PHP_VERSION-fpm.sock;
    }
}
EOF

ln -sf /etc/nginx/sites-available/${domain} /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# Instalação do WordPress
log "Instalando Core do WordPress em /var/www/${domain}..."
cd /var/www/${domain}

# Download
if [ ! -f wp-load.php ]; then
    wp core download --locale=${wpConfig.lang || 'pt_BR'} --allow-root --force
fi

# Config Generation
if [ ! -f wp-config.php ]; then
    log "Gerando wp-config..."
    wp config create --dbname=${dbName} --dbuser=${dbUser} --dbpass=${dbPass} --allow-root
fi

# Lógica principal de correção: Instalação via CLI
if ! wp core is-installed --allow-root; then
    log "Executando wp core install..."
    wp core install --url="http://${domain}" --title="${wpConfig.title || 'Meu Site'}" --admin_user="${wpConfig.adminUser || 'admin'}" --admin_password="${wpConfig.adminPass}" --admin_email="${wpConfig.adminEmail || 'admin@example.com'}" --allow-root
    
    # Ajustes finais de URL
    wp option update home "http://${domain}" --allow-root
    wp option update siteurl "http://${domain}" --allow-root
    
    # Permalinks
    wp rewrite structure '/%postname%/' --allow-root
    
    log "WordPress instalado e configurado via CLI."
else
    log "WordPress já instalado."
fi

# Permissões
chown -R www-data:www-data /var/www/${domain}
chmod -R 755 /var/www/${domain}

log "DONE"
echo "DONE" >> $LOG_FILE
`;

        const conn = new Client();
        conn.on('ready', () => {
            console.log(`Conectado a ${serverIp}. Enviando script...`);
            
            const scriptBase64 = Buffer.from(scriptContent).toString('base64');
            const scriptPath = `/tmp/install_${domain}.sh`;
            const uploadCmd = `echo "${scriptBase64}" | base64 -d > ${scriptPath}`;
            
            conn.exec(uploadCmd, (err) => {
                if (err) { conn.end(); return reject(err); }
                
                // Executa em background
                conn.exec(`chmod +x ${scriptPath} && nohup bash ${scriptPath} > /dev/null 2>&1 &`, (err) => {
                    conn.end();
                    if (err) return reject(err);
                    
                    // Retorna credenciais para salvar no banco
                    resolve({
                        dbName,
                        dbUser,
                        dbPass,
                        message: 'Provisionamento iniciado'
                    });
                });
            });
        }).on('error', (err) => {
            reject(err);
        }).connect({
            host: serverIp,
            port: 22,
            username: 'root',
            privateKey: privateKey
        });
    });
}

export async function checkProvisionStatus(serverIp, domain) {
    return new Promise((resolve, reject) => {
        const conn = new Client();
        let privateKey;
        try {
            privateKey = getPrivateKey();
        } catch (err) {
            return reject(err);
        }

        conn.on('ready', () => {
            conn.exec(`tail -n 1 /var/log/cloudease/${domain}.log`, (err, stream) => {
                if (err) {
                    conn.end();
                    return reject(err);
                }
                let output = '';
                stream.on('data', (data) => {
                    output += data.toString();
                }).on('close', () => {
                    conn.end();
                    const status = output.trim();
                    if (status.includes('DONE')) {
                        resolve('active');
                    } else if (status.includes('ERROR:')) {
                        // Extrai a mensagem de erro da linha
                        const errorMsg = status.split('ERROR:')[1].trim();
                        resolve('error:' + errorMsg);
                    } else {
                        resolve('provisioning');
                    }
                });
            });
        }).on('error', (err) => {
            console.error('Erro SSH check:', err.message);
            resolve('provisioning'); 
        }).connect({
            host: serverIp,
            port: 22,
            username: 'root',
            privateKey: privateKey,
            readyTimeout: 10000
        });
    });
}

export async function updateNginxConfig(serverIp, domain, enableTempUrl) {
    return new Promise((resolve, reject) => {
        let privateKey;
        try {
            privateKey = getPrivateKey();
        } catch (err) {
            return reject(err);
        }
        
        // Script simples para reload
        const scriptContent = `
        cat > /etc/nginx/sites-available/${domain} <<EOF
server {
    listen 80;
    server_name ${domain} www.${domain} ${enableTempUrl ? `${domain}.${serverIp}.nip.io` : ''};
    root /var/www/${domain};
    index index.php index.html;
    access_log /var/log/nginx/${domain}.access.log;
    error_log /var/log/nginx/${domain}.error.log;
    location / { try_files \\$uri \\$uri/ /index.php?\\$args; }
    location ~ \\.php$ { include snippets/fastcgi-php.conf; fastcgi_pass unix:/var/run/php/php8.1-fpm.sock; }
}
EOF
        nginx -t && systemctl reload nginx
        `;

        const conn = new Client();
        conn.on('ready', () => {
            conn.exec(scriptContent, (err, stream) => {
                conn.end();
                if (err) reject(err); else resolve(true);
            });
        }).connect({
            host: serverIp,
            username: 'root',
            privateKey: privateKey
        });
    });
}

export async function deleteSiteFromInstance(serverIp, domain) {
    return new Promise((resolve, reject) => {
        const conn = new Client();
        const dbName = domain.replace(/[^a-z0-9]/g, '_').substring(0, 16);
        const dbUser = dbName;
        let privateKey;
        try { privateKey = getPrivateKey(); } catch (e) { return reject(e); }

        const commands = [
            `rm -rf /var/www/${domain}`,
            `rm -f /etc/nginx/sites-available/${domain}`,
            `rm -f /etc/nginx/sites-enabled/${domain}`,
            `systemctl reload nginx`,
            `mysql -e "DROP DATABASE IF EXISTS ${dbName};"`,
            `mysql -e "DROP USER IF EXISTS '${dbUser}'@'localhost';"`
        ];
        
        conn.on('ready', () => {
            conn.exec(commands.join('; '), (err, stream) => {
                conn.end();
                if (err) reject(err); else resolve(true);
            });
        }).connect({
            host: serverIp,
            username: 'root',
            privateKey: privateKey
        });
    });
}

export async function discoverSites(serverIp) {
    // Função mantida para compatibilidade, mas o Source of Truth agora é o DB
    // Retorna vazio para impedir que a sync sobrescreva o banco com lixo
    return [];
}

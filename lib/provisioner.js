import { Client } from 'ssh2';
import fs from 'fs';
import path from 'path';

// Função auxiliar para carregar a chave privada
function getPrivateKey() {
    // Tenta ler da variável de ambiente primeiro (para Vercel)
    if (process.env.SSH_PRIVATE_KEY) {
        // Corrige quebras de linha se vierem como string literal "\n"
        return process.env.SSH_PRIVATE_KEY.replace(/\\n/g, '\n');
    }
    // Fallback para arquivo local (dev)
    try {
        return fs.readFileSync(path.join(process.cwd(), 'keys', 'cloudease_rsa'));
    } catch (err) {
        throw new Error('Chave SSH não encontrada (ENV ou Arquivo).');
    }
}

export async function provisionWordPress(serverIp, domain, wpConfig = null) {
    return new Promise((resolve, reject) => {
        const dbName = domain.replace(/[^a-z0-9]/g, '_').substring(0, 16);
        const dbUser = dbName;
        const dbPass = Math.random().toString(36).slice(-10) + '!A1';

        let privateKey;
        try {
            privateKey = getPrivateKey();
        } catch (err) {
            return reject(err);
        }

        // Construir o script shell
        let scriptContent = `#!/bin/bash
LOG_FILE="/var/log/cloudease/${domain}.log"
mkdir -p /var/log/cloudease
echo "STARTING" > $LOG_FILE

# Função de log
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" >> $LOG_FILE
}

# Tratamento de erro
handle_error() {
    log "ERROR: $1"
    echo "ERROR: $1" >> $LOG_FILE
    exit 1
}

log "Iniciando provisionamento para ${domain}"

# 0. Garantir acesso ao MySQL
if [ ! -f /root/.my.cnf ]; then 
    echo -e "[client]\nuser=root\npassword=root_password_secure" > /root/.my.cnf
fi

# Esperar MySQL
for i in {1..30}; do 
    if mysql -e "SELECT 1" &> /dev/null; then break; fi
    sleep 2
done

# 1. Instalar WP-CLI
if ! command -v wp &> /dev/null; then 
    curl -O https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar || handle_error "Falha ao baixar WP-CLI"
    chmod +x wp-cli.phar 
    mv wp-cli.phar /usr/local/bin/wp
fi

# Instalar Redis
${(wpConfig && wpConfig.cache === 'redis') ? `
if ! command -v redis-server &> /dev/null; then 
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    PHP_VER=$(php -r "echo PHP_MAJOR_VERSION.'.'.PHP_MINOR_VERSION;")
    apt-get install -y -qq redis-server php\${PHP_VER}-redis || handle_error "Falha ao instalar Redis"
    systemctl enable redis-server
    systemctl restart redis-server
    systemctl restart php\${PHP_VER}-fpm
fi
` : ''}

# 2. Criar Banco de Dados
log "Criando banco de dados..."
mysql -e "CREATE DATABASE IF NOT EXISTS ${dbName};" || handle_error "Falha ao criar DB"
mysql -e "CREATE USER IF NOT EXISTS '${dbUser}'@'localhost' IDENTIFIED BY '${dbPass}';" || handle_error "Falha ao criar User DB"
mysql -e "GRANT ALL PRIVILEGES ON ${dbName}.* TO '${dbUser}'@'localhost';" || handle_error "Falha ao dar permissões"
mysql -e "FLUSH PRIVILEGES;"

# 3. Configurar Diretório
mkdir -p /var/www/${domain}
chown -R www-data:www-data /var/www/${domain}

# Detectar PHP
PHP_VERSION=$(php -r "echo PHP_MAJOR_VERSION.'.'.PHP_MINOR_VERSION;")

# Garantir extensões PHP (Auto-fix para servidores importados)
if ! php -m | grep -q curl; then
    apt-get update -qq
    apt-get install -y php\${PHP_VERSION}-curl php\${PHP_VERSION}-gd php\${PHP_VERSION}-mbstring php\${PHP_VERSION}-xml php\${PHP_VERSION}-zip php\${PHP_VERSION}-intl
    systemctl restart php\${PHP_VERSION}-fpm
fi

# 4. Configurar Nginx
log "Configurando Nginx..."

${(wpConfig && wpConfig.cache === 'fastcgi') ? `
# Config Cache FastCGI
if [ ! -f /etc/nginx/conf.d/cloudease_fastcgi.conf ]; then
    mkdir -p /var/cache/nginx/cloudease
    chown -R www-data:www-data /var/cache/nginx/cloudease
    echo "fastcgi_cache_path /var/cache/nginx/cloudease levels=1:2 keys_zone=CLOUDEASE_CACHE:100m inactive=60m;" > /etc/nginx/conf.d/cloudease_fastcgi.conf
    echo "fastcgi_cache_key \\"\\$scheme\\$request_method\\$host\\$request_uri\\";" >> /etc/nginx/conf.d/cloudease_fastcgi.conf
fi
` : ''}

rm -f /etc/nginx/sites-enabled/default
rm -f /etc/nginx/sites-available/default
rm -f /etc/nginx/sites-enabled/${domain}

cat > /etc/nginx/sites-available/${domain} <<EOF
server {
    listen 80;
    server_name ${domain} www.${domain} ${(wpConfig && wpConfig.enableTempUrl) ? `${domain}.${serverIp}.nip.io` : ''};
    root /var/www/${domain};
    index index.php index.html;

    access_log /var/log/nginx/${domain}.access.log;
    error_log /var/log/nginx/${domain}.error.log;

    ${(wpConfig && wpConfig.cache === 'fastcgi') ? `
    set \\$skip_cache 0;
    if (\\$request_method = POST) { set \\$skip_cache 1; }
    if (\\$query_string != "") { set \\$skip_cache 1; }
    if (\\$request_uri ~* "/wp-admin/|/xmlrpc.php|wp-.*.php|/feed/|index.php|sitemap(_index)?.xml") { set \\$skip_cache 1; }
    if (\\$http_cookie ~* "comment_author|wordpress_[a-f0-9]+|wp-postpass|wordpress_no_cache|wordpress_logged_in") { set \\$skip_cache 1; }
    ` : ''}

    location / {
        try_files \\$uri \\$uri/ /index.php?\\$args;
    }

    location ~ \\.php$ {
        include snippets/fastcgi-php.conf;
        
        ${(wpConfig && wpConfig.cache === 'fastcgi') ? `
        fastcgi_cache_bypass \\$skip_cache;
        fastcgi_no_cache \\$skip_cache;
        fastcgi_cache CLOUDEASE_CACHE;
        fastcgi_cache_valid 60m;
        add_header X-FastCGI-Cache \\$upstream_cache_status;
        ` : ''}
        
        fastcgi_pass unix:/var/run/php/php$PHP_VERSION-fpm.sock;
    }
}
EOF

ln -sf /etc/nginx/sites-available/${domain} /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx || systemctl restart nginx || handle_error "Falha ao recarregar Nginx"

# Instalação do WordPress
log "Instalando WordPress..."
${wpConfig ? `
# Baixar WP
if [ ! -f /var/www/${domain}/wp-config.php ]; then 
    wp core download --path=/var/www/${domain} --locale=${wpConfig.lang} --allow-root --skip-content --force || handle_error "Falha ao baixar WP"
fi

# Criar Config
if [ ! -f /var/www/${domain}/wp-config.php ]; then 
    wp config create --dbname=${dbName} --dbuser=${dbUser} --dbpass=${dbPass} --path=/var/www/${domain} --allow-root || handle_error "Falha ao criar config WP"
fi

# Instalar WP
if ! wp core is-installed --path=/var/www/${domain} --allow-root; then 
    wp core install --url=${domain} --title="${wpConfig.title}" --admin_user="${wpConfig.adminUser}" --admin_password="${wpConfig.adminPass}" --admin_email="${wpConfig.adminEmail}" --path=/var/www/${domain} --allow-root || handle_error "Falha ao instalar WP"
fi

# Ajustes URL
if ! grep -q "WP_HOME" /var/www/${domain}/wp-config.php; then 
    sed -i "/wp-settings.php/i define( 'WP_HOME', 'http://' . (isset(\\\$_SERVER['HTTP_HOST']) ? \\\$_SERVER['HTTP_HOST'] : '${domain}') );" /var/www/${domain}/wp-config.php
fi
if ! grep -q "WP_SITEURL" /var/www/${domain}/wp-config.php; then 
    sed -i "/wp-settings.php/i define( 'WP_SITEURL', 'http://' . (isset(\\\$_SERVER['HTTP_HOST']) ? \\\$_SERVER['HTTP_HOST'] : '${domain}') );" /var/www/${domain}/wp-config.php
fi

${(wpConfig.cache === 'redis') ? `
wp plugin install redis-cache --activate --path=/var/www/${domain} --allow-root
wp redis enable --path=/var/www/${domain} --allow-root
` : ''}
` : `
# Instalação Manual
cd /var/www/${domain} && curl -O https://wordpress.org/latest.tar.gz && tar -xzf latest.tar.gz --strip-components=1 && rm latest.tar.gz
cp /var/www/${domain}/wp-config-sample.php /var/www/${domain}/wp-config.php
sed -i "s/database_name_here/${dbName}/" /var/www/${domain}/wp-config.php
sed -i "s/username_here/${dbUser}/" /var/www/${domain}/wp-config.php
sed -i "s/password_here/${dbPass}/" /var/www/${domain}/wp-config.php
`}

# Permissões Finais
chown -R www-data:www-data /var/www/${domain}

log "DONE"
echo "DONE" >> $LOG_FILE
`;

        // Conexão SSH para upload e execução
        const conn = new Client();
        conn.on('ready', () => {
            console.log(`Conectado a ${serverIp}. Enviando script de instalação...`);
            
            // Usar Base64 para transferir o script (mais robusto que SFTP para arquivos pequenos)
            const scriptBase64 = Buffer.from(scriptContent).toString('base64');
            const scriptPath = `/tmp/install_${domain}.sh`;
            const uploadCmd = `echo "${scriptBase64}" | base64 -d > ${scriptPath}`;
            
            conn.exec(uploadCmd, (err, stream) => {
                if (err) {
                    conn.end();
                    return reject(err);
                }
                
                stream.on('close', (code, signal) => {
                    if (code !== 0) {
                        conn.end();
                        return reject(new Error('Falha ao fazer upload do script via Base64'));
                    }
                    
                    console.log('Script enviado. Executando em background...');
                    // 2. Executar com nohup
                    conn.exec(`chmod +x ${scriptPath} && nohup bash ${scriptPath} > /dev/null 2>&1 &`, (err) => {
                        // Não esperamos output, desconectamos logo em seguida
                        conn.end();
                        resolve({ success: true, message: 'Provisionamento iniciado em background' });
                    });
                });
            });

        }).on('error', (err) => {
            console.error('Erro SSH:', err);
            reject(err);
        }).connect({
            host: serverIp,
            port: 22,
            username: 'root',
            privateKey: privateKey,
            readyTimeout: 30000
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
            // Ler a última linha do log
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
                    if (status === 'DONE') {
                        resolve('active');
                    } else if (status.startsWith('ERROR:')) {
                        resolve('error:' + status.substring(6));
                    } else {
                        resolve('provisioning');
                    }
                });
            });
        }).on('error', (err) => {
            // Se não conectar, assume que ainda está provisionando ou servidor caiu
            console.error('Erro check status SSH:', err.message);
            resolve('provisioning'); 
        }).connect({
            host: serverIp,
            port: 22,
            username: 'root',
            privateKey: privateKey,
            readyTimeout: 10000 // Timeout curto para check
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

        const scriptContent = `#!/bin/bash
# Detectar PHP
PHP_VERSION=$(php -r "echo PHP_MAJOR_VERSION.'.'.PHP_MINOR_VERSION;")

cat > /etc/nginx/sites-available/${domain} <<EOF
server {
    listen 80;
    server_name ${domain} www.${domain} ${enableTempUrl ? `${domain}.${serverIp}.nip.io` : ''};
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

if [ -f /var/www/${domain}/wp-config.php ]; then
    if ! grep -q "WP_HOME" /var/www/${domain}/wp-config.php; then 
        sed -i "/wp-settings.php/i define( 'WP_HOME', 'http://' . (isset(\\\$_SERVER['HTTP_HOST']) ? \\\$_SERVER['HTTP_HOST'] : '${domain}') );" /var/www/${domain}/wp-config.php
    fi
    if ! grep -q "WP_SITEURL" /var/www/${domain}/wp-config.php; then 
        sed -i "/wp-settings.php/i define( 'WP_SITEURL', 'http://' . (isset(\\\$_SERVER['HTTP_HOST']) ? \\\$_SERVER['HTTP_HOST'] : '${domain}') );" /var/www/${domain}/wp-config.php
    fi
fi

nginx -t && systemctl reload nginx || systemctl restart nginx
`;

        const conn = new Client();
        conn.on('ready', () => {
            conn.exec(scriptContent, (err, stream) => {
                if (err) {
                    conn.end();
                    return reject(err);
                }
                stream.on('close', (code) => {
                    conn.end();
                    if (code === 0) resolve(true);
                    else reject(new Error(`Nginx reload failed with code ${code}`));
                });
            });
        }).on('error', (err) => {
            reject(err);
        }).connect({
            host: serverIp,
            port: 22,
            username: 'root',
            privateKey: privateKey,
            readyTimeout: 30000
        });
    });
}

export async function deleteSiteFromInstance(serverIp, domain) {
    return new Promise((resolve, reject) => {
        const conn = new Client();
        const dbName = domain.replace(/[^a-z0-9]/g, '_').substring(0, 16);
        const dbUser = dbName;

        let privateKey;
        try {
            privateKey = getPrivateKey();
        } catch (err) {
            return reject(err);
        }

        const commands = [
            `rm -rf /var/www/${domain}`,
            `rm -f /etc/nginx/sites-available/${domain}`,
            `rm -f /etc/nginx/sites-enabled/${domain}`,
            `systemctl reload nginx`,
            `mysql -e "DROP DATABASE IF EXISTS ${dbName};"`,
            `mysql -e "DROP USER IF EXISTS '${dbUser}'@'localhost';"`
        ];

        const fullCommand = commands.join(' && ');

        conn.on('ready', () => {
            conn.exec(fullCommand, (err, stream) => {
                if (err) {
                    conn.end();
                    return reject(err);
                }
                stream.on('close', (code) => {
                    conn.end();
                    resolve(true);
                }).on('data', (data) => {
                    // Consumir stdout para evitar travamento
                }).stderr.on('data', (data) => {
                    // Consumir stderr
                });
            });
        }).on('error', (err) => {
            reject(new Error('Falha na conexão SSH: ' + err.message));
        }).connect({
            host: serverIp,
            port: 22,
            username: 'root',
            privateKey: privateKey,
            readyTimeout: 30000
        });
    });
}

export async function discoverSites(serverIp) {
    return new Promise((resolve, reject) => {
        let privateKey;
        try {
            privateKey = getPrivateKey();
        } catch (err) {
            console.warn('Chave SSH não encontrada, pulando descoberta de sites.');
            return resolve(null); 
        }

        const conn = new Client();
        conn.on('ready', () => {
            // Listar arquivos em /etc/nginx/sites-enabled
            conn.exec('ls -1 /etc/nginx/sites-enabled', (err, stream) => {
                if (err) {
                    conn.end();
                    console.error(`Erro ao executar ls no servidor ${serverIp}:`, err);
                    return resolve(null);
                }
                let output = '';
                stream.on('close', (code, signal) => {
                    conn.end();
                    if (code !== 0) {
                        console.error(`Comando ls retornou código ${code} no servidor ${serverIp}`);
                        return resolve(null);
                    }
                    const sites = output.split('\n')
                        .map(s => s.trim())
                        .filter(s => s && s !== 'default' && s !== '00-default');
                    resolve(sites);
                }).on('data', (data) => {
                    output += data;
                });
            });
        }).on('error', (err) => {
            console.error(`Erro SSH ao descobrir sites em ${serverIp}:`, err);
            resolve(null); 
        }).connect({
            host: serverIp,
            port: 22,
            username: 'root',
            privateKey: privateKey,
            readyTimeout: 20000
        });
    });
}

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
    apt-get install -y -qq redis-server php-redis || handle_error "Falha ao instalar Redis"
    systemctl enable redis-server
    systemctl start redis-server
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

# 4. Configurar Nginx
log "Configurando Nginx..."
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
    sed -i "/stop editing/i define( 'WP_HOME', 'http://' . \\$_SERVER['HTTP_HOST'] );" /var/www/${domain}/wp-config.php
fi
if ! grep -q "WP_SITEURL" /var/www/${domain}/wp-config.php; then 
    sed -i "/stop editing/i define( 'WP_SITEURL', 'http://' . \\$_SERVER['HTTP_HOST'] );" /var/www/${domain}/wp-config.php
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
            
            // 1. Salvar script no servidor
            const scriptPath = `/tmp/install_${domain}.sh`;
            
            conn.sftp((err, sftp) => {
                if (err) {
                    conn.end();
                    return reject(err);
                }

                const stream = sftp.createWriteStream(scriptPath);
                stream.write(scriptContent);
                stream.end();

                stream.on('close', () => {
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

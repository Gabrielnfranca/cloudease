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

        const timestamp = Date.now();
        const scriptPath = `/tmp/install_${domain}_${timestamp}.sh`;
        
        // Script robusto com 'set -e' e trap de erro
        let scriptContent = `#!/bin/bash
set -e 

LOG_FILE="/var/log/cloudease/${domain}.log"
mkdir -p /var/log/cloudease
echo "STARTING V2" > $LOG_FILE

log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" >> $LOG_FILE
}

error_handler() {
    local line=$1
    local cmd=$2
    # Sanitiza o comando pegando só a primeira linha e 50 chars
    local short_cmd=$(echo "$cmd" | head -n 1 | cut -c 1-50)
    log "ERROR: Falha na linha $line - Comando: $short_cmd..."
    echo "ERROR:Falha na linha $line ($short_cmd...)" >> $LOG_FILE
}
trap 'error_handler $LINENO "$BASH_COMMAND"' ERR

log "Iniciando provisionamento V2 para ${domain}"

# 0. Garantir Serviço MySQL (Server e Client)
if ! command -v mysql &> /dev/null; then
    log "MySQL não encontrado. Instalando MariaDB Server..."
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    apt-get install -y mariadb-server mariadb-client || apt-get install -y mysql-server mysql-client
    systemctl enable mariadb || systemctl enable mysql
    systemctl start mariadb || systemctl start mysql
fi

# Configuração de auth
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

# 0.5 Verificação e Correção de Acesso MySQL (Auto-Healing)
log "Verificando conexão MySQL..."
set +e # Permite erro temporário no teste
if ! mysql -e "SELECT 1" &> /dev/null; then
    set -e
    log "Falha na conexão MySQL. Tentando recuperação automática (Reset Root Auth)..."
    
    # Para o serviço
    service mysql stop || service mariadb stop || systemctl stop mysql || systemctl stop mariadb || true
    
    # Inicia em modo segurança sem senha
    mkdir -p /var/run/mysqld && chown mysql:mysql /var/run/mysqld || true
    mysqld_safe --skip-grant-tables --skip-networking &
    PID=$!
    
    log "Aguardando database safe mode..."
    sleep 10
    
    # Reseta a senha do root e CRIA USUARIO DE SOCORRO
    # Tenta sintaxe MySQL 5.7+ / MariaDB 10+
    
    # Cria usuário cloudease com permissão total
    mysql -e "FLUSH PRIVILEGES; CREATE USER IF NOT EXISTS 'cloudease'@'localhost' IDENTIFIED BY 'CloudEase2024!'; GRANT ALL PRIVILEGES ON *.* TO 'cloudease'@'localhost' WITH GRANT OPTION; FLUSH PRIVILEGES;" || true
    
    # Tenta também limpar root para socket auth (fallback)
    mysql -e "UPDATE mysql.user SET plugin='unix_socket' WHERE User='root'; FLUSH PRIVILEGES;" || true
    
    # Mata o processo safe e reinicia normal
    kill $PID || true
    sleep 5
    service mysql start || service mariadb start || systemctl start mysql || systemctl start mariadb || true
    
    # Configura .my.cnf para usar o usuario cloudease
    echo -e "[client]\nuser=cloudease\npassword=CloudEase2024!" > /root/.my.cnf
    
    log "Recuperação concluída."
    sleep 5
else
    set -e
fi

# Teste Final
if ! mysql -e "SELECT 1"; then
    log "FATAL: Não foi possível conectar ao MySQL mesmo após recuperação."
    # Tenta mostrar o erro real no log
    mysql -e "SELECT 1" || true
    exit 1
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
# Garantir Nginx
if ! command -v nginx &> /dev/null; then 
    log "Instalando Nginx..."
    apt-get install -y nginx
fi

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
            console.log(`Conectado a ${serverIp}. Enviando script V2...`);
            
            const scriptBase64 = Buffer.from(scriptContent).toString('base64');
            // scriptPath já está definido no escopo da função provisionWordPress, mas precisamos garantir que estamos chamando o arquivo certo no upload
            // Nota: scriptPath é const na linha 28. O upload usa scriptPath.
            // O uploadCmd usa scriptPath.
            
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
            conn.exec(`tail -n 5 /var/log/cloudease/${domain}.log`, (err, stream) => {
                if (err) {
                    conn.end();
                    return reject(err);
                }
                let output = '';
                stream.on('data', (data) => {
                    output += data.toString();
                }).on('close', () => {
                    conn.end();
                    
                    const lines = output.trim().split('\n');
                    let finalStatus = 'provisioning';

                    // Percorre de trás para frente procurando estados definitivos
                    for (let i = lines.length - 1; i >= 0; i--) {
                        const line = lines[i].trim();
                        if (line.includes('DONE')) {
                            finalStatus = 'active';
                            break;
                        }
                        if (line.includes('ERROR:') || line.includes('FATAL:')) {
                            let errorMsg = '';
                            if (line.includes('ERROR:')) {
                                errorMsg = line.split('ERROR:')[1].trim();
                            } else if (line.includes('FATAL:')) {
                                errorMsg = line.split('FATAL:')[1].trim();
                            }
                            finalStatus = 'error:' + errorMsg;
                            break;
                        }
                    }
                    resolve(finalStatus);
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

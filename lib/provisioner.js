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

// Função para gerar senhas fortes e seguras para Shell/DB
function generateStrongPassword(length = 24) {
    // Evitamos aspas simples, duplas e backticks para não quebrar scripts bash inline
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#%^&*_+=[]{}";
    let password = "";
    
    // Garantir complexidade mínima
    password += "ABCDEFGHIJKLMNOPQRSTUVWXYZ".charAt(Math.floor(Math.random() * 26));
    password += "abcdefghijklmnopqrstuvwxyz".charAt(Math.floor(Math.random() * 26));
    password += "0123456789".charAt(Math.floor(Math.random() * 10));
    password += "@#%^&*_+=[]{}".charAt(Math.floor(Math.random() * 12));

    for (let i = 4; i < length; i++) {
        password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    
    return password.split('').sort(() => 0.5 - Math.random()).join('');
}

/**
 * Instala WordPress via WP-CLI para garantir estado consistente
 */
export async function provisionWordPress(serverIp, domain, wpConfig = null) {
    return new Promise((resolve, reject) => {
        // Sanitiza para garantir compatibilidade com user Linux/MySQL
        let safeName = (domain || 'site').replace(/[^a-z0-9]/g, '_');
        if (/^\d/.test(safeName)) safeName = 'u' + safeName;
        const baseName = safeName.substring(0, 16);

        const dbName = wpConfig?.dbName || baseName;
        const dbUser = wpConfig?.dbUser || baseName;
        const dbPass = wpConfig?.dbPass || generateStrongPassword(24);
        
        const sysUser = wpConfig?.sysUser || baseName; 
        const sysPass = wpConfig?.sysPass || generateStrongPassword(24);
        
        const wpUser = wpConfig?.wpAdminUser || 'admin';
        const wpPass = wpConfig?.wpAdminPass || generateStrongPassword(12);
        const wpEmail = wpConfig?.wpAdminEmail || `admin@${domain}`;

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
    
    # Remove config antiga para não interferir
    rm -f /root/.my.cnf
    
    # Para o serviço
    service mysql stop || service mariadb stop || systemctl stop mysql || systemctl stop mariadb || true
    
    # Inicia em modo segurança sem senha
    mkdir -p /var/run/mysqld && chown mysql:mysql /var/run/mysqld || true
    mysqld_safe --skip-grant-tables --skip-networking &
    PID=$!
    
    log "Aguardando database safe mode..."
    
    # Loop de espera ativa para garantir que o MySQL subiu
    MAX_RETRIES=15
    COUNT=0
    MYSQL_READY=0
    while [ $COUNT -lt $MAX_RETRIES ]; do
        sleep 2
        if mysql -e "SELECT 1" &> /dev/null; then
            MYSQL_READY=1
            break
        fi
        log "Aguardando MySQL Safe Mode... ($COUNT)"
        COUNT=$((COUNT+1))
    done

    if [ $MYSQL_READY -eq 0 ]; then
        log "ERRO: mysqld_safe não iniciou corretamente."
        # Tenta mostrar erro
        cat /var/log/mysql/error.log | tail -n 5 || true
        # Nao mata o script ainda, tenta continuar ou falha no proximo comando
    fi
    
    # Reseta a senha do root e CRIA USUARIO DE SOCORRO
    # Importante: mysql no modo safe ignora auth, mas precisamos garantir que o client não tente usar config inexistente
    
    # Cria usuário cloudease com permissão total garantida
    # Primeiro flush para reload nas grant tables
    mysql -e "FLUSH PRIVILEGES;" || log "Aviso: FLUSH PRIVILEGES falhou, mas tentando continuar..."
 
    
    # Tenta criar usuário (MySQL 5.7/8.0/MariaDB compatible)
    mysql -e "CREATE USER IF NOT EXISTS 'cloudease'@'localhost' IDENTIFIED BY 'CloudEase2024!';" || \
    mysql -e "CREATE USER IF NOT EXISTS 'cloudease'@'localhost' IDENTIFIED WITH mysql_native_password BY 'CloudEase2024!';" || true

    # Garante privilégios
    mysql -e "GRANT ALL PRIVILEGES ON *.* TO 'cloudease'@'localhost' WITH GRANT OPTION; FLUSH PRIVILEGES;" || true
    
    # Restaura root apenas como backup (sem senha plugin socket)
    mysql -e "UPDATE mysql.user SET plugin='unix_socket' WHERE User='root'; FLUSH PRIVILEGES;" || true
    
    # Mata o processo safe e reinicia normal
    kill $PID || true
    sleep 5
    service mysql start || service mariadb start || systemctl start mysql || systemctl start mariadb || true
    
    # Agora verifica se conseguimos conectar com o novo usuário ANTES de gravar a config
    if mysql -u cloudease -p'CloudEase2024!' -e "SELECT 1" &> /dev/null; then
        echo -e "[client]\nuser=cloudease\npassword=CloudEase2024!" > /root/.my.cnf
        log "Recuperação concluída com sucesso. Credenciais renovadas."
    else
        log "ERRO: Usuário de recuperação criado mas não autenticou. Tentando root socket..."
        # Se falhar, tenta deixar sem .my.cnf para usar socket auth
        rm -f /root/.my.cnf
    fi
    
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

# Configuração Firewall (UFW)
if command -v ufw &> /dev/null; then
    log "Configurando Firewall..."
    ufw allow 80/tcp
    ufw allow 443/tcp
    ufw allow 22/tcp
    ufw --force enable
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

# Criação de Usuário de Sistema (SFTP/Isolamento)
log "Criando Usuário do Sistema: ${sysUser}..."
if ! id "${sysUser}" &>/dev/null; then
    useradd -m -d /var/www/${domain} -s /bin/bash ${sysUser}
    echo "${sysUser}:${sysPass}" | chpasswd
    # Adicionar ao grupo www-data para que o Nginx/PHP consiga ler/escrever se necessário
    usermod -a -G www-data ${sysUser}
    # E adicionar www-data ao grupo do user
    # usermod -a -G ${sysUser} www-data
else
    log "Usuário ${sysUser} já existe. Atualizando senha..."
    echo "${sysUser}:${sysPass}" | chpasswd
fi

# Ajustar permissões da Home/Root
chown -R ${sysUser}:${sysUser} /var/www/${domain}
chmod 755 /var/www/${domain}

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

# Instalação baseada na Plataforma
PLATFORM="${wpConfig?.platform || 'wordpress'}"
log "Iniciando instalação para plataforma: $PLATFORM"
cd /var/www/${domain}

if [ "$PLATFORM" == "wordpress" ]; then
    # === WORDPRESS INSTALLATION ===
    # Download
    if [ ! -f wp-load.php ]; then
        wp core download --locale=${wpConfig.lang || 'pt_BR'} --allow-root --force
    fi

    # Config Generation
    if [ ! -f wp-config.php ]; then
        log "Gerando wp-config..."
        wp config create --dbname="${dbName}" --dbuser="${dbUser}" --dbpass="${dbPass}" --allow-root --force
    fi

    # Lógica principal de correção: Instalação via CLI
    if ! wp core is-installed --allow-root; then
        log "Executando wp core install..."
        # Usar variáveis de ambiente para evitar problemas de escape na senha
        export WP_ADMIN_PASS='${(wpPass || '').replace(/'/g, "'\\''")}'
        
        wp core install --url="http://${domain}" --title="${wpConfig?.wpTitle || 'Meu Site'}" --admin_user="${wpUser}" --admin_password="$WP_ADMIN_PASS" --admin_email="${wpEmail}" --allow-root
        
        # Configuração Dinâmica de URL (Permite acesso via IP/Temp URL)
        log "Aplicando correção de URL dinâmica no wp-config.php..."
        
        # Adiciona código para detectar host dinamicamente
        # Inserir antes do "That's all, stop editing"
        sed -i "/stop editing/i \\
if (isset(\\\$_SERVER['HTTP_HOST'])) { \\
    \\\$proto = (isset(\\\$_SERVER['HTTPS']) && \\\$_SERVER['HTTPS'] === 'on') ? 'https://' : 'http://'; \\
    define('WP_SITEURL', \\\$proto . \\\$_SERVER['HTTP_HOST']); \\
    define('WP_HOME', \\\$proto . \\\$_SERVER['HTTP_HOST']); \\
}" wp-config.php

        # Permalinks
        wp rewrite structure '/%postname%/' --allow-root
        
        log "WordPress instalado e configurado via CLI."
    else
        log "WordPress já instalado."
    fi

else
    # === OTHER PLATFORMS (PHP / PHP-MYSQL / HTML) ===
    log "Configurando página padrão para $PLATFORM..."
    
    # Limpeza de arquivos residuais
    rm -f index.nginx-debian.html
    rm -f favicon.ico
    rm -f license.txt readme.html wp-config.php # Caso haja resquícios de WP antigo
    
    # Cria index personalizado com Logo da CloudEase
    cat > index.php <<'HTMLEOF'
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Site Criado | CloudEase</title>
    <!-- Favicon CloudEase (Nuvem Azul) -->
    <link rel="icon" href="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1MTIgNTEyIj48cGF0aCBmaWxsPSIjM2I4MmY2IiBkPSJNMTIzLjY 3OTEuM2MxMi45LTkuNCAyOS42LTExLjggNDQuNi02LjRjMjYuNSA5LjYgNTYuMiAxNS4xIDg3LjggMTUuMWMxMjQuNyAwIDIwOC04MC41IDIwOC0xNjBzLTgzLjMtMTYwLTIwOC0xNjBTNDggMTYwLjUgNDggMjQwYzAgMzIgMTIuNCA2Mi44IDM1LjcgODkuMmM4LjYgOS43IDEyLjggMjIuNSAxMS44IDM1LjVjLTEuNCAxOC4xLTUuNyAzNC43LTExLjMgNDkuNGMxNy03LjkgMzEuMS0xNi42IDQxLjgtMjIuN3oiLz48L3N2Zz4=">
    
    <style>
        body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; color: #334155; display: flex; align-items: center; justify-content: center; height: 100vh; }
        .container { background: white; padding: 48px; border-radius: 16px; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05); text-align: center; max-width: 480px; width: 90%; }
        .logo-circle { width: 96px; height: 96px; background: #eff6ff; color: #3b82f6; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 40px; margin: 0 auto 24px; }
        h1 { margin: 0 0 12px; font-size: 24px; font-weight: 700; color: #0f172a; }
        p { margin: 0 0 32px; line-height: 1.6; color: #64748b; font-size: 16px; }
        .info-box { background: #f1f5f9; padding: 16px; border-radius: 8px; margin-bottom: 24px; text-align: left; font-size: 14px; }
        .info-row { display: flex; justify-content: space-between; margin-bottom: 8px; }
        .info-row:last-child { margin-bottom: 0; }
        .label { font-weight: 600; color: #475569; }
        .value { font-family: monospace; color: #334155; }
        .upload-hint { font-size: 13px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 16px; }
    </style>
    <!-- FontAwesome -->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
</head>
<body>
    <div class="container">
        <div class="logo-circle">
            <i class="fas fa-cloud"></i>
        </div>
        <h1>Site Pronto!</h1>
        <p>Este ambiente foi provisionado com sucesso pela <strong>CloudEase</strong> e está pronto para receber seus arquivos.</p>
        
        <div class="info-box">
            <div class="info-row">
                <span class="label">Domínio:</span>
                <span class="value"><?php echo $_SERVER['HTTP_HOST']; ?></span>
            </div>
            <div class="info-row">
                <span class="label">PHP:</span>
                <span class="value"><?php echo phpversion(); ?></span>
            </div>
            <div class="info-row">
                <span class="label">Caminho:</span>
                <span class="value"><?php echo getcwd(); ?></span>
            </div>
        </div>

        <div class="upload-hint">
            <i class="fas fa-info-circle"></i> Substitua este arquivo (index.php) pelos arquivos do seu projeto via SFTP.
        </div>
    </div>
</body>
</html>
HTMLEOF

    # Se for puramente HTML, renomeia para index.html (embora o index.php execute normal)
    if [ "$PLATFORM" == "html" ]; then
        mv index.php index.html
    fi

fi

# Permissões Finais (Garantir que owner seja o sysUser, mas grupo www-data tenha acesso se php-fpm rodar como www-data)
chown -R ${sysUser}:www-data /var/www/${domain}
chmod -R 775 /var/www/${domain}
find /var/www/${domain} -type d -exec chmod g+s {} \\;

# Retorna credenciais para o Node salvar
echo "CREDENTIALS_JSON_START"
echo '{"dbName": "${dbName}", "dbUser": "${dbUser}", "dbPass": "${dbPass}", "sysUser": "${sysUser}", "sysPass": "${sysPass}"}'
echo "CREDENTIALS_JSON_END"

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
                
                // Executa script em BACKGROUND (Fire and Forget)
                // Usamos nohup e disown para garantir que o processo continue após desconexão
                // Redirecionamos output para /dev/null pois o log é feito em arquivo
                const runCmd = `chmod +x ${scriptPath} && nohup bash ${scriptPath} > /dev/null 2>&1 & disown`;
                
                conn.exec(runCmd, (err, stream) => {
                    if (err) { conn.end(); return reject(err); }
                    
                    stream.on('close', (code, signal) => {
                        conn.end();
                        // Assumimos sucesso no INÍCIO do processo
                        // As credenciais já foram geradas no Node.js
                        resolve({
                            dbName,
                            dbUser,
                            dbPass,
                            sysUser,
                            sysPass,
                            message: 'Provisionamento iniciado em background'
                        });
                    }).on('data', () => {}).stderr.on('data', () => {});
                });
            });
        }).on('error', (err) => {
            reject(err);
        }).connect({
            host: serverIp,
            port: 22,
            username: 'root',
            privateKey: privateKey,
            readyTimeout: 60000,
            keepaliveInterval: 10000
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
            readyTimeout: 30000,
            keepaliveInterval: 10000
        });
    });
}

export async function updateNginxConfig(serverIp, domain, enableTempUrl, phpVersion) {
    return new Promise((resolve, reject) => {
        let privateKey;
        try {
            privateKey = getPrivateKey();
        } catch (err) {
            return reject(err);
        }

        // Tenta extrair a versão numérica (ex: "PHP 8.2" -> "8.2") para fallback
        let ver = "8.2"; 
        if (phpVersion) {
             const transform = phpVersion.replace(/[^0-9.]/g, '');
             if (transform) ver = transform;
        }
        
        // Script simples para reload
        // Detecta dinamicamente qual socket FPM está rodando
        const scriptContent = `
        PHP_SOCKET=$(find /var/run/php/ -name "php*-fpm.sock" | head -n 1)
        if [ -z "$PHP_SOCKET" ]; then
            PHP_SOCKET="/var/run/php/php${ver}-fpm.sock"
        fi

        cat > /etc/nginx/sites-available/${domain} <<EOF
server {
    listen 80;
    server_name ${domain} www.${domain} ${enableTempUrl ? `${domain}.${serverIp}.nip.io` : ''};
    root /var/www/${domain};
    index index.php index.html;
    access_log /var/log/nginx/${domain}.access.log;
    error_log /var/log/nginx/${domain}.error.log;
    location / { try_files \\$uri \\$uri/ /index.php?\\$args; }
    location ~ \\.php$ { include snippets/fastcgi-php.conf; fastcgi_pass unix:$PHP_SOCKET; }
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
            readyTimeout: 30000,
            privateKey: privateKey
        });
    });
}

export async function deleteSiteFromInstance(serverIp, domain, dbConfig = {}) {
    return new Promise((resolve, reject) => {
        const conn = new Client();
        // Usa config passada ou gera credenciais legado (fallback)
        const dbName = dbConfig.dbName || domain.replace(/[^a-z0-9]/g, '_').substring(0, 16);
        const dbUser = dbConfig.dbUser || dbName;
        
        let privateKey;
        try { privateKey = getPrivateKey(); } catch (e) { return reject(e); }

        // Script de limpeza
        const scriptContent = `
            rm -rf /var/www/${domain}
            rm -f /etc/nginx/sites-available/${domain}
            rm -f /etc/nginx/sites-enabled/${domain}
            systemctl reload nginx || true
            mysql -e "DROP DATABASE IF EXISTS ${dbName};" || true
            mysql -e "DROP USER IF EXISTS '${dbUser}'@'localhost';" || true
            # Limpa logs também
            rm -f /var/log/cloudease/${domain}.log
        `;

        conn.on('ready', () => {
            conn.exec(scriptContent, (err, stream) => {
                if (err) {
                    conn.end();
                    return reject(err);
                }
                stream.on('close', (code, signal) => {
                    conn.end();
                    console.log(`Site ${domain} removido de ${serverIp}. Code: ${code}`);
                    resolve(true);
                }).on('data', (data) => {
                    // stdout
                }).stderr.on('data', (data) => {
                   console.error('Delete STDERR:', data.toString());
                });
            });
        }).on('error', (err) => {
            console.error('Erro de conexão SSH ao deletar:', err);
            reject(err);
        }).connect({
            host: serverIp,
            username: 'root',
            privateKey: privateKey,
            readyTimeout: 20000
        });
    });
}

export async function discoverSites(serverIp) {
    return new Promise((resolve, reject) => {
        let privateKey;
        try {
            privateKey = getPrivateKey();
        } catch (err) {
            console.error('Discover Sites Error: No Key');
            // Retorna array vazio em vez de erro para não bloquear o sync
            return resolve([]);
        }

        const conn = new Client();
        conn.on('ready', () => {
            // Lista diretórios em /var/www
            conn.exec('ls -1 /var/www', (err, stream) => {
                if (err) {
                    conn.end();
                    console.error('Discover Sites Error: ls failed', err);
                    return resolve([]);
                }
                let output = '';
                stream.on('data', (data) => {
                    output += data.toString();
                }).on('close', () => {
                    conn.end();
                    const sites = output.split('\n')
                        .map(s => s.trim())
                        .filter(s => s && s !== 'html' && s.includes('.'));
                    resolve(sites);
                });
            });
        }).on('error', (err) => {
            console.error('Discover Sites Connect Error:', err.message);
            resolve([]);
        }).connect({
            host: serverIp,
            port: 22,
            username: 'root',
            privateKey: privateKey,
            readyTimeout: 30000,
            keepaliveInterval: 10000
        });
    });
}

/**
 * Atualiza senha via SSH (SFTP/System ou Database)
 */
export async function updateSitePassword(serverIp, type, user, newPassword) {
    return new Promise((resolve, reject) => {
        let cmd = '';
        if (type === 'sftp') {
            // Update System User Password
            // secure echo via stdin
            cmd = `echo "${user}:${newPassword}" | chpasswd`;
        } else if (type === 'db') {
            // Update MySQL User Password
            // Using 'mysql' command as root (implied by ~/.my.cnf setup)
            cmd = `mysql -e "ALTER USER '${user}'@'localhost' IDENTIFIED BY '${newPassword}'; FLUSH PRIVILEGES;"`;
        } else {
            return reject(new Error('Tipo de senha inválido'));
        }

        const conn = new Client();
        conn.on('ready', () => {
            conn.exec(cmd, (err, stream) => {
                if (err) {
                    conn.end();
                    return reject(err);
                }
                let stderr = '';
                stream.on('data', (data) => {}).stderr.on('data', (data) => {
                    stderr += data;
                }).on('close', (code) => {
                    conn.end();
                    if (code !== 0) {
                        return reject(new Error(`Erro ao alterar senha: ${stderr}`));
                    }
                    resolve(true);
                });
            });
        }).on('error', (err) => {
            reject(err);
        }).connect({
            host: serverIp,
            port: 22,
            username: 'root',
            readyTimeout: 30000,
            keepaliveInterval: 10000,
            privateKey: getPrivateKey()
        });
    });
}

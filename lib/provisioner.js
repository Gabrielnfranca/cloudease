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

function buildTempHost(domain, serverIp) {
    const normalized = (domain || 'site').toLowerCase();
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
        hash = ((hash * 31) + normalized.charCodeAt(i)) >>> 0;
    }
    const alias = hash.toString(36);
    return `ce-${alias}.${serverIp}.nip.io`;
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
        // MUDANÇA: Usar diretório home do usuário root ao invés de /tmp para evitar bloquios 'noexec'
        const scriptPath = `/root/install_${domain}_${timestamp}.sh`;
        const tempHost = (wpConfig && wpConfig.enableTempUrl) ? buildTempHost(domain, serverIp) : '';
        
        // Script robusto com 'set -e' e trap de erro
        let scriptContent = `#!/bin/bash
set -e 

LOG_FILE="/var/log/cloudease/${domain}.log"
mkdir -p /var/log/cloudease
touch "$LOG_FILE" || true
chmod 666 "$LOG_FILE" || true

echo "STARTING V2" > "$LOG_FILE"

log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" >> "$LOG_FILE"
}

error_handler() {
    local line=$1
    local cmd=$2
    # Sanitiza o comando pegando só a primeira linha e 50 chars
    local short_cmd=$(echo "$cmd" | head -n 1 | cut -c 1-50)
    echo "$(date '+%Y-%m-%d %H:%M:%S') - ERROR: Falha na linha $line - Comando: $short_cmd..." >> "$LOG_FILE"
    echo "ERROR:Falha na linha $line ($short_cmd...)" >> "$LOG_FILE"
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

# Ajuste Limites PHP (Upload) para suportar temas/plugins grandes
log "Ajustando limites do PHP (Upload/Memory)..."
sed -i "s/upload_max_filesize = .*/upload_max_filesize = 1024M/" /etc/php/\$PHP_VERSION/fpm/php.ini
sed -i "s/post_max_size = .*/post_max_size = 1024M/" /etc/php/\$PHP_VERSION/fpm/php.ini
sed -i "s/memory_limit = .*/memory_limit = 512M/" /etc/php/\$PHP_VERSION/fpm/php.ini
sed -i "s/max_execution_time = .*/max_execution_time = 600/" /etc/php/\$PHP_VERSION/fpm/php.ini
sed -i "s/max_input_time = .*/max_input_time = 600/" /etc/php/\$PHP_VERSION/fpm/php.ini
sed -i "s/display_errors = .*/display_errors = Off/" /etc/php/\$PHP_VERSION/fpm/php.ini
systemctl restart php\$PHP_VERSION-fpm

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

# SSH Configuration (Fix Access Denied for SFTP)
log "Configurando SSH para permitir senha..."
sed -i 's/^PasswordAuthentication no/PasswordAuthentication yes/g' /etc/ssh/sshd_config
sed -i 's/^#PasswordAuthentication yes/PasswordAuthentication yes/g' /etc/ssh/sshd_config
# Check auxiliary configs (Cloud-Init often disables here)
if [ -d /etc/ssh/sshd_config.d ]; then
    sed -i 's/^PasswordAuthentication no/PasswordAuthentication yes/g' /etc/ssh/sshd_config.d/*.conf 2>/dev/null || true
fi
# Restart SSH
service ssh restart || systemctl restart ssh || service sshd restart || systemctl restart sshd || true


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
mkdir -p /var/www/${domain}/logs

# Define permissões iniciais para logs (www-data precisa escrever)
chown -R www-data:www-data /var/www/${domain}/logs
chmod 775 /var/www/${domain}/logs

# Criação de Usuário de Sistema (SFTP/Isolamento)
log "Criando Usuário do Sistema: ${sysUser}..."
if ! id "${sysUser}" &>/dev/null; then
    useradd -m -d /var/www/${domain} -s /bin/bash ${sysUser}
    echo "${sysUser}:${sysPass}" | chpasswd
    # Adicionar ao grupo www-data para que o Nginx/PHP consiga ler/escrever se necessário
    usermod -a -G www-data ${sysUser}
else
    log "Usuário ${sysUser} já existe. Atualizando senha..."
    echo "${sysUser}:${sysPass}" | chpasswd
fi

# Ajustar permissões da Home/Root (Mantendo logs acessíveis)
chown -R ${sysUser}:${sysUser} /var/www/${domain}
# Devolve propriedade dos logs para www-data (mas sysUser pode ler pois está no grupo www-data ou others)
chown -R www-data:www-data /var/www/${domain}/logs
# Garante que sysUser tenha acesso total na pasta raiz E logs (via grupo)
usermod -a -G www-data ${sysUser}
chown -R ${sysUser}:www-data /var/www/${domain}
chmod 775 /var/www/${domain}
chmod 775 /var/www/${domain}/logs

cat > /etc/nginx/sites-available/${domain} <<EOF
server {
    listen 80;
    server_name ${domain} www.${domain} ${tempHost};
    root /var/www/${domain};
    index index.html index.htm index.php;

    # Limite de Upload Aumentado (1GB)
    client_max_body_size 1024M;

    # Logs direcionados para a pasta do usuário
    access_log /var/www/${domain}/logs/access.log;
    error_log /var/www/${domain}/logs/error.log;
    location = /phpmyadmin { return 301 /phpmyadmin/; }
    location = /adminer.php { return 302 /phpmyadmin/; }

    location / {
        try_files \\$uri \\$uri/ /index.php?\\$args;
    }

    location ~ \\.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/var/run/php/php$PHP_VERSION-fpm.sock;
        
        # Timeouts aumentados para imports grandes
        fastcgi_read_timeout 900; 
        fastcgi_send_timeout 900;
        fastcgi_connect_timeout 900;
    }
}
EOF

ln -sf /etc/nginx/sites-available/${domain} /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# Instalação baseada na Plataforma
PLATFORM="${wpConfig?.platform || 'php'}"
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
    
    # Pre-configure FS_METHOD to avoid issues
    if ! grep -q "FS_METHOD" wp-config.php; then
        sed -i "/stop editing/i define('FS_METHOD', 'direct');" wp-config.php
    fi

    # Lógica principal de correção: Instalação via CLI
    if ! wp core is-installed --allow-root; then
        log "Executando wp core install..."
        # Usar variáveis de ambiente para evitar problemas de escape na senha
        export WP_ADMIN_PASS='${(wpPass || '').replace(/'/g, "'\\''")}'
        
        wp core install --url="http://${domain}" --title="${wpConfig?.wpTitle || 'Meu Site'}" --admin_user="${wpUser}" --admin_password="$WP_ADMIN_PASS" --admin_email="${wpEmail}" --allow-root
        
        # Configuração Dinâmica de URL (Permite acesso via IP/Temp URL)
        log "Aplicando correção de URL dinâmica no wp-config.php..."
        
        # Garantir limpeza de constantes conflitantes antes de inserir dinâmico
        # Remove qualquer linha que defina WP_SITEURL ou WP_HOME (agressivo para evitar duplicatas)
        sed -i "/define.*WP_SITEURL/d" wp-config.php
        sed -i "/define.*WP_HOME/d" wp-config.php
        
        # Adiciona código para detectar host dinamicamente (SOMENTE SE NAO EXISTIR)
        # Inserir antes do "That's all, stop editing"
        if ! grep -q "HTTP_HOST" wp-config.php; then
            sed -i "/stop editing/i \\
if (isset(\\\$_SERVER['HTTP_HOST'])) { \\
    \\\$proto = (isset(\\\$_SERVER['HTTPS']) && \\\$_SERVER['HTTPS'] === 'on') ? 'https://' : 'http://'; \\
    define('WP_SITEURL', \\\$proto . \\\$_SERVER['HTTP_HOST']); \\
    define('WP_HOME', \\\$proto . \\\$_SERVER['HTTP_HOST']); \\
}" wp-config.php
        fi

        # Permalinks
        wp rewrite structure '/%postname%/' --allow-root
        
        log "WordPress instalado e configurado via CLI."
    else
        log "WordPress já instalado."
    fi

else
    # === OTHER PLATFORMS (PHP / PHP-MYSQL / HTML) ===
    log "Configurando página padrão para $PLATFORM..."
    
    # Limpeza COMPLETA de WordPress (arquivos e diretórios)
    log "Removendo arquivos WordPress pré-existentes..."
    rm -rf wp-admin wp-includes wp-content
    rm -f index.php wp-login.php wp-load.php wp-cron.php wp-signup.php
    rm -f wp-activate.php wp-blog-header.php wp-comments-post.php wp-links-opml.php
    rm -f wp-mail.php wp-settings.php wp-trackback.php xmlrpc.php
    rm -f wp-config.php wp-config-sample.php
    rm -f license.txt readme.html favicon.ico index.nginx-debian.html
    
    # Cria index personalizado com Logo da CloudEase
    cat > index.php <<'HTMLEOF'
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ambiente Pronto | CloudEase</title>
    <link rel="icon" href="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1MTIgNTEyIj48cGF0aCBmaWxsPSIjMGE2Y2ZkIiBkPSJNMzEwLjcgOTEuN2MtNy44LTI4LjQtMjcuOS01Mi4zLTU1LjItNjUuN0MyMjguMSAxMi42IDE5Ny41IDkuNCAxNzEuNCAxOC4yYy0yNiA4LjgtNDYuNSAyOS40LTUzLjQgNTUuNEM1Ni4xIDgxLjQgOCAxMzQuNCA4IDE5OWMwIDcxLjkgNTguMSAxMzAgMTMwIDEzMGgzMzZjNDQuMiAwIDgwLTM1LjggODAtODBDNTU0IDEwMC43IDQ3MS4zIDIuNCAzNjYuMSA0LjJjLTI0LjggLjQtNDcuNyA3LjItNjUuNCAxNy41eiIvPjwvc3ZnPg==">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
    <style>
        :root {
            --bg-1: #f4f8ff;
            --bg-2: #eaf4ff;
            --card: #ffffff;
            --title: #0f172a;
            --text: #475569;
            --line: #e2e8f0;
            --brand: #0a6cfd;
            --brand-soft: #e8f1ff;
            --ok: #0f9d58;
        }
        * { box-sizing: border-box; }
        body {
            margin: 0;
            min-height: 100vh;
            font-family: 'Sora', sans-serif;
            color: var(--text);
            background:
                radial-gradient(circle at 12% 18%, rgba(10,108,253,0.10), transparent 34%),
                radial-gradient(circle at 84% 82%, rgba(15,157,88,0.08), transparent 28%),
                linear-gradient(160deg, var(--bg-1), var(--bg-2));
            display: grid;
            place-items: center;
            padding: 24px;
        }
        .card {
            width: min(760px, 100%);
            background: var(--card);
            border-radius: 24px;
            padding: clamp(24px, 4vw, 42px);
            box-shadow: 0 16px 45px rgba(30, 64, 175, 0.15);
            border: 1px solid #dbeafe;
        }
        .header {
            display: flex;
            align-items: center;
            gap: 18px;
            margin-bottom: 16px;
        }
        .logo {
            width: 124px;
            height: 124px;
            border-radius: 50%;
            background: linear-gradient(145deg, #0a6cfd, #0052cc);
            color: #fff;
            display: grid;
            place-items: center;
            font-size: 56px;
            box-shadow: 0 18px 35px rgba(10,108,253,0.4);
            flex-shrink: 0;
        }
        .title-wrap h1 {
            margin: 0;
            font-size: clamp(28px, 4vw, 40px);
            line-height: 1.08;
            color: var(--title);
            letter-spacing: -0.02em;
        }
        .subtitle {
            margin: 10px 0 0;
            font-size: clamp(14px, 2.1vw, 17px);
            line-height: 1.6;
        }
        .status {
            margin: 18px 0 24px;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            background: #ecfdf3;
            border: 1px solid #d1fae5;
            color: var(--ok);
            padding: 8px 14px;
            border-radius: 999px;
            font-size: 13px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: .04em;
        }
        .meta {
            background: #f8fafc;
            border: 1px solid var(--line);
            border-radius: 16px;
            padding: 16px;
            margin-bottom: 18px;
        }
        .row {
            display: grid;
            grid-template-columns: 120px 1fr;
            gap: 12px;
            padding: 10px 0;
            border-bottom: 1px dashed #dbe4ef;
            align-items: start;
        }
        .row:last-child { border-bottom: 0; }
        .label {
            color: #1e293b;
            font-size: 12px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: .05em;
        }
        .value {
            font-family: 'IBM Plex Mono', monospace;
            color: #0f172a;
            font-size: 13.5px;
            word-break: break-word;
        }
        .hint {
            border-top: 1px solid var(--line);
            margin-top: 8px;
            padding-top: 16px;
            font-size: 13px;
            line-height: 1.55;
        }
        .actions {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
            margin-top: 14px;
        }
        .btn-db {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            background: #0a6cfd;
            color: #fff;
            border: 1px solid #0a6cfd;
            padding: 10px 14px;
            border-radius: 10px;
            font-size: 13px;
            font-weight: 700;
            text-decoration: none;
            transition: all .2s ease;
        }
        .btn-db:hover {
            background: #0859cf;
            border-color: #0859cf;
        }
        .hint strong { color: var(--title); }
        @media (max-width: 620px) {
            .header { flex-direction: column; align-items: flex-start; }
            .logo { width: 98px; height: 98px; font-size: 44px; }
            .row { grid-template-columns: 1fr; gap: 6px; }
        }
    </style>
</head>
<body>
    <main class="card">
        <section class="header">
            <div class="logo" aria-hidden="true"><i class="fas fa-cloud"></i></div>
            <div class="title-wrap">
                <h1>Ambiente em Produ&ccedil;&atilde;o</h1>
                <p class="subtitle">Seu servidor foi provisionado com sucesso pela <strong>CloudEase</strong>. Voc&ecirc; j&aacute; pode subir os arquivos finais do projeto.</p>
            </div>
        </section>

        <div class="status"><i class="fas fa-circle-check"></i> Provisionamento conclu&iacute;do</div>

        <section class="meta">
            <div class="row">
                <span class="label">Site</span>
                <span class="value">${domain}</span>
            </div>
            <div class="row">
                <span class="label">Dom&iacute;nio</span>
                <span class="value"><?php echo $_SERVER['HTTP_HOST']; ?></span>
            </div>
            <div class="row">
                <span class="label">PHP</span>
                <span class="value"><?php echo phpversion(); ?></span>
            </div>
            <div class="row">
                <span class="label">Root Path</span>
                <span class="value"><?php echo getcwd(); ?></span>
            </div>
        </section>

        <section class="hint">
            <i class="fas fa-upload"></i>
            <strong>Pr&oacute;ximo passo:</strong> envie os arquivos do site via SFTP para substituir este arquivo <strong>index.php</strong>.
            Assim que um <strong>index.html</strong> existir, ele ser&aacute; exibido automaticamente.
            <div class="actions">
                <a class="btn-db" href="/filemanager.php" target="_blank" rel="noopener">
                    <i class="fas fa-folder-open"></i> Gerenciador Web de Arquivos
                </a>
                <a class="btn-db" href="/phpmyadmin" target="_blank" rel="noopener">
                    <i class="fas fa-database"></i> Acessar Banco via Web
                </a>
            </div>
        </section>
    </main>
</body>
</html>
HTMLEOF

    # Instala phpMyAdmin para acesso web ao banco com os usuarios criados no projeto
    if [ ! -d phpmyadmin ]; then
        log "Instalando phpMyAdmin..."
        PMA_VERSION="5.2.1"
        rm -rf /tmp/phpmyadmin_install /tmp/phpmyadmin.tar.gz
        mkdir -p /tmp/phpmyadmin_install
        curl -fsSL -o /tmp/phpmyadmin.tar.gz "https://files.phpmyadmin.net/phpMyAdmin/${PMA_VERSION}/phpMyAdmin-${PMA_VERSION}-all-languages.tar.gz" || \
        wget -q -O /tmp/phpmyadmin.tar.gz "https://files.phpmyadmin.net/phpMyAdmin/${PMA_VERSION}/phpMyAdmin-${PMA_VERSION}-all-languages.tar.gz"
        tar -xzf /tmp/phpmyadmin.tar.gz -C /tmp/phpmyadmin_install
        mv /tmp/phpmyadmin_install/phpMyAdmin-${PMA_VERSION}-all-languages phpmyadmin
        cp phpmyadmin/config.sample.inc.php phpmyadmin/config.inc.php
        PMA_SECRET=$(openssl rand -hex 16)
        sed -i "s/\$cfg\['blowfish_secret'\] = '';/\$cfg['blowfish_secret'] = '${PMA_SECRET}';/" phpmyadmin/config.inc.php
        echo "\$cfg['TempDir'] = '/tmp';" >> phpmyadmin/config.inc.php
        rm -rf /tmp/phpmyadmin_install /tmp/phpmyadmin.tar.gz
    fi

    # Compatibilidade: remove Adminer antigo para evitar confusão de interface
    rm -f adminer.php

    # Gerenciador de Arquivos Web (autenticado com as credenciais SFTP do site)
    cat > filemanager.php <<'FMEOF'
<?php
if (PHP_VERSION_ID >= 70300) {
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'httponly' => true,
        'samesite' => 'Lax'
    ]);
}
session_start();

$SYS_USER = '${sysUser}';
$SYS_PASS = '${sysPass}';
$DB_USER = '${dbUser}';
$DB_PASS = '${dbPass}';
$ROOT = '/var/www/${domain}';

function esc($v) { return htmlspecialchars((string)$v, ENT_QUOTES, 'UTF-8'); }
function valid_auth($u, $p, $sysUser, $sysPass, $dbUser, $dbPass) {
    if ($u === '' || $p === '') return false;
    $okSys = hash_equals((string)$sysUser, (string)$u) && hash_equals((string)$sysPass, (string)$p);
    $okDb = hash_equals((string)$dbUser, (string)$u) && hash_equals((string)$dbPass, (string)$p);
    return $okSys || $okDb;
}

if (($_GET['fresh'] ?? '') === '1') {
    $_SESSION = [];
    session_destroy();
    session_start();
}

$SESSION_TTL = 1800;
if (!empty($_SESSION['fm_auth']) && !empty($_SESSION['fm_last_activity'])) {
    if ((time() - (int)$_SESSION['fm_last_activity']) > $SESSION_TTL) {
        $_SESSION = [];
        session_destroy();
        session_start();
    }
}

if (isset($_GET['logout'])) {
    session_destroy();
    header('Location: filemanager.php');
    exit;
}

if (empty($_SESSION['fm_auth'])) {
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $u = $_POST['user'] ?? '';
        $p = $_POST['pass'] ?? '';
        if (valid_auth($u, $p, $SYS_USER, $SYS_PASS, $DB_USER, $DB_PASS)) {
            $_SESSION['fm_auth'] = 1;
            $_SESSION['fm_last_activity'] = time();
            header('Location: filemanager.php');
            exit;
        }
        $error = 'Credenciais invalidas';
    }
    ?>
        <!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
        <title>Login - Gerenciador de Arquivos</title>
        <style>
            :root{--bg:#eef2f7;--card:#ffffff;--text:#0f172a;--muted:#64748b;--line:#dbe4ef;--brand:#0f6cbd;--brand2:#0b5ba1;--danger:#b91c1c}
            *{box-sizing:border-box}
            body{margin:0;min-height:100vh;font-family:Segoe UI,Arial,sans-serif;background:radial-gradient(circle at 15% 15%,#f8fafc 0%,#eef2f7 50%,#e2e8f0 100%);display:grid;place-items:center;padding:20px}
            .card{width:min(92vw,420px);background:var(--card);border:1px solid var(--line);border-radius:16px;padding:26px;box-shadow:0 12px 30px rgba(15,23,42,.08)}
            .brand-row{display:flex;align-items:center;gap:10px;margin-bottom:8px}
            .brand-logo{width:28px;height:28px;display:block}
            .brand-name{font-size:14px;color:#334155;font-weight:700;letter-spacing:.02em}
            .title{margin:0 0 8px;font-size:24px;color:var(--text)}
            .desc{margin:0 0 18px;color:var(--muted);font-size:14px}
            .field{margin:0 0 12px}
            label{display:block;font-size:13px;color:#334155;margin-bottom:6px;font-weight:600}
            input{width:100%;padding:12px 13px;border:1px solid var(--line);border-radius:10px;font-size:15px;outline:none;transition:border-color .2s, box-shadow .2s;background:#fff}
            input:focus{border-color:#93c5fd;box-shadow:0 0 0 3px rgba(59,130,246,.15)}
            button{width:100%;padding:12px 14px;border:none;border-radius:10px;background:linear-gradient(180deg,var(--brand),var(--brand2));color:#fff;font-size:15px;font-weight:700;cursor:pointer}
            button:hover{filter:brightness(1.03)}
            .err{margin:0 0 12px;color:var(--danger);font-size:13px;font-weight:600}
            .foot{margin-top:14px;color:var(--muted);font-size:12px}
        </style></head><body>
        <form class="card" method="post" autocomplete="off">
            <div class="brand-row">
                <img class="brand-logo" alt="CloudEase" src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1MTIgNTEyIj48cGF0aCBmaWxsPSIjMGE2Y2ZkIiBkPSJNMzEwLjcgOTEuN2MtNy44LTI4LjQtMjcuOS01Mi4zLTU1LjItNjUuN0MyMjguMSAxMi42IDE5Ny41IDkuNCAxNzEuNCAxOC4yYy0yNiA4LjgtNDYuNSAyOS40LTUzLjQgNTUuNEM1Ni4xIDgxLjQgOCAxMzQuNCA4IDE5OWMwIDcxLjkgNTguMSAxMzAgMTMwIDEzMGgzMzZjNDQuMiAwIDgwLTM1LjggODAtODBDNTU0IDEwMC43IDQ3MS4zIDIuNCAzNjYuMSA0LjJjLTI0LjggLjQtNDcuNyA3LjItNjUuNCAxNy41eiIvPjwvc3ZnPg==">
                <span class="brand-name">CloudEase</span>
            </div>
            <h1 class="title">Gerenciador de Arquivos</h1>
            <p class="desc">Acesso protegido. Entre com as credenciais SFTP/SSH ou do banco do site.</p>
            <?php if(!empty($error)) echo '<p class="err">'.esc($error).'</p>'; ?>
            <div class="field"><label for="user">Usuario</label><input id="user" name="user" placeholder="Digite seu usuario" required></div>
            <div class="field"><label for="pass">Senha</label><input id="pass" name="pass" type="password" placeholder="Digite sua senha" required></div>
            <button type="submit">Entrar</button>
            <p class="foot">CloudEase File Manager</p>
        </form>
    </body></html>
    <?php
    exit;
}

$_SESSION['fm_last_activity'] = time();

$path = $_GET['path'] ?? '';
$view = (($_GET['view'] ?? 'grid') === 'list') ? 'list' : 'grid';
$sort = $_GET['sort'] ?? 'name';
if (!in_array($sort, ['name', 'type', 'size', 'date'], true)) $sort = 'name';
$order = (($_GET['order'] ?? 'asc') === 'desc') ? 'desc' : 'asc';
$nextOrder = $order === 'asc' ? 'desc' : 'asc';
$siteName = '${domain}';
$base = realpath($ROOT);
$current = realpath($base . '/' . ltrim($path, '/')) ?: $base;
if (strpos($current, $base) !== 0 || !is_dir($current)) $current = $base;

$relCurrent = trim(str_replace($base, '', $current), '/');

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_FILES['upload'])) {
    $name = basename($_FILES['upload']['name'] ?? '');
    if ($name) @move_uploaded_file($_FILES['upload']['tmp_name'], $current . '/' . $name);
    header('Location: filemanager.php?path=' . urlencode($relCurrent) . '&view=' . urlencode($view) . '&sort=' . urlencode($sort) . '&order=' . urlencode($order));
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['rename_from'], $_POST['rename_to'])) {
    $fromName = basename((string)$_POST['rename_from']);
    $toName = basename(trim((string)$_POST['rename_to']));
    if ($fromName !== '' && $toName !== '' && $fromName !== $toName) {
        $fromPath = $current . '/' . $fromName;
        $toPath = $current . '/' . $toName;
        if (file_exists($fromPath)) {
            @rename($fromPath, $toPath);
        }
    }
    header('Location: filemanager.php?path=' . urlencode($relCurrent) . '&view=' . urlencode($view) . '&sort=' . urlencode($sort) . '&order=' . urlencode($order));
    exit;
}

if (isset($_GET['delete'])) {
    $target = realpath($current . '/' . basename((string)$_GET['delete']));
    if ($target && strpos($target, $base) === 0) {
        if (is_dir($target)) @rmdir($target); else @unlink($target);
    }
    header('Location: filemanager.php?path=' . urlencode($relCurrent) . '&view=' . urlencode($view) . '&sort=' . urlencode($sort) . '&order=' . urlencode($order));
    exit;
}

$rel = trim(str_replace($base, '', $current), '/');
$items = @scandir($current) ?: [];
$treeItems = @scandir($base) ?: [];
$visibleItems = array_values(array_filter($items, fn($i) => $i !== '.' && $i !== '..'));

usort($visibleItems, function ($a, $b) use ($current, $sort, $order) {
    $aPath = $current . '/' . $a;
    $bPath = $current . '/' . $b;
    $aIsDir = is_dir($aPath);
    $bIsDir = is_dir($bPath);

    switch ($sort) {
        case 'type':
            $cmp = ($aIsDir <=> $bIsDir);
            break;
        case 'size':
            $aSize = $aIsDir ? 0 : (@filesize($aPath) ?: 0);
            $bSize = $bIsDir ? 0 : (@filesize($bPath) ?: 0);
            $cmp = ($aSize <=> $bSize);
            break;
        case 'date':
            $aTime = @filemtime($aPath) ?: 0;
            $bTime = @filemtime($bPath) ?: 0;
            $cmp = ($aTime <=> $bTime);
            break;
        default:
            $cmp = strcasecmp($a, $b);
            break;
    }

    return $order === 'desc' ? -$cmp : $cmp;
});
?>
<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Gerenciador de Arquivos</title><link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'><path fill='%230a6cfd' d='M310.7 91.7c-7.8-28.4-27.9-52.3-55.2-65.7C228.1 12.6 197.5 9.4 171.4 18.2c-26 8.8-46.5 29.4-53.4 55.4C56.1 81.4 8 134.4 8 199c0 71.9 58.1 130 130 130h336c44.2 0 80-35.8 80-80C554 100.7 471.3 2.4 366.1 4.2c-24.8 .4-47.7 7.2-65.4 17.5z'/></svg>">
<style>
    :root{--bg:#eef2f7;--card:#fff;--line:#dbe4ef;--text:#0f172a;--muted:#64748b;--brand:#0f6cbd;--brand2:#0b5ba1}
    *{box-sizing:border-box}
    body{margin:0;background:var(--bg);font-family:Segoe UI,Arial,sans-serif;color:var(--text)}
    .topbar{height:42px;background:linear-gradient(180deg,var(--brand),var(--brand2));color:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 14px;font-size:13px}
    .topbar .actions{display:flex;gap:10px;align-items:center}
    .topbar .actions a{color:#fff;text-decoration:none;opacity:.95}
    .breadcrumb-bar{background:#fff;border-bottom:1px solid var(--line);padding:12px 36px;display:flex;align-items:center;gap:10px;font-size:13px;min-height:40px}
    .breadcrumb-back{color:#0f6cbd;text-decoration:none;font-size:18px;font-weight:bold;padding:2px 6px;display:inline-flex;align-items:center;justify-content:center;hover:opacity:.7;transition:opacity .2s}
    .breadcrumb-path{display:flex;align-items:center;gap:4px;flex-wrap:wrap}
    .breadcrumb-item{color:#0f6cbd;text-decoration:none;padding:2px 6px;border-radius:5px;transition:background .2s}
    .breadcrumb-item:hover{background:#eaf3ff}
    .breadcrumb-sep{color:#d1d5db;margin:0 2px}
    .shell{display:grid;grid-template-columns:1fr;min-height:calc(100vh - 74px)}
    .main{padding:36px}
    .toolbar{display:flex;gap:14px;flex-wrap:wrap;align-items:center;justify-content:space-between;background:#fff;border:1px solid var(--line);padding:14px;border-radius:10px;margin-bottom:16px}
    .toolbar-left,.toolbar-right{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
    .btn{background:linear-gradient(180deg,var(--brand),var(--brand2));color:#fff;padding:8px 12px;border-radius:8px;text-decoration:none;border:0;cursor:pointer;font-weight:600}
    .btn.gray{background:#fff;color:#374151;border:1px solid #d1d5db}
    .view-switch{display:inline-flex;border:1px solid #d1d5db;border-radius:9px;overflow:hidden;background:#fff}
    .icon-btn{width:38px;height:36px;display:inline-flex;align-items:center;justify-content:center;color:#4b5563;text-decoration:none;border-right:1px solid #e5e7eb}
    .icon-btn:last-child{border-right:none}
    .icon-btn:hover{background:#f9fafb}
    .icon-btn.active{background:#eaf3ff;color:#0f6cbd}
    .icon-btn svg{width:18px;height:18px;display:block}
    .grid{margin-top:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:14px}
    .card{background:#fff;border:1px solid var(--line);border-radius:10px;padding:12px;min-height:92px;display:flex;flex-direction:column;justify-content:space-between}
    .card.folder-card{cursor:pointer}
    .icon{font-size:24px;line-height:1}
    .name{font-size:13px;word-break:break-word}
    .name a{text-decoration:none;color:#374151;font-weight:600}
    .meta{font-size:11px;color:var(--muted)}
    .danger{color:#b91c1c;text-decoration:none;font-size:11px;font-weight:600}
    .action-row{display:flex;gap:10px;margin-top:6px}
    .link-btn{font-size:11px;text-decoration:none;color:#374151}
    .list{margin-top:10px;background:#fff;border:1px solid var(--line);border-radius:10px;overflow:hidden}
    .list-header,.list-row{display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:8px;align-items:center;padding:10px 12px}
    .list-header{background:#f9fafb;color:#6b7280;font-size:12px;font-weight:700}
    .list-row{border-top:1px solid #eef2f7;font-size:13px}
    .sort-link{color:#6b7280;text-decoration:none;display:inline-flex;align-items:center;gap:6px}
    .sort-link:hover{color:#374151}
    .sort-link.active{color:#111827}
    .sort-arrow{font-size:11px;line-height:1}
    .sort-controls{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    .sort-label{font-size:12px;color:#6b7280;font-weight:600}
    .sort-pill{display:inline-flex;align-items:center;gap:5px;padding:6px 9px;border:1px solid #d1d5db;border-radius:8px;background:#fff;color:#4b5563;text-decoration:none;font-size:12px}
    .sort-pill:hover{background:#f9fafb;color:#374151}
    .sort-pill.active{background:#eaf3ff;color:#0f6cbd;border-color:#bfdbfe}
    .mono{font-family:Consolas,monospace;font-size:12px;color:#6b7280}
    .empty{padding:20px;background:#fff;border:1px dashed #d1d5db;border-radius:10px;color:var(--muted)}
    .ctx-menu{position:fixed;display:none;min-width:170px;background:#fff;border:1px solid #d1d5db;border-radius:10px;box-shadow:0 16px 28px rgba(15,23,42,.16);padding:6px;z-index:9999}
    .ctx-item{width:100%;background:transparent;border:none;text-align:left;padding:8px 10px;border-radius:7px;cursor:pointer;font-size:13px;color:#374151}
    .ctx-item:hover{background:#f3f4f6}
    .ctx-item.danger{color:#b91c1c}
    .site-badge{background:rgba(255,255,255,.18);padding:3px 8px;border-radius:999px;font-weight:600}
    @media (max-width:900px){.toolbar{flex-direction:column;align-items:stretch}.toolbar-left,.toolbar-right{width:100%}.breadcrumb-bar{padding:10px 16px;font-size:12px}.main{padding:16px}}
</style></head><body>
<div class="topbar">
    <div><strong>CloudEase File Manager</strong> <span class="site-badge">Site: <?=esc($siteName)?></span></div>
    <div class="actions">
        <a href="filemanager.php?fresh=1">Entrar Novamente</a>
        <a href="?logout=1">Sair</a>
    </div>
</div>
<div class="breadcrumb-bar">
    <?php 
    if($rel !== ''){
        $upTop = dirname($rel);
        if($upTop === '.') $upTop = '';
        echo '<a href="?path='.urlencode($upTop).'&view='.urlencode($view).'&sort='.urlencode($sort).'&order='.urlencode($order).'" class="breadcrumb-back" title="Voltar">←</a>';
    }
    ?>
    <div class="breadcrumb-path">
        <a href="filemanager.php?view=<?=urlencode($view)?>&sort=<?=urlencode($sort)?>&order=<?=urlencode($order)?>" class="breadcrumb-item">In&iacute;cio</a>
        <?php 
        if($rel !== ''){
            $parts = explode('/', trim($rel, '/'));
            $path = '';
            foreach($parts as $part){
                if(empty($part)) continue;
                $path = ($path ? $path.'/' : '') . $part;
                echo '<span class="breadcrumb-sep">/</span>';
                echo '<a href="?path='.urlencode($path).'&view='.urlencode($view).'&sort='.urlencode($sort).'&order='.urlencode($order).'" class="breadcrumb-item">'.esc($part).'</a>';
            }
        }
        ?>
    </div>
</div>
<div class="shell">
    <main class="main">
        <form class="toolbar" method="post" enctype="multipart/form-data">
            <div class="toolbar-left">
                <input type="file" name="upload" required>
                <button class="btn" type="submit">Upload</button>
            </div>
            <div class="toolbar-right">
                <a class="btn gray" href="?path=<?=urlencode($rel)?>&view=<?=urlencode($view)?>&sort=<?=urlencode($sort)?>&order=<?=urlencode($order)?>">Atualizar</a>
                <div class="sort-controls">
                    <span class="sort-label">Organizar:</span>
                    <a class="sort-pill <?= $sort === 'name' ? 'active' : '' ?>" href="?path=<?=urlencode($rel)?>&view=<?=urlencode($view)?>&sort=name&order=<?=urlencode($sort === 'name' ? $nextOrder : 'asc')?>">Nome <span class="sort-arrow"><?= $sort === 'name' ? ($order === 'asc' ? '&uarr;' : '&darr;') : '&#8597;' ?></span></a>
                    <a class="sort-pill <?= $sort === 'type' ? 'active' : '' ?>" href="?path=<?=urlencode($rel)?>&view=<?=urlencode($view)?>&sort=type&order=<?=urlencode($sort === 'type' ? $nextOrder : 'asc')?>">Tipo <span class="sort-arrow"><?= $sort === 'type' ? ($order === 'asc' ? '&uarr;' : '&darr;') : '&#8597;' ?></span></a>
                    <a class="sort-pill <?= $sort === 'size' ? 'active' : '' ?>" href="?path=<?=urlencode($rel)?>&view=<?=urlencode($view)?>&sort=size&order=<?=urlencode($sort === 'size' ? $nextOrder : 'asc')?>">Tamanho <span class="sort-arrow"><?= $sort === 'size' ? ($order === 'asc' ? '&uarr;' : '&darr;') : '&#8597;' ?></span></a>
                    <a class="sort-pill <?= $sort === 'date' ? 'active' : '' ?>" href="?path=<?=urlencode($rel)?>&view=<?=urlencode($view)?>&sort=date&order=<?=urlencode($sort === 'date' ? $nextOrder : 'asc')?>">Data <span class="sort-arrow"><?= $sort === 'date' ? ($order === 'asc' ? '&uarr;' : '&darr;') : '&#8597;' ?></span></a>
                </div>
                <div class="view-switch">
                    <a class="icon-btn <?= $view === 'grid' ? 'active' : '' ?>" href="?path=<?=urlencode($rel)?>&view=grid&sort=<?=urlencode($sort)?>&order=<?=urlencode($order)?>" title="Modo grade" aria-label="Modo grade">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                    </a>
                    <a class="icon-btn <?= $view === 'list' ? 'active' : '' ?>" href="?path=<?=urlencode($rel)?>&view=list&sort=<?=urlencode($sort)?>&order=<?=urlencode($order)?>" title="Modo detalhes" aria-label="Modo detalhes">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1.5"/><circle cx="4" cy="12" r="1.5"/><circle cx="4" cy="18" r="1.5"/></svg>
                    </a>
                </div>
            </div>
        </form>
        <?php if(empty($visibleItems)): ?>
            <div class="empty">Diretorio vazio.</div>
        <?php elseif($view === 'list'): ?>
        <div class="list">
            <div class="list-header">
                <div>
                    <a class="sort-link <?= $sort === 'name' ? 'active' : '' ?>" href="?path=<?=urlencode($rel)?>&view=list&sort=name&order=<?=urlencode($sort === 'name' ? $nextOrder : 'asc')?>">Nome <span class="sort-arrow"><?= $sort === 'name' ? ($order === 'asc' ? '&uarr;' : '&darr;') : '&#8597;' ?></span></a>
                </div>
                <div>
                    <a class="sort-link <?= $sort === 'type' ? 'active' : '' ?>" href="?path=<?=urlencode($rel)?>&view=list&sort=type&order=<?=urlencode($sort === 'type' ? $nextOrder : 'asc')?>">Tipo <span class="sort-arrow"><?= $sort === 'type' ? ($order === 'asc' ? '&uarr;' : '&darr;') : '&#8597;' ?></span></a>
                </div>
                <div>
                    <a class="sort-link <?= $sort === 'size' ? 'active' : '' ?>" href="?path=<?=urlencode($rel)?>&view=list&sort=size&order=<?=urlencode($sort === 'size' ? $nextOrder : 'asc')?>">Tamanho <span class="sort-arrow"><?= $sort === 'size' ? ($order === 'asc' ? '&uarr;' : '&darr;') : '&#8597;' ?></span></a>
                </div>
                <div>
                    <a class="sort-link <?= $sort === 'date' ? 'active' : '' ?>" href="?path=<?=urlencode($rel)?>&view=list&sort=date&order=<?=urlencode($sort === 'date' ? $nextOrder : 'asc')?>">Data <span class="sort-arrow"><?= $sort === 'date' ? ($order === 'asc' ? '&uarr;' : '&darr;') : '&#8597;' ?></span></a>
                </div>
            </div>
            <?php foreach($visibleItems as $it): $full=$current.'/'.$it; $isDir=is_dir($full); $next=trim(($rel? $rel.'/' : '').$it,'/'); $size=$isDir ? '-' : (filesize($full).' bytes'); $mod=@filemtime($full); $modText=$mod ? date('d/m/Y H:i', $mod) : '-'; ?>
            <div class="list-row file-item" data-name="<?=esc($it)?>" data-isdir="<?= $isDir ? '1' : '0' ?>" data-open-url="<?= $isDir ? ('?path='.urlencode($next).'&view=list&sort='.urlencode($sort).'&order='.urlencode($order)) : esc(($rel? $rel.'/' : '').$it) ?>" data-delete-url="?path=<?=urlencode($rel)?>&view=list&sort=<?=urlencode($sort)?>&order=<?=urlencode($order)?>&delete=<?=urlencode($it)?>">
                <div><?php if($isDir): ?>&#128193; <a href="?path=<?=urlencode($next)?>&view=list&sort=<?=urlencode($sort)?>&order=<?=urlencode($order)?>"><?=esc($it)?></a><?php else: ?>&#128196; <a href="<?=esc(($rel? $rel.'/' : '').$it)?>" target="_blank"><?=esc($it)?></a><?php endif; ?></div>
                <div class="mono"><?= $isDir ? 'Pasta' : 'Arquivo' ?></div>
                <div class="mono"><?=esc($size)?></div>
                <div class="mono"><?=esc($modText)?> <a class="link-btn" href="#" onclick="return renameItem('<?=esc($it)?>')">Renomear</a> <a class="danger" href="?path=<?=urlencode($rel)?>&view=list&sort=<?=urlencode($sort)?>&order=<?=urlencode($order)?>&delete=<?=urlencode($it)?>" onclick="return confirm('Excluir este item?')">Excluir</a></div>
            </div>
            <?php endforeach; ?>
        </div>
        <?php else: ?>
        <div class="grid">
            <?php foreach($visibleItems as $it): $full=$current.'/'.$it; $isDir=is_dir($full); $next=trim(($rel? $rel.'/' : '').$it,'/'); ?>
            <div class="card file-item <?= $isDir ? 'folder-card' : '' ?>" data-name="<?=esc($it)?>" data-isdir="<?= $isDir ? '1' : '0' ?>" data-open-url="<?= $isDir ? ('?path='.urlencode($next).'&view=grid&sort='.urlencode($sort).'&order='.urlencode($order)) : esc(($rel? $rel.'/' : '').$it) ?>" data-delete-url="?path=<?=urlencode($rel)?>&view=grid&sort=<?=urlencode($sort)?>&order=<?=urlencode($order)?>&delete=<?=urlencode($it)?>">
                <div class="icon"><?= $isDir ? '&#128193;' : '&#128196;' ?></div>
                <div class="name"><?php if($isDir): ?><a href="?path=<?=urlencode($next)?>&view=grid&sort=<?=urlencode($sort)?>&order=<?=urlencode($order)?>"><?=esc($it)?></a><?php else: ?><a href="<?=esc(($rel? $rel.'/' : '').$it)?>" target="_blank"><?=esc($it)?></a><?php endif; ?></div>
                <div class="meta"><?= $isDir ? 'Pasta' : (filesize($full).' bytes') ?></div>
                <div class="action-row">
                    <a class="link-btn" href="#" onclick="return renameItem('<?=esc($it)?>')">Renomear</a>
                    <a class="danger" href="?path=<?=urlencode($rel)?>&view=grid&sort=<?=urlencode($sort)?>&order=<?=urlencode($order)?>&delete=<?=urlencode($it)?>" onclick="return confirm('Excluir este item?')">Excluir</a>
                </div>
            </div>
            <?php endforeach; ?>
        </div>
        <?php endif; ?>

        <form id="renameForm" method="post" style="display:none">
            <input type="hidden" name="rename_from" id="rename_from">
            <input type="hidden" name="rename_to" id="rename_to">
        </form>

        <div id="ctxMenu" class="ctx-menu">
            <button type="button" class="ctx-item" id="ctxOpen">Abrir</button>
            <button type="button" class="ctx-item" id="ctxRename">Renomear</button>
            <button type="button" class="ctx-item danger" id="ctxDelete">Excluir</button>
        </div>
    </main>
</div>
<script>
let ctxTarget = null;

function renameItem(name){
    var next = prompt('Novo nome para: ' + name, name);
    if(!next || next === name){ return false; }
    document.getElementById('rename_from').value = name;
    document.getElementById('rename_to').value = next;
    document.getElementById('renameForm').submit();
    return false;
}

function hideCtxMenu(){
    const m = document.getElementById('ctxMenu');
    if (m) m.style.display = 'none';
    ctxTarget = null;
}

document.querySelectorAll('.file-item').forEach(function(el){
    el.addEventListener('click', function(ev){
        const isAction = ev.target.closest('a,button,input,form,label');
        if (isAction) return;
        if (el.dataset.isdir === '1' && el.dataset.openUrl) {
            window.location.href = el.dataset.openUrl;
        }
    });

    el.addEventListener('contextmenu', function(ev){
        ev.preventDefault();
        ctxTarget = el.dataset;
        const m = document.getElementById('ctxMenu');
        m.style.display = 'block';
        m.style.left = ev.clientX + 'px';
        m.style.top = ev.clientY + 'px';
    });
});

document.addEventListener('click', function(){ hideCtxMenu(); });
document.addEventListener('scroll', function(){ hideCtxMenu(); }, true);

document.getElementById('ctxOpen').addEventListener('click', function(ev){
    ev.stopPropagation();
    if(!ctxTarget) return;
    if(ctxTarget.isdir === '1'){
        window.location.href = ctxTarget.openUrl;
    } else {
        window.open(ctxTarget.openUrl, '_blank');
    }
});

document.getElementById('ctxRename').addEventListener('click', function(ev){
    ev.stopPropagation();
    if(!ctxTarget) return;
    renameItem(ctxTarget.name);
});

document.getElementById('ctxDelete').addEventListener('click', function(ev){
    ev.stopPropagation();
    if(!ctxTarget) return;
    if(confirm('Excluir este item?')){
        window.location.href = ctxTarget.deleteUrl;
    }
});
</script>
</body></html>
FMEOF

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
            console.log(`Conectado a ${serverIp}. Preparando ambiente e enviando script...`);
            
            // 0. Pre-Flight: Cria estrutura de logs ANTES de tudo para evitar "Aguardando logs" travado no front
            // Isso garante que o arquivo exista mesmo se o script demorar para iniciar
            const logPrepCmd = `mkdir -p /var/log/cloudease && touch "/var/log/cloudease/${domain}.log" && chmod 666 "/var/log/cloudease/${domain}.log"`;
            
            conn.exec(logPrepCmd, (errPrep, streamPrep) => {
                // Função para prosseguir com o upload (chamada após sucesso ou falha do prep)
                const startUpload = () => {
                    // 1. Upload do Script (Via Stream direto para cat)
                    conn.exec(`cat > "${scriptPath}"`, (err, stream) => {
                        if (err) { 
                            conn.end(); 
                            return reject(new Error('Erro ao iniciar upload via stream: ' + err.message)); 
                        }
                        
                        let stderrOutput = '';

                        stream.on('close', (code, signal) => {
                            if (code !== 0) {
                                conn.end();
                                return reject(new Error(`Erro no upload do script (Exit Code: ${code}). Detalhes: ${stderrOutput}`));
                            }

                            // 2. Execução do Script
                            // Redireciona stdout/stderr inicial para um arquivo de debug também, caso nohup falhe
                            // Grava log de debug no /root também
                            const debugRunLog = `/root/debug_run_${domain}.log`;
                            const runCmd = `chmod +x "${scriptPath}" && nohup bash "${scriptPath}" > ${debugRunLog} 2>&1 & disown`;
                            
                            conn.exec(runCmd, (err, stream) => {
                                if (err) { 
                                    conn.end(); 
                                    return reject(new Error('Erro ao solicitar execução: ' + err.message)); 
                                }
                                
                                stream.on('close', (code, signal) => {
                                    conn.end();
                                    // Sucesso: O script foi disparado em background
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

                        }).on('data', () => {}).stderr.on('data', (data) => {
                            stderrOutput += data.toString();
                            console.error('Upload Stderr:', data.toString());
                        });

                        // Escreve o conteúdo do script diretamente no STDIN do 'cat' remoto
                        stream.write(scriptContent);
                        stream.end();
                    });
                };

                // Trata o resultado do Pre-Flight
                if (errPrep) {
                    console.warn('Erro ao preparar logs (ignorando e prosseguindo):', errPrep);
                    return startUpload();
                }
                
                if (streamPrep) {
                    streamPrep.on('close', () => startUpload()).resume();
                } else {
                    startUpload();
                }
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
        const tempHost = enableTempUrl ? buildTempHost(domain, serverIp) : '';
        const scriptContent = `
        PHP_SOCKET=$(find /var/run/php/ -name "php*-fpm.sock" | head -n 1)
        if [ -z "$PHP_SOCKET" ]; then
            PHP_SOCKET="/var/run/php/php${ver}-fpm.sock"
        fi

        cat > /etc/nginx/sites-available/${domain} <<EOF
server {
    listen 80;
    server_name ${domain} www.${domain} ${tempHost};
    root /var/www/${domain};
    index index.html index.htm index.php;
    access_log /var/log/nginx/${domain}.access.log;
    error_log /var/log/nginx/${domain}.error.log;
    location = /phpmyadmin { return 301 /phpmyadmin/; }
    location = /adminer.php { return 302 /phpmyadmin/; }
    location / { try_files \\$uri \\$uri/ /index.php?\\$args; }
    location ~ \\.php$ { include snippets/fastcgi-php.conf; fastcgi_pass unix:$PHP_SOCKET; }
}
EOF
        nginx -t && systemctl reload nginx
        `;

        const conn = new Client();
        conn.on('ready', () => {
            conn.exec(scriptContent, (err, stream) => {
                if (err) {
                    conn.end();
                    return reject(err);
                }
                stream.on('close', (code, signal) => {
                    conn.end();
                    if (code !== 0) return reject(new Error(`Erro ao atualizar Nginx (Code: ${code})`));
                    resolve(true);
                }).on('data', (data) => {
                    // stdout consumption
                }).stderr.on('data', (data) => {
                    // stderr consumption
                });
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

export async function fetchServerRealtimeMetrics(serverIp) {
    return new Promise((resolve) => {
        let privateKey;
        try {
            privateKey = getPrivateKey();
        } catch (err) {
            return resolve({
                available: false,
                reason: 'Chave SSH nao configurada'
            });
        }

        const conn = new Client();
        const command = `
set -e
read -r _ u n s i io irq sirq st g gn < /proc/stat
total1=$((u+n+s+i+io+irq+sirq+st))
idle1=$((i+io))
read -r rx1 tx1 <<EOF
$(awk 'NR>2 {gsub(":","",$1); if ($1 != "lo") {rx += $2; tx += $10}} END {printf "%d %d", rx+0, tx+0}' /proc/net/dev)
EOF
sleep 1
read -r _ u n s i io irq sirq st g gn < /proc/stat
total2=$((u+n+s+i+io+irq+sirq+st))
idle2=$((i+io))
dt=$((total2-total1))
didle=$((idle2-idle1))
cpu=0
if [ "$dt" -gt 0 ]; then cpu=$(( (100*(dt-didle))/dt )); fi
mem_total_kb=$(awk '/MemTotal/ {print $2}' /proc/meminfo)
mem_available_kb=$(awk '/MemAvailable/ {print $2}' /proc/meminfo)
mem_used_kb=$((mem_total_kb-mem_available_kb))
mem_pct=0
if [ "$mem_total_kb" -gt 0 ]; then mem_pct=$(( (100*mem_used_kb)/mem_total_kb )); fi
disk_line=$(df -Pk / | tail -1)
disk_total_kb=$(echo "$disk_line" | awk '{print $2}')
disk_used_kb=$(echo "$disk_line" | awk '{print $3}')
disk_pct=$(echo "$disk_line" | awk '{print $5}' | tr -d '%')
read -r rx2 tx2 <<EOF
$(awk 'NR>2 {gsub(":","",$1); if ($1 != "lo") {rx += $2; tx += $10}} END {printf "%d %d", rx+0, tx+0}' /proc/net/dev)
EOF
rx_kbps=$(( (rx2-rx1)/1024 ))
tx_kbps=$(( (tx2-tx1)/1024 ))
if [ "$rx_kbps" -lt 0 ]; then rx_kbps=0; fi
if [ "$tx_kbps" -lt 0 ]; then tx_kbps=0; fi
read -r load1 load5 load15 _ < /proc/loadavg
echo "METRICS|$cpu|$mem_pct|$disk_pct|$mem_used_kb|$mem_total_kb|$disk_used_kb|$disk_total_kb|$rx_kbps|$tx_kbps|$load1|$load5|$load15"
`;

        let stdout = '';
        let stderr = '';

        conn.on('ready', () => {
            conn.exec(command, (err, stream) => {
                if (err) {
                    conn.end();
                    return resolve({ available: false, reason: err.message });
                }

                stream.on('data', (data) => {
                    stdout += data.toString();
                });

                stream.stderr.on('data', (data) => {
                    stderr += data.toString();
                });

                stream.on('close', () => {
                    conn.end();

                    const line = stdout
                        .split('\n')
                        .map((s) => s.trim())
                        .find((s) => s.startsWith('METRICS|'));

                    if (!line) {
                        return resolve({
                            available: false,
                            reason: (stderr || 'Sem dados de metricas').trim()
                        });
                    }

                    const parts = line.split('|');
                    if (parts.length < 13) {
                        return resolve({ available: false, reason: 'Formato de metricas invalido' });
                    }

                    const [
                        _tag,
                        cpuUsagePct,
                        memoryUsagePct,
                        diskUsagePct,
                        memoryUsedKb,
                        memoryTotalKb,
                        diskUsedKb,
                        diskTotalKb,
                        rxKbps,
                        txKbps,
                        load1,
                        load5,
                        load15
                    ] = parts;

                    return resolve({
                        available: true,
                        cpuUsagePct: Number(cpuUsagePct),
                        memoryUsagePct: Number(memoryUsagePct),
                        diskUsagePct: Number(diskUsagePct),
                        memoryUsedKb: Number(memoryUsedKb),
                        memoryTotalKb: Number(memoryTotalKb),
                        diskUsedKb: Number(diskUsedKb),
                        diskTotalKb: Number(diskTotalKb),
                        rxKbps: Number(rxKbps),
                        txKbps: Number(txKbps),
                        load1: Number(load1),
                        load5: Number(load5),
                        load15: Number(load15),
                        collectedAt: new Date().toISOString()
                    });
                });
            });
        }).on('error', (err) => {
            resolve({ available: false, reason: err.message });
        }).connect({
            host: serverIp,
            port: 22,
            username: 'root',
            privateKey,
            readyTimeout: 20000,
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

/**
 * Instala SSL via Certbot (Let's Encrypt)
 */
export async function provisionSSL(serverIp, domain) {
    const email = `admin@${domain}`; 
    
    // Script melhorado para instalação robusta de SSL
    // 1. Garante dependências
    // 2. Garante Firewall (Porta 80 é exigida para validação)
    // 3. Executa Certbot capturando saída completa
    const cmd = `
        export DEBIAN_FRONTEND=noninteractive
        
        if ! command -v certbot &> /dev/null; then 
            apt-get update -qq && apt-get install -y certbot python3-certbot-nginx
        fi

        if command -v ufw &> /dev/null; then
            ufw allow 80/tcp
            ufw allow 443/tcp
            ufw reload
        fi
        
        # Recarrega Nginx para garantir config atualizada
        nginx -t && systemctl reload nginx

        # Executa Certbot
        certbot --nginx -d ${domain} --non-interactive --agree-tos -m ${email} --redirect
    `;

    return new Promise((resolve, reject) => {
        const conn = new Client();
        conn.on('ready', () => {
             conn.exec(cmd, (err, stream) => {
                 if (err) { conn.end(); return reject(err); }
                 
                 let fullOutput = '';
                 
                 // Captura stdout E stderr combinados para análise de erro
                 stream.on('data', (data) => {
                     fullOutput += data.toString();
                 }).stderr.on('data', (data) => {
                     fullOutput += data.toString();
                 }).on('close', (code) => {
                     conn.end();
                     
                     if (code !== 0) {
                        // Verifica falso positivo: Se o Certbot confirmou sucesso, ignoramos o código de erro
                        if (fullOutput.includes('Congratulations!') && fullOutput.includes('successfully enabled HTTPS')) {
                             return resolve(true);
                        }

                        let errorMsg = 'Falha desconhecida no Certbot.';
                        
                        // Parse de erros comuns para mensagem amigável
                        if (fullOutput.includes('DNS problem') || fullOutput.includes('NXDOMAIN')) {
                            errorMsg = 'Erro de DNS: O domínio não aponta para este servidor ou ainda não propagou.';
                        } else if (fullOutput.includes('Unauthorized') || fullOutput.includes('403 Forbidden')) {
                            errorMsg = 'Erro de Autenticação: O desafio HTTP falhou. Verifique firewall ou Cloudflare.';
                        } else if (fullOutput.includes('Connection refused')) {
                            errorMsg = 'Conexão Recusada: O Nginx pode estar parado ou porta 80 bloqueada.';
                        } else if (fullOutput.includes('too many certificates')) {
                             errorMsg = 'Limite atingido: Muitos certificados emitidos para este domínio recentemente.';
                        } else {
                            // Se não identificar padrão, pega as últimas linhas úteis (removendo log debug infos e mensagens promocionais)
                            const cleanLines = fullOutput.split('\n')
                                .map(l => l.trim()) // Remove whitespace extra
                                .filter(l => 
                                    l.length > 0 &&
                                    !l.includes('Saving debug log') && 
                                    !l.includes('Donating to EFF') &&
                                    !l.includes('eff.org') &&
                                    !l.includes('Donating to ISRG') &&
                                    !l.includes('letsencrypt.org') &&
                                    !l.includes('----------------') &&
                                    !l.includes('If you like Certbot') &&
                                    !l.includes('supporting our work') &&
                                    !l.includes('donate.')
                                );
                            
                            // Tenta encontrar linhas que pareçam erros reais primeiro
                            const errorLines = cleanLines.filter(l => l.toLowerCase().includes('error') || l.toLowerCase().includes('fail') || l.includes('IMPORTANT NOTES'));
                            
                            if (errorLines.length > 0) {
                                errorMsg = errorLines.join('. ');
                            } else {
                                // Fallback para as últimas linhas limpas
                                errorMsg = cleanLines.slice(-3).join('. ') || fullOutput.slice(-200);
                            }
                        }

                        return reject(new Error(errorMsg));
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
            privateKey: getPrivateKey()
        });
    });
}

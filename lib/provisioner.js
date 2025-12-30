import { Client } from 'ssh2';

export async function provisionWordPress(serverIp, rootPassword, domain, wpConfig = null) {
    return new Promise((resolve, reject) => {
        const conn = new Client();
        const dbName = domain.replace(/[^a-z0-9]/g, '_').substring(0, 16);
        const dbUser = dbName;
        const dbPass = Math.random().toString(36).slice(-10) + '!A1';

        let commands = [
            // 1. Instalar WP-CLI (se não existir)
            `if ! command -v wp &> /dev/null; then curl -O https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar && chmod +x wp-cli.phar && mv wp-cli.phar /usr/local/bin/wp; fi`,

            // 2. Criar Banco de Dados
            `mysql -e "CREATE DATABASE IF NOT EXISTS ${dbName};"`,
            `mysql -e "CREATE USER IF NOT EXISTS '${dbUser}'@'localhost' IDENTIFIED BY '${dbPass}';"`,
            `mysql -e "GRANT ALL PRIVILEGES ON ${dbName}.* TO '${dbUser}'@'localhost';"`,
            `mysql -e "FLUSH PRIVILEGES;"`,

            // 3. Configurar Diretório
            `mkdir -p /var/www/${domain}`,
            `chown -R www-data:www-data /var/www/${domain}`,

            // 4. Configurar Nginx
            `cat > /etc/nginx/sites-available/${domain} <<EOF
server {
    listen 80;
    server_name ${domain} www.${domain} ${domain}.${serverIp}.nip.io;
    root /var/www/${domain};
    index index.php index.html;

    location / {
        try_files \\$uri \\$uri/ /index.php?\\$args;
    }

    location ~ \\.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/var/run/php/php8.1-fpm.sock;
    }
}
EOF`,
            `ln -sf /etc/nginx/sites-available/${domain} /etc/nginx/sites-enabled/`,
            `systemctl reload nginx`,
        ];

        if (wpConfig) {
            // Instalação Completa com WP-CLI
            commands.push(
                // Baixar WP
                `wp core download --path=/var/www/${domain} --locale=${wpConfig.lang} --allow-root`,
                
                // Criar Config
                `wp config create --dbname=${dbName} --dbuser=${dbUser} --dbpass=${dbPass} --path=/var/www/${domain} --allow-root`,
                
                // Instalar WP (Usando o domínio real, mas permitindo acesso via nip.io depois)
                `wp core install --url=${domain} --title="${wpConfig.title}" --admin_user="${wpConfig.adminUser}" --admin_password="${wpConfig.adminPass}" --admin_email="${wpConfig.adminEmail}" --path=/var/www/${domain} --allow-root`,
                
                // Ajuste no wp-config.php para permitir URL dinâmica (Link Provisório)
                `sed -i "/stop editing/i define( 'WP_HOME', 'http://' . \\$_SERVER['HTTP_HOST'] );" /var/www/${domain}/wp-config.php`,
                `sed -i "/stop editing/i define( 'WP_SITEURL', 'http://' . \\$_SERVER['HTTP_HOST'] );" /var/www/${domain}/wp-config.php`
            );
        } else {
            // Instalação Manual (Apenas arquivos)
            commands.push(
                `cd /var/www/${domain} && curl -O https://wordpress.org/latest.tar.gz && tar -xzf latest.tar.gz --strip-components=1 && rm latest.tar.gz`,
                `cp /var/www/${domain}/wp-config-sample.php /var/www/${domain}/wp-config.php`,
                `sed -i "s/database_name_here/${dbName}/" /var/www/${domain}/wp-config.php`,
                `sed -i "s/username_here/${dbUser}/" /var/www/${domain}/wp-config.php`,
                `sed -i "s/password_here/${dbPass}/" /var/www/${domain}/wp-config.php`
            );
        }

        // Permissões Finais
        commands.push(`chown -R www-data:www-data /var/www/${domain}`);

        const fullCommand = commands.join(' && ');

        conn.on('ready', () => {
            console.log('SSH Conectado. Iniciando provisionamento...');
            conn.exec(fullCommand, (err, stream) => {
                if (err) {
                    conn.end();
                    return reject(err);
                }
                let output = '';
                stream.on('close', (code, signal) => {
                    conn.end();
                    if (code === 0) {
                        resolve({ success: true, dbName, dbUser, dbPass });
                    } else {
                        reject(new Error(`Comando falhou com código ${code}: ${output}`));
                    }
                }).on('data', (data) => {
                    output += data;
                }).stderr.on('data', (data) => {
                    output += data;
                    console.log('STDERR: ' + data);
                });
            });
        }).on('error', (err) => {
            reject(new Error('Falha na conexão SSH: ' + err.message));
        }).connect({
            host: serverIp,
            port: 22,
            username: 'root',
            password: rootPassword,
            readyTimeout: 30000 // Aumentado timeout pois download do WP pode demorar
        });
    });
}

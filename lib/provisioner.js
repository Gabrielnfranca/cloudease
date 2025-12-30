import { Client } from 'ssh2';

export async function provisionWordPress(serverIp, rootPassword, domain) {
    return new Promise((resolve, reject) => {
        const conn = new Client();
        const dbName = domain.replace(/[^a-z0-9]/g, '_').substring(0, 16);
        const dbUser = dbName;
        const dbPass = Math.random().toString(36).slice(-10) + '!A1';

        const commands = [
            // 1. Criar Banco de Dados
            `mysql -e "CREATE DATABASE IF NOT EXISTS ${dbName};"`,
            `mysql -e "CREATE USER IF NOT EXISTS '${dbUser}'@'localhost' IDENTIFIED BY '${dbPass}';"`,
            `mysql -e "GRANT ALL PRIVILEGES ON ${dbName}.* TO '${dbUser}'@'localhost';"`,
            `mysql -e "FLUSH PRIVILEGES;"`,

            // 2. Configurar Diretório
            `mkdir -p /var/www/${domain}`,
            `chown -R www-data:www-data /var/www/${domain}`,

            // 3. Configurar Nginx
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

            // 4. Baixar WordPress
            `cd /var/www/${domain} && curl -O https://wordpress.org/latest.tar.gz && tar -xzf latest.tar.gz --strip-components=1 && rm latest.tar.gz`,
            
            // 5. Configurar wp-config.php (Básico)
            `cp /var/www/${domain}/wp-config-sample.php /var/www/${domain}/wp-config.php`,
            `sed -i "s/database_name_here/${dbName}/" /var/www/${domain}/wp-config.php`,
            `sed -i "s/username_here/${dbUser}/" /var/www/${domain}/wp-config.php`,
            `sed -i "s/password_here/${dbPass}/" /var/www/${domain}/wp-config.php`,
            
            // 6. Ajustar Permissões Finais
            `chown -R www-data:www-data /var/www/${domain}`
        ];

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
            readyTimeout: 20000
        });
    });
}

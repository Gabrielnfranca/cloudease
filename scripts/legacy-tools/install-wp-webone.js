import { Client } from 'ssh2';
import fs from 'fs';
import path from 'path';

const SERVER_IP = '216.238.119.182';
const DOMAIN = 'tps.com.br';

function getPrivateKey() {
    try {
        return fs.readFileSync(path.join(process.cwd(), 'keys', 'cloudease_rsa'));
    } catch (err) {
        throw new Error('Chave SSH não encontrada.');
    }
}

async function installWP() {
    console.log(`Instalando WordPress em ${SERVER_IP} para ${DOMAIN}...`);
    
    const privateKey = getPrivateKey();
    const conn = new Client();

    const dbName = 'tps_db';
    const dbUser = 'tps_user';
    const dbPass = 'Tps@2026!Secure'; // Senha fixa para este reparo

    const script = `
        export DEBIAN_FRONTEND=noninteractive
        
        # 1. Instalar MariaDB se não existir
        if ! command -v mariadbd &> /dev/null; then
            apt-get update -qq
            apt-get install -y mariadb-server
            systemctl enable mariadb
            systemctl start mariadb
        fi

        # 2. Criar Banco de Dados
        mysql -e "CREATE DATABASE IF NOT EXISTS ${dbName};"
        mysql -e "CREATE USER IF NOT EXISTS '${dbUser}'@'localhost' IDENTIFIED BY '${dbPass}';"
        mysql -e "GRANT ALL PRIVILEGES ON ${dbName}.* TO '${dbUser}'@'localhost';"
        mysql -e "FLUSH PRIVILEGES;"

        # 3. Baixar WordPress
        rm -f /var/www/${DOMAIN}/index.php
        cd /var/www/${DOMAIN}
        
        if [ ! -f wp-settings.php ]; then
            curl -O https://wordpress.org/latest.tar.gz
            tar -xzf latest.tar.gz --strip-components=1
            rm latest.tar.gz
        fi

        # 4. Configurar wp-config.php
        if [ ! -f wp-config.php ]; then
            cp wp-config-sample.php wp-config.php
            sed -i "s/database_name_here/${dbName}/" wp-config.php
            sed -i "s/username_here/${dbUser}/" wp-config.php
            sed -i "s/password_here/${dbPass}/" wp-config.php
            
            # Adicionar FS_METHOD direct para evitar pedir FTP
            sed -i "/stop editing/i define('FS_METHOD', 'direct');" wp-config.php
            
            # Configurar URLs para o link provisório funcionar bem
            # (Opcional, mas ajuda se o DNS não propagou)
            # sed -i "/stop editing/i define('WP_HOME', 'http://${DOMAIN}.${SERVER_IP}.nip.io');" wp-config.php
            # sed -i "/stop editing/i define('WP_SITEURL', 'http://${DOMAIN}.${SERVER_IP}.nip.io');" wp-config.php
        fi

        # 5. Permissões
        chown -R www-data:www-data /var/www/${DOMAIN}
        chmod -R 755 /var/www/${DOMAIN}
        
        echo "Instalação concluída."
    `;

    conn.on('ready', () => {
        console.log('Conectado via SSH. Executando instalação...');
        conn.exec(script, (err, stream) => {
            if (err) {
                console.error('Erro ao executar:', err);
                conn.end();
                return;
            }
            stream.on('close', (code, signal) => {
                console.log(`Script finalizado com código ${code}`);
                conn.end();
            }).on('data', (data) => {
                console.log('STDOUT: ' + data);
            }).stderr.on('data', (data) => {
                console.log('STDERR: ' + data);
            });
        });
    }).on('error', (err) => {
        console.error('Erro de conexão:', err);
    }).connect({
        host: SERVER_IP,
        port: 22,
        username: 'root',
        privateKey: privateKey
    });
}

installWP();

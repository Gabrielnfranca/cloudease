
import { Client } from 'ssh2';
import fs from 'fs';
import path from 'path';

const serverIp = '216.238.98.157';

const getPrivateKey = () => {
    const keyPath = path.join(process.cwd(), 'keys', 'cloudease_rsa');
    return fs.readFileSync(keyPath, 'utf8');
};

const conn = new Client();

conn.on('ready', () => {
    console.log('Client :: ready');
    conn.shell((err, stream) => {
        if (err) throw err;
        stream.on('close', () => {
            console.log('Stream :: close');
            conn.end();
        }).on('data', (data) => {
            console.log('OUTPUT: ' + data);
        });
        
        // Comandos para debugar
        stream.write('cat /root/.my.cnf\n');
        stream.write('mysql -e "SELECT User, Host FROM mysql.user;"\n');
        stream.write('systemctl status mysql\n');
        stream.write('exit\n');
    });
}).connect({
    host: serverIp,
    username: 'root',
    privateKey: getPrivateKey()
});

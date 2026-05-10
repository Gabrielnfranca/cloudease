
import { Client } from 'ssh2';
import fs from 'fs';
import path from 'path';

const SERVER_IP = '216.238.119.182';
const DOMAIN = 'teste.com.br';

function getPrivateKey() {
    return fs.readFileSync(path.join(process.cwd(), 'keys', 'cloudease_rsa'));
}

const conn = new Client();
conn.on('ready', () => {
    console.log(`Checking ${DOMAIN} on ${SERVER_IP}...`);
    
    const commands = [
        'ps aux | grep install',
        'ls -la /tmp',
        'cat /var/log/cloudease/teste.com.br.log'
    ];
    
    const cmd = commands.join(' && echo "---" && ');
    
    conn.exec(cmd, (err, stream) => {
        if (err) throw err;
        stream.on('close', (code, signal) => {
            conn.end();
        }).on('data', (data) => {
            console.log(data.toString());
        }).stderr.on('data', (data) => {
            console.log('STDERR: ' + data);
        });
    });
}).connect({
    host: SERVER_IP,
    port: 22,
    username: 'root',
    privateKey: getPrivateKey()
});

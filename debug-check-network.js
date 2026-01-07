import { Client } from 'ssh2';
import fs from 'fs';
import path from 'path';

const config = {
    host: '216.238.98.157',
    username: 'root',
    privateKey: fs.readFileSync(path.join(process.cwd(), 'keys', 'cloudease_rsa'))
};

const commands = [
    'ufw status verbose',
    'netstat -tulpn | grep :80',
    'curl -I http://localhost',
    'curl -I -H "Host: teste.com.br" http://localhost',
    'ls -la /etc/nginx/sites-enabled/'
];

const conn = new Client();
conn.on('ready', () => {
    console.log('Client :: ready');
    
    let index = 0;
    
    function runNext() {
        if (index >= commands.length) {
            conn.end();
            return;
        }
        const cmd = commands[index++];
        console.log(`\n>>> COMMAND: ${cmd}`);
        conn.exec(cmd, (err, stream) => {
            if (err) {
                console.log('Error: ' + err);
                runNext();
                return;
            }
            stream.on('close', () => {
                runNext();
            }).on('data', (data) => {
                console.log(data.toString().trim());
            }).stderr.on('data', (data) => {
                console.log('STDERR: ' + data);
            });
        });
    }
    
    runNext();

}).connect(config);

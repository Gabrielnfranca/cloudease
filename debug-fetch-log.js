import { Client } from 'ssh2';
import fs from 'fs';
import path from 'path';

const config = {
    host: '216.238.98.157',
    username: 'root',
    privateKey: fs.readFileSync(path.join(process.cwd(), 'keys', 'cloudease_rsa'))
};

const domain = 'teste.com.br';

const conn = new Client();
conn.on('ready', () => {
    console.log('Client :: ready');
    
    // Check log file content
    conn.exec(`cat /var/log/cloudease/${domain}.log`, (err, stream) => {
        if (err) throw err;
        stream.on('close', (code, signal) => {
            console.log('Stream :: close :: code: ' + code + ', signal: ' + signal);
            conn.end();
        }).on('data', (data) => {
            console.log('STDOUT: ' + data);
        }).stderr.on('data', (data) => {
            console.log('STDERR: ' + data);
        });
    });
}).connect(config);

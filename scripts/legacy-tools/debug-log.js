import { Client } from 'ssh2';
import fs from 'fs';

const config = {
    host: '216.238.102.104',
    port: 22,
    username: 'root',
    privateKey: fs.readFileSync('./keys/cloudease_rsa')
};

const conn = new Client();
conn.on('ready', () => {
    console.log('Client :: ready');
    conn.exec('cat /var/log/cloudease/teste.com.br.log', (err, stream) => {
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

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
    conn.exec(`cat /etc/nginx/sites-available/${domain}`, (err, stream) => {
        if (err) throw err;
        stream.on('close', (code, signal) => {
            conn.end();
            if (code !== 0) console.log("File not found or error reading.");
        }).on('data', (data) => {
            console.log('NGINX CONFIG:\n' + data);
        }).stderr.on('data', (data) => {
            console.log('STDERR: ' + data);
        });
    });
    
    // Check if Nginx is running
    conn.exec('systemctl status nginx | grep Active', (err, stream) => {
         stream.on('data', (data) => {
            console.log('NGINX STATUS: ' + data);
         });
    });

}).connect(config);

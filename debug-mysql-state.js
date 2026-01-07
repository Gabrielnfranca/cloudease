
import { Client } from 'ssh2';
import fs from 'fs';
import path from 'path';

const serverIp = '216.238.98.157';

const getPrivateKey = () => {
    const keyPath = path.join(process.cwd(), 'keys', 'cloudease_rsa');
    return fs.readFileSync(keyPath, 'utf8');
};

const conn = new Client();

const commands = [
    'echo "--- Processes ---"',
    'ps aux | grep mysql',
    'echo "--- MySQL Error Log (Tail) ---"',
    'tail -n 20 /var/log/mysql/error.log',
    'echo "--- Socket? ---"',
    'ls -la /var/run/mysqld/',
    'echo "--- Try Connect ---"',
    'mysql -e "SELECT 1" || echo "Connect Failed"'
];

conn.on('ready', () => {
    console.log('SSH Ready');
    conn.exec(commands.join('; echo "===NEXT==="; '), (err, stream) => {
        if (err) throw err;
        stream.on('close', (code) => {
            console.log('Done code ' + code);
            conn.end();
        }).on('data', (data) => console.log(data.toString()))
          .stderr.on('data', (data) => console.log('ERR: ' + data.toString()));
    });
}).connect({
    host: serverIp,
    username: 'root',
    privateKey: getPrivateKey()
});

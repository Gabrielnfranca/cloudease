
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
    'echo "--- .my.cnf ---"',
    'cat /root/.my.cnf || echo "No .my.cnf"',
    'echo "--- MySQL Ping ---"',
    'mysqladmin ping || echo "Ping failed"',
    'echo "--- MySQL User Check ---"',
    'mysql -e "SELECT User, Host FROM mysql.user;" || echo "Query Failed"',
    'echo "--- Service Status ---"',
    'systemctl status mysql --no-pager || echo "Status Check Failed"'
];

conn.on('ready', () => {
    console.log('SSH Ready');
    // Run commands sequentially with separator
    conn.exec(commands.join('; echo "===NEXT==="; '), (err, stream) => {
        if (err) {
            console.error(err);
            return;
        }
        stream.on('close', (code, signal) => {
            console.log('Stream :: close :: code: ' + code);
            conn.end();
        }).on('data', (data) => {
            console.log(data.toString());
        }).stderr.on('data', (data) => {
            console.log('STDERR: ' + data.toString());
        });
    });
}).connect({
    host: serverIp,
    username: 'root',
    privateKey: getPrivateKey()
});

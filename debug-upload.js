
import { Client } from 'ssh2';
import fs from 'fs';
import path from 'path';

// ENDEREÇO DO SERVIDOR NOVO (PEGUEI DO PRINT)
const SERVER_IP = '216.238.99.126'; 

function getPrivateKey() {
    try {
        return fs.readFileSync(path.join(process.cwd(), 'keys', 'cloudease_rsa'));
    } catch (err) {
        console.error("Erro ao ler chave:", err);
        return null;
    }
}

const conn = new Client();
const scriptPath = '/root/test_upload_v2.sh';

conn.on('ready', () => {
    console.log(`[DEBUG] Conectado a ${SERVER_IP}. Testando upload para ${scriptPath}...`);
    
    // Simula Exatamente o que o provisioner.js faz
    conn.exec(`cat > ${scriptPath}`, (err, stream) => {
        let uploadStderr = '';
        
        if (err) { 
            console.error('[DEBUG] Erro ao iniciar upload:', err);
            conn.end(); 
            return;
        }
        
        stream.on('close', (code, signal) => {
            console.log(`[DEBUG] Stream closed. Code: ${code}, Signal: ${signal}`);
            if (code !== 0) {
                console.error(`[DEBUG] FALHA NO UPLOAD. STDERR: ${uploadStderr}`);
            } else {
                console.log('[DEBUG] UPLOAD SUCESSO!');
                // Verifica se arquivo existe
                conn.exec(`ls -la ${scriptPath}`, (err, stream2) => {
                    stream2.on('data', (d) => console.log('File check:', d.toString()));
                    conn.end();
                });
            }
        }).on('data', (d) => {
            console.log('STDOUT:', d.toString());
        }).stderr.on('data', (data) => {
             uploadStderr += data.toString();
             console.error('STDERR STREAM:', data.toString());
        });

        // Escreve conteúdo
        stream.write("#!/bin/bash\necho 'Hello World'");
        stream.end();
    });
}).on('error', (err) => {
    console.error('[DEBUG] Connection Error:', err);
}).connect({
    host: SERVER_IP,
    port: 22,
    username: 'root',
    privateKey: getPrivateKey(),
    readyTimeout: 20000 
});

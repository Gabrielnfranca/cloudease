
import { deleteSiteFromInstance } from './lib/provisioner.js';

const SERVER_IP = '216.238.119.182';
const DOMAIN = 'tps.com.br';

console.log(`Tentando excluir site ${DOMAIN} do servidor ${SERVER_IP}...`);

deleteSiteFromInstance(SERVER_IP, DOMAIN)
    .then(() => {
        console.log('Sucesso: Site excluído do servidor.');
    })
    .catch((err) => {
        console.error('Erro ao excluir:', err);
    });

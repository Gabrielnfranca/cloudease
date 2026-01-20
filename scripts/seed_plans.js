import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../lib/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carregar variáveis de ambiente do arquivo .env manualmente
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf-8');
    envConfig.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) {
            process.env[key.trim()] = value.trim();
        }
    });
}

async function seedPlans() {
    try {
        console.log('Seeding plans...');

        const plans = [
            {
                name: 'Developer',
                price: 29.90,
                description: 'Para desenvolvedores e freelancers.',
                features: JSON.stringify(['1 Servidor', '5 Sites', 'SSL Gratuito', 'Suporte via Comunidade'])
            },
            {
                name: 'Pro',
                price: 79.90,
                description: 'Para agências e projetos em crescimento.',
                features: JSON.stringify(['3 Servidores', 'Sites Ilimitados', 'SSL Automático', 'Suporte Prioritário', 'Backups Diários'])
            },
            {
                name: 'Business',
                price: 199.90,
                description: 'Para grandes operações e revenda.',
                features: JSON.stringify(['Servidores Ilimitados', 'White Label', 'API de Gerenciamento', 'Gerente de Conta', 'SLA 99.9%'])
            }
        ];

        for (const plan of plans) {
            const check = await db.query('SELECT id FROM plans WHERE name = $1', [plan.name]);
            if (check.rows.length === 0) {
                await db.query(
                    'INSERT INTO plans (name, price, description, features) VALUES ($1, $2, $3, $4)',
                    [plan.name, plan.price, plan.description, plan.features]
                );
                console.log(`Inserted plan: ${plan.name}`);
            } else {
                console.log(`Plan already exists: ${plan.name}`);
            }
        }

        console.log('Seeding completed successfully.');
    } catch (err) {
        console.error('Error seeding plans:', err);
    }
}

seedPlans();

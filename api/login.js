import db from '../lib/db';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'sua_chave_secreta_super_segura';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }

    try {
        // Busca usuário pelo email
        // Nota: O formulário usa 'username' como name, mas vamos padronizar para email no backend
        // ou aceitar username como email.
        const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [email]);
        const user = rows[0];

        if (!user) {
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }

        // Verifica a senha
        // Se a senha no banco não estiver hash (ex: usuário admin criado manualmente), comparamos texto plano
        // Caso contrário, usamos bcrypt
        let passwordMatch = false;
        if (user.password.startsWith('$2')) {
            passwordMatch = await bcrypt.compare(password, user.password);
        } else {
            passwordMatch = (password === user.password);
        }

        if (!passwordMatch) {
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }

        // Gera token JWT
        const token = jwt.sign(
            { userId: user.id, email: user.email, name: user.name },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        // Retorna sucesso e token
        return res.status(200).json({
            success: true,
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email
            }
        });

    } catch (error) {
        console.error('Erro no login:', error);
        return res.status(500).json({ error: 'Erro interno do servidor' });
    }
}
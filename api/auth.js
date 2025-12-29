import db from '../lib/db';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'sua_chave_secreta_super_segura';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    const { action } = req.query;
    if (action === 'login') {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email e senha são obrigatórios' });
        }
        try {
            const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [email]);
            const user = rows[0];
            if (!user) {
                return res.status(401).json({ error: 'Credenciais inválidas' });
            }
            let passwordMatch = false;
            if (user.password.startsWith('$2')) {
                passwordMatch = await bcrypt.compare(password, user.password);
            } else {
                passwordMatch = (password === user.password);
            }
            if (!passwordMatch) {
                return res.status(401).json({ error: 'Credenciais inválidas' });
            }
            const token = jwt.sign(
                { userId: user.id, email: user.email, name: user.name },
                JWT_SECRET,
                { expiresIn: '24h' }
            );
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
    } else if (action === 'register') {
        const { name, email, password } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
        }
        try {
            const userCheck = await db.query('SELECT id FROM users WHERE email = $1', [email]);
            if (userCheck.rows.length > 0) {
                return res.status(400).json({ error: 'Email já cadastrado' });
            }
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);
            const result = await db.query(
                'INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id, name, email',
                [name, email, hashedPassword]
            );
            return res.status(201).json({
                success: true,
                message: 'Usuário criado com sucesso',
                user: result.rows[0]
            });
        } catch (error) {
            console.error('Erro no registro:', error);
            return res.status(500).json({ error: 'Erro interno do servidor' });
        }
    } else {
        res.status(400).json({ error: 'Ação inválida' });
    }
}
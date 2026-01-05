import db from '../lib/db.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const JWT_SECRET = process.env.JWT_SECRET || 'sua_chave_secreta_super_segura';

export default async function handler(req, res) {
    // Autenticação JWT
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token de autenticação não fornecido' });
    }

    const token = authHeader.split(' ')[1];
    let userId;

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        userId = decoded.userId;
    } catch (error) {
        return res.status(401).json({ error: 'Token inválido ou expirado' });
    }

    if (req.method === 'GET') {
        try {
            const { rows } = await db.query('SELECT id, name, email, created_at FROM users WHERE id = $1', [userId]);
            if (rows.length === 0) {
                return res.status(404).json({ error: 'Usuário não encontrado' });
            }
            return res.status(200).json(rows[0]);
        } catch (error) {
            console.error('Erro ao buscar usuário:', error);
            return res.status(500).json({ error: 'Erro interno do servidor' });
        }
    } else if (req.method === 'PUT') {
        const { name, email, currentPassword, newPassword } = req.body;

        try {
            // Se for atualização de senha
            if (newPassword) {
                if (!currentPassword) {
                    return res.status(400).json({ error: 'Senha atual é obrigatória para definir uma nova senha' });
                }

                const { rows } = await db.query('SELECT password FROM users WHERE id = $1', [userId]);
                const user = rows[0];

                const passwordMatch = await bcrypt.compare(currentPassword, user.password);
                if (!passwordMatch) {
                    return res.status(401).json({ error: 'Senha atual incorreta' });
                }

                const hashedPassword = await bcrypt.hash(newPassword, 10);
                await db.query('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, userId]);
            }

            // Atualização de perfil (nome e email)
            if (name || email) {
                const updates = [];
                const values = [];
                let query = 'UPDATE users SET ';
                let idx = 1;

                if (name) {
                    updates.push(`name = $${idx}`);
                    values.push(name);
                    idx++;
                }
                if (email) {
                    updates.push(`email = $${idx}`);
                    values.push(email);
                    idx++;
                }

                if (updates.length > 0) {
                    query += updates.join(', ') + ` WHERE id = $${idx}`;
                    values.push(userId);
                    await db.query(query, values);
                }
            }

            return res.status(200).json({ message: 'Perfil atualizado com sucesso' });

        } catch (error) {
            console.error('Erro ao atualizar usuário:', error);
            if (error.code === '23505') { // Unique violation for email
                return res.status(400).json({ error: 'Este email já está em uso' });
            }
            return res.status(500).json({ error: 'Erro interno do servidor' });
        }
    } else {
        return res.status(405).json({ error: 'Method not allowed' });
    }
}

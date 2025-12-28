import bcrypt from 'bcryptjs';
import pg from 'pg';

export default function handler(req, res) {
    try {
        const salt = bcrypt.genSaltSync(10);
        const hash = bcrypt.hashSync("test", salt);
        
        res.status(200).json({
            status: 'ok',
            bcrypt: 'loaded',
            pg: 'loaded',
            hashExample: hash,
            pgTypes: Object.keys(pg).join(', ')
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message,
            stack: error.stack
        });
    }
}
export default function handler(req, res) {
    res.status(200).json({ 
        status: 'ok', 
        message: 'API is running', 
        timestamp: new Date().toISOString(),
        env: {
            NODE_ENV: process.env.NODE_ENV
        }
    });
}
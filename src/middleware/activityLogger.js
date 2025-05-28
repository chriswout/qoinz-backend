const { pool } = require('../config/database');

// Middleware to log user activity
const logUserActivity = (action, details = null) => async (req, res, next) => {
    try {
        const userId = req.user ? req.user.id : null;
        const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        const userAgent = req.headers['user-agent'] || '';
        // Optionally, add geo lookup here for country/city/ISP

        await pool.query(
            'INSERT INTO user_activity_logs (user_id, action, ip_address, user_agent, details) VALUES (?, ?, ?, ?, ?)',
            [userId, action, ip, userAgent, details ? JSON.stringify(details) : null]
        );
    } catch (err) {
        // Don't block the request if logging fails
        console.error('User activity logging error:', err);
    }
    next();
};

module.exports = { logUserActivity }; 
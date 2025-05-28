const { pool } = require('../config/database');

// Middleware to log user activity
const logUserActivity = (action, details = null) => async (req, res, next) => {
    try {
        let userId = req.user ? req.user.id : null;
        const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        const userAgent = req.headers['user-agent'] || '';

        // For login attempts, we need to wait for the response
        if (action === 'login' && !userId) {
            // Store the original res.json function
            const originalJson = res.json;
            
            // Override res.json to capture the response
            res.json = function(data) {
                if (data.user && data.user.id) {
                    userId = data.user.id;
                }
                return originalJson.call(this, data);
            };
        }

        // If we still don't have a user ID, use system user
        if (!userId) {
            userId = 1;
        }

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
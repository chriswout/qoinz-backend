const { pool } = require('../config/database');

// Middleware to log user activity
const logUserActivity = (action, details = null) => async (req, res, next) => {
    try {
        const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        const userAgent = req.headers['user-agent'] || '';

        // For login attempts, wait for response to get user ID
        if (action === 'login') {
            // Store the original res.json function
            const originalJson = res.json;
            let responseData = null;
            
            // Override res.json to capture the response
            res.json = function(data) {
                responseData = data;
                return originalJson.call(this, data);
            };

            // Log after response is sent
            res.on('finish', async () => {
                try {
                    const userId = responseData?.user?.id || 1;
                    await pool.query(
                        'INSERT INTO user_activity_logs (user_id, action, ip_address, user_agent, details) VALUES (?, ?, ?, ?, ?)',
                        [userId, action, ip, userAgent, details ? JSON.stringify(details) : null]
                    );
                } catch (err) {
                    console.error('User activity logging error:', err);
                }
            });
        } else {
            // For other actions, log immediately
            const userId = req.user ? req.user.id : 1;
            await pool.query(
                'INSERT INTO user_activity_logs (user_id, action, ip_address, user_agent, details) VALUES (?, ?, ?, ?, ?)',
                [userId, action, ip, userAgent, details ? JSON.stringify(details) : null]
            );
        }
    } catch (err) {
        // Don't block the request if logging fails
        console.error('User activity logging error:', err);
    }
    next();
};

module.exports = { logUserActivity }; 
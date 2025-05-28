const { pool } = require('../config/database');
const axios = require('axios');

// Function to get IP geolocation data
async function getIpInfo(ip) {
    try {
        // Skip localhost and private IPs
        if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) {
            return { country: 'Local', city: 'Local', isp: 'Local' };
        }

        const response = await axios.get(`http://ip-api.com/json/${ip}?fields=country,city,isp`);
        return response.data;
    } catch (err) {
        console.error('IP geolocation error:', err);
        return { country: null, city: null, isp: null };
    }
}

// Middleware to log user activity
const logUserActivity = (action, details = null) => async (req, res, next) => {
    try {
        const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        const userAgent = req.headers['user-agent'] || '';
        const referrer = req.headers.referer || req.headers.referrer || null;

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
                    const ipInfo = await getIpInfo(ip);
                    
                    await pool.query(
                        `INSERT INTO user_activity_logs (
                            user_id, action, ip_address, country, city, isp, 
                            user_agent, referrer, details
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            userId, action, ip, ipInfo.country, ipInfo.city, ipInfo.isp,
                            userAgent, referrer, details ? JSON.stringify(details) : null
                        ]
                    );
                } catch (err) {
                    console.error('User activity logging error:', err);
                }
            });
        } else {
            // For other actions, log immediately
            const userId = req.user ? req.user.id : 1;
            const ipInfo = await getIpInfo(ip);
            
            await pool.query(
                `INSERT INTO user_activity_logs (
                    user_id, action, ip_address, country, city, isp, 
                    user_agent, referrer, details
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    userId, action, ip, ipInfo.country, ipInfo.city, ipInfo.isp,
                    userAgent, referrer, details ? JSON.stringify(details) : null
                ]
            );
        }
    } catch (err) {
        // Don't block the request if logging fails
        console.error('User activity logging error:', err);
    }
    next();
};

module.exports = { logUserActivity }; 
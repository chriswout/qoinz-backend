const { pool } = require('../config/database');
const geoip = require('geoip-lite');

/**
 * Log a user activity
 * @param {number} userId - The ID of the user performing the action
 * @param {string} action - The type of action (e.g., 'login', 'logout', 'profile_update')
 * @param {Object} req - Express request object
 * @param {Object} details - Additional details about the action
 */
async function logActivity(userId, action, req, details = {}) {
  try {
    // Get IP information
    const ip = req.ip || req.connection.remoteAddress;
    const geo = geoip.lookup(ip);
    
    // Get user agent and referrer
    const userAgent = req.headers['user-agent'];
    const referrer = req.headers.referer || req.headers.referrer;
    
    // Insert activity log
    const [result] = await pool.query(`
      INSERT INTO user_activity_logs (
        user_id,
        action,
        ip_address,
        country,
        city,
        isp,
        user_agent,
        referrer,
        details
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      userId,
      action,
      ip,
      geo?.country || null,
      geo?.city || null,
      geo?.org || null,
      userAgent,
      referrer,
      JSON.stringify(details)
    ]);
    
    return result.insertId;
  } catch (error) {
    console.error('Error logging activity:', error);
    // Don't throw the error to prevent disrupting the main flow
    return null;
  }
}

module.exports = {
  logActivity
}; 
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { pool } = require('../config/database');
const { logActivity } = require('../utils/activityLogger');

// Get activity statistics (specific route)
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const [stats] = await pool.query(`
      SELECT 
        COUNT(*) as total_actions,
        COUNT(DISTINCT DATE(timestamp)) as active_days,
        COUNT(DISTINCT action) as unique_actions,
        MAX(timestamp) as last_activity
      FROM user_activity_logs
      WHERE user_id = ?
    `, [req.user.id]);
    
    const [actionStats] = await pool.query(`
      SELECT 
        action,
        COUNT(*) as count
      FROM user_activity_logs
      WHERE user_id = ?
      GROUP BY action
      ORDER BY count DESC
      LIMIT 5
    `, [req.user.id]);
    
    res.json({
      ...stats[0],
      top_actions: actionStats
    });
  } catch (error) {
    console.error('Error fetching activity stats:', error);
    res.status(500).json({ error: 'Failed to fetch activity statistics' });
  }
});

// Get user activity logs (list route)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 20, action } = req.query;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT 
        ual.*,
        u.username
      FROM user_activity_logs ual
      JOIN users u ON ual.user_id = u.id
      WHERE ual.user_id = ?
    `;
    
    const params = [req.user.id];
    
    if (action) {
      query += ' AND ual.action = ?';
      params.push(action);
    }
    
    query += ' ORDER BY ual.timestamp DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);
    
    const [logs] = await pool.query(query, params);
    
    // Get total count for pagination
    const [countResult] = await pool.query(
      'SELECT COUNT(*) as total FROM user_activity_logs WHERE user_id = ?',
      [req.user.id]
    );
    
    res.json({
      logs,
      pagination: {
        total: countResult[0].total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(countResult[0].total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching activity logs:', error);
    res.status(500).json({ error: 'Failed to fetch activity logs' });
  }
});

// Get activity log details (parameterized route)
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const [log] = await pool.query(`
      SELECT 
        ual.*,
        u.username
      FROM user_activity_logs ual
      JOIN users u ON ual.user_id = u.id
      WHERE ual.id = ? AND ual.user_id = ?
    `, [req.params.id, req.user.id]);
    
    if (!log.length) {
      return res.status(404).json({ error: 'Activity log not found' });
    }
    
    res.json(log[0]);
  } catch (error) {
    console.error('Error fetching activity log details:', error);
    res.status(500).json({ error: 'Failed to fetch activity log details' });
  }
});

module.exports = router; 
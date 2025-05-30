const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// List all EXP log entries for the authenticated user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const [logs] = await pool.query('SELECT * FROM exp_log WHERE user_id = ? ORDER BY created_at DESC', [req.user.id]);
    res.json(logs);
  } catch (error) {
    console.error('Get EXP log error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Add a new EXP log entry
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { amount, source, source_id } = req.body;
    if (!amount || !source) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    const [result] = await pool.query(
      'INSERT INTO exp_log (user_id, amount, source, source_id, created_at) VALUES (?, ?, ?, ?, NOW())',
      [req.user.id, amount, source, source_id || null]
    );
    // Optionally update user's exp here if needed
    res.status(201).json({ message: 'EXP log entry created', expLogId: result.insertId });
  } catch (error) {
    console.error('Create EXP log error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router; 
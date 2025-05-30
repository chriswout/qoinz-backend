const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// List all tables (optionally filter by user)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.query.user_id || null;
    let query = 'SELECT * FROM tables';
    let params = [];
    if (userId) {
      query += ' WHERE owner_id = ?';
      params.push(userId);
    }
    const [tables] = await pool.query(query, params);
    res.json(tables);
  } catch (error) {
    console.error('Get tables error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create a new table
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, max_members, entry_fee, exp_pool } = req.body;
    if (!name || !max_members || !entry_fee || !exp_pool) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    // Check user table_slots
    const [users] = await pool.query('SELECT table_slots, qoinz_balance FROM users WHERE id = ?', [req.user.id]);
    if (users.length === 0) return res.status(404).json({ message: 'User not found' });
    if (users[0].table_slots <= 0) return res.status(400).json({ message: 'No available table slots' });
    if (users[0].qoinz_balance < entry_fee) return res.status(400).json({ message: 'Insufficient QOINZ balance' });
    // Create table
    const [result] = await pool.query(
      'INSERT INTO tables (owner_id, name, max_members, entry_fee, exp_pool, reward_pool, status, created_at) VALUES (?, ?, ?, ?, ?, 0, "open", NOW())',
      [req.user.id, name, max_members, entry_fee, exp_pool]
    );
    // Deduct entry_fee from user and decrement table_slots
    await pool.query('UPDATE users SET qoinz_balance = qoinz_balance - ?, table_slots = table_slots - 1 WHERE id = ?', [entry_fee, req.user.id]);
    // Add creator as first member
    await pool.query('INSERT INTO table_members (table_id, user_id, joined_at, is_winner) VALUES (?, ?, NOW(), 0)', [result.insertId, req.user.id]);
    res.status(201).json({ message: 'Table created', tableId: result.insertId });
  } catch (error) {
    console.error('Create table error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get table details
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const [tables] = await pool.query('SELECT * FROM tables WHERE id = ?', [req.params.id]);
    if (tables.length === 0) return res.status(404).json({ message: 'Table not found' });
    res.json(tables[0]);
  } catch (error) {
    console.error('Get table details error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Join a table
router.post('/:id/join', authenticateToken, async (req, res) => {
  try {
    const tableId = req.params.id;
    // Check if table exists and is open
    const [tables] = await pool.query('SELECT * FROM tables WHERE id = ?', [tableId]);
    if (tables.length === 0) return res.status(404).json({ message: 'Table not found' });
    const table = tables[0];
    if (table.status !== 'open') return res.status(400).json({ message: 'Table is not open for joining' });
    // Check if user is already a member
    const [members] = await pool.query('SELECT * FROM table_members WHERE table_id = ? AND user_id = ?', [tableId, req.user.id]);
    if (members.length > 0) return res.status(400).json({ message: 'Already a member' });
    // Check if table is full
    const [memberCount] = await pool.query('SELECT COUNT(*) as count FROM table_members WHERE table_id = ?', [tableId]);
    if (memberCount[0].count >= table.max_members) return res.status(400).json({ message: 'Table is full' });
    // Check user balance
    const [users] = await pool.query('SELECT qoinz_balance FROM users WHERE id = ?', [req.user.id]);
    if (users.length === 0) return res.status(404).json({ message: 'User not found' });
    if (users[0].qoinz_balance < table.entry_fee) return res.status(400).json({ message: 'Insufficient QOINZ balance' });
    // Deduct entry_fee from user
    await pool.query('UPDATE users SET qoinz_balance = qoinz_balance - ? WHERE id = ?', [table.entry_fee, req.user.id]);
    // Add user to table_members
    await pool.query('INSERT INTO table_members (table_id, user_id, joined_at, is_winner) VALUES (?, ?, NOW(), 0)', [tableId, req.user.id]);
    // Update reward_pool
    await pool.query('UPDATE tables SET reward_pool = reward_pool + ? WHERE id = ?', [table.entry_fee, tableId]);
    res.json({ message: 'Joined table' });
  } catch (error) {
    console.error('Join table error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Leave a table
router.post('/:id/leave', authenticateToken, async (req, res) => {
  try {
    const tableId = req.params.id;
    // Check if user is a member
    const [members] = await pool.query('SELECT * FROM table_members WHERE table_id = ? AND user_id = ?', [tableId, req.user.id]);
    if (members.length === 0) return res.status(400).json({ message: 'Not a member of this table' });
    // Remove user from table_members
    await pool.query('DELETE FROM table_members WHERE table_id = ? AND user_id = ?', [tableId, req.user.id]);
    res.json({ message: 'Left table' });
  } catch (error) {
    console.error('Leave table error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Mark table as completed
router.post('/:id/complete', authenticateToken, async (req, res) => {
  try {
    const tableId = req.params.id;
    // Only owner can complete
    const [tables] = await pool.query('SELECT * FROM tables WHERE id = ?', [tableId]);
    if (tables.length === 0) return res.status(404).json({ message: 'Table not found' });
    if (tables[0].owner_id !== req.user.id) return res.status(403).json({ message: 'Only the owner can complete the table' });
    // Mark table as completed
    await pool.query('UPDATE tables SET status = "completed", completed_at = NOW() WHERE id = ?', [tableId]);
    res.json({ message: 'Table marked as completed' });
  } catch (error) {
    console.error('Complete table error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// List table members
router.get('/:id/members', authenticateToken, async (req, res) => {
  try {
    const tableId = req.params.id;
    const [members] = await pool.query('SELECT * FROM table_members WHERE table_id = ?', [tableId]);
    res.json(members);
  } catch (error) {
    console.error('Get table members error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router; 
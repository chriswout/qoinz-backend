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
    // Fetch table
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
    // Fetch user balance
    const [users] = await pool.query('SELECT qoinz_balance FROM users WHERE id = ?', [req.user.id]);
    if (users.length === 0) return res.status(404).json({ message: 'User not found' });
    // Calculate total fee
    const entryFee = parseFloat(table.entry_fee);
    const platformFee = parseFloat(table.platform_fee || 0.10); // fallback if not set
    const totalFee = entryFee + platformFee;
    if (users[0].qoinz_balance < totalFee) return res.status(400).json({ message: 'Insufficient QOINZ balance' });
    // Deduct total fee from user
    await pool.query('UPDATE users SET qoinz_balance = qoinz_balance - ? WHERE id = ?', [totalFee, req.user.id]);
    // Log wallet transactions
    await pool.query('INSERT INTO wallet_transactions (user_id, amount, type, source_table_id) VALUES (?, ?, ?, ?)', [req.user.id, entryFee, 'join_fee', tableId]);
    await pool.query('INSERT INTO wallet_transactions (user_id, amount, type, source_table_id) VALUES (?, ?, ?, ?)', [req.user.id, platformFee, 'platform_fee', tableId]);
    // Assign user to next available position
    const [positions] = await pool.query('SELECT position FROM table_members WHERE table_id = ? ORDER BY position ASC', [tableId]);
    let nextPosition = 1;
    if (positions.length > 0) {
      const taken = positions.map(p => p.position);
      for (let i = 1; i <= table.max_members; i++) {
        if (!taken.includes(i)) { nextPosition = i; break; }
      }
    }
    // Add user to table_members
    await pool.query('INSERT INTO table_members (table_id, user_id, position, current_level, joined_at, is_winner) VALUES (?, ?, ?, ?, NOW(), 0)', [tableId, req.user.id, nextPosition, table.level || 1]);
    // Log join_table in activity log
    await pool.query('INSERT INTO user_activity_logs (user_id, action, details) VALUES (?, ?, ?)', [req.user.id, 'join_table', JSON.stringify({ table_id: tableId, position: nextPosition })]);
    // Update reward_pool
    await pool.query('UPDATE tables SET reward_pool = reward_pool + ? WHERE id = ?', [entryFee, tableId]);
    // Check if table is now full
    const [updatedCount] = await pool.query('SELECT COUNT(*) as count FROM table_members WHERE table_id = ?', [tableId]);
    if (updatedCount[0].count >= table.max_members) {
      // Mark table as completed
      await pool.query('UPDATE tables SET status = "completed", completed_at = NOW() WHERE id = ?', [tableId]);
      await pool.query('INSERT INTO user_activity_logs (user_id, action, details) VALUES (?, ?, ?)', [req.user.id, 'table_filled', JSON.stringify({ table_id: tableId })]);
      // Fetch all members
      const [allMembers] = await pool.query('SELECT user_id, position FROM table_members WHERE table_id = ? ORDER BY position ASC', [tableId]);
      // Split into 2 new tables (level+1)
      const newLevel = (table.level || 1) + 1;
      // Inherit config
      const config = [table.owner_id, table.name + ' B', table.max_members, table.entry_fee, table.exp_pool, 0, 'open', newLevel, tableId, table.platform_fee, table.reward_amount];
      const [resB] = await pool.query('INSERT INTO tables (owner_id, name, max_members, entry_fee, exp_pool, reward_pool, status, level, parent_table_id, platform_fee, reward_amount, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())', config);
      const configC = [table.owner_id, table.name + ' C', table.max_members, table.entry_fee, table.exp_pool, 0, 'open', newLevel, tableId, table.platform_fee, table.reward_amount];
      const [resC] = await pool.query('INSERT INTO tables (owner_id, name, max_members, entry_fee, exp_pool, reward_pool, status, level, parent_table_id, platform_fee, reward_amount, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())', configC);
      // Assign members to new tables
      for (let m of allMembers) {
        let newTableId = m.position <= 4 ? resB.insertId : resC.insertId;
        let newPos = m.position <= 4 ? m.position : m.position - 4;
        await pool.query('INSERT INTO table_members (table_id, user_id, position, current_level, joined_at, is_winner) VALUES (?, ?, ?, ?, NOW(), 0)', [newTableId, m.user_id, newPos, newLevel]);
        await pool.query('INSERT INTO user_activity_logs (user_id, action, details) VALUES (?, ?, ?)', [m.user_id, 'table_split', JSON.stringify({ from_table: tableId, to_table: newTableId, new_position: newPos, new_level: newLevel })]);
        // --- Progressive reward logic: pay out at each new level (2-5) ---
        if (newLevel >= 2 && newLevel <= 5) {
          // Get reward_amount for this table
          const [rewardTable] = await pool.query('SELECT reward_amount FROM tables WHERE id = ?', [newTableId]);
          const rewardAmount = rewardTable[0]?.reward_amount || 0;
          const perLevelReward = rewardAmount > 0 ? rewardAmount / 5 : 0;
          if (perLevelReward > 0) {
            await pool.query('UPDATE users SET qoinz_balance = qoinz_balance + ? WHERE id = ?', [perLevelReward, m.user_id]);
            await pool.query('INSERT INTO wallet_transactions (user_id, amount, type, source_table_id) VALUES (?, ?, ?, ?)', [m.user_id, perLevelReward, 'reward', newTableId]);
            await pool.query('INSERT INTO user_activity_logs (user_id, action, details) VALUES (?, ?, ?)', [m.user_id, 'reward_granted', JSON.stringify({ table_id: newTableId, amount: perLevelReward, level: newLevel })]);
          }
        }
      }
      // Optionally: handle auto-rejoin logic here
    }
    res.json({ message: 'Joined table', position: nextPosition });
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

// List all joinable tables (marketplace)
router.get('/available', authenticateToken, async (req, res) => {
  try {
    // List tables that are open and not full
    const [tables] = await pool.query(`
      SELECT t.id, t.name, t.level, t.status, t.max_members, t.entry_fee, t.platform_fee, t.reward_amount, t.reward_pool, t.created_at,
        (t.max_members - COUNT(tm.id)) AS slots_left
      FROM tables t
      LEFT JOIN table_members tm ON t.id = tm.table_id
      WHERE t.status = 'open'
      GROUP BY t.id
      HAVING slots_left > 0
      ORDER BY t.level ASC, t.created_at ASC
    `);
    res.json({ tables });
  } catch (error) {
    console.error('Get available tables error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: Update table config (reward, entry fee, platform fee)
router.put('/:id/config', authenticateToken, async (req, res) => {
  try {
    // Only allow admin users
    if (!req.user.is_admin) {
      return res.status(403).json({ message: 'Forbidden: Admins only' });
    }
    const tableId = req.params.id;
    const { reward_amount, entry_fee, platform_fee } = req.body;
    // Validate input
    if (reward_amount == null && entry_fee == null && platform_fee == null) {
      return res.status(400).json({ message: 'No config fields provided' });
    }
    // Build update query
    const fields = [];
    const values = [];
    if (reward_amount != null) { fields.push('reward_amount = ?'); values.push(reward_amount); }
    if (entry_fee != null) { fields.push('entry_fee = ?'); values.push(entry_fee); }
    if (platform_fee != null) { fields.push('platform_fee = ?'); values.push(platform_fee); }
    values.push(tableId);
    await pool.query(`UPDATE tables SET ${fields.join(', ')} WHERE id = ?`, values);
    // Return updated table
    const [tables] = await pool.query('SELECT * FROM tables WHERE id = ?', [tableId]);
    res.json({ message: 'Table config updated', table: tables[0] });
  } catch (error) {
    console.error('Update table config error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router; 
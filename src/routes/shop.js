const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { pool } = require('../config/database');

// GET /api/v1/shop/items - List available shop items
router.get('/items', authenticateToken, async (req, res) => {
  try {
    const [items] = await pool.query(
      `SELECT * FROM shop_items WHERE (limited_time = 0 OR (expires_at IS NULL OR expires_at > NOW()))`
    );
    res.json(items);
  } catch (error) {
    console.error('Error fetching shop items:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/v1/shop/buy - Buy item by ID and deduct from wallet
router.post('/buy', authenticateToken, async (req, res) => {
  const { item_id } = req.body;
  if (!item_id) return res.status(400).json({ message: 'Missing item_id' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // 1. Validate item
    const [items] = await conn.query('SELECT * FROM shop_items WHERE id = ? AND (limited_time = 0 OR (expires_at IS NULL OR expires_at > NOW()))', [item_id]);
    if (items.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: 'Item not found or unavailable' });
    }
    const item = items[0];
    // 2. Check user balance
    const [users] = await conn.query('SELECT qoinz_balance FROM users WHERE id = ?', [req.user.id]);
    if (users.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: 'User not found' });
    }
    if (parseFloat(users[0].qoinz_balance) < parseFloat(item.price)) {
      await conn.rollback();
      return res.status(400).json({ message: 'Insufficient QOINZ balance' });
    }
    // 3. Deduct price
    await conn.query('UPDATE users SET qoinz_balance = qoinz_balance - ? WHERE id = ?', [item.price, req.user.id]);
    // 4. Add to inventory (increment if exists)
    const [inv] = await conn.query('SELECT * FROM player_inventory WHERE user_id = ? AND item_id = ?', [req.user.id, item_id]);
    if (inv.length > 0) {
      await conn.query('UPDATE player_inventory SET quantity = quantity + 1 WHERE id = ?', [inv[0].id]);
    } else {
      await conn.query('INSERT INTO player_inventory (user_id, item_id, quantity) VALUES (?, ?, 1)', [req.user.id, item_id]);
    }
    // 5. Log transaction
    await conn.query('INSERT INTO wallet_transactions (user_id, amount, type, source_id, notes) VALUES (?, ?, ?, ?, ?)', [req.user.id, -item.price, 'shop_purchase', item_id, `Purchased ${item.name}`]);
    await conn.commit();
    // Fetch updated wallet and inventory
    const [[user]] = await conn.query('SELECT qoinz_balance FROM users WHERE id = ?', [req.user.id]);
    const [inventory] = await conn.query(
      `SELECT pi.*, si.name, si.description, si.image_url, si.category, si.badge, si.rarity
       FROM player_inventory pi
       JOIN shop_items si ON pi.item_id = si.id
       WHERE pi.user_id = ?`,
      [req.user.id]
    );
    res.json({ message: 'Purchase successful', balance: user.qoinz_balance, inventory });
  } catch (error) {
    await conn.rollback();
    console.error('Error during purchase:', error);
    res.status(500).json({ message: 'Server error' });
  } finally {
    conn.release();
  }
});

// GET /api/v1/inventory - List all items owned by the user
router.get('/inventory', authenticateToken, async (req, res) => {
  try {
    const [inventory] = await pool.query(
      `SELECT pi.*, si.name, si.description, si.image_url, si.category, si.badge, si.rarity
       FROM player_inventory pi
       JOIN shop_items si ON pi.item_id = si.id
       WHERE pi.user_id = ?`,
      [req.user.id]
    );
    res.json(inventory);
  } catch (error) {
    console.error('Error fetching inventory:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Helper: Admin check
function requireAdmin(req, res, next) {
  if (!req.user || !req.user.is_admin) {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
}

// ADMIN: Create a new shop item
router.post('/items', authenticateToken, requireAdmin, async (req, res) => {
  const { name, description, price, image_url, category, badge, rarity, featured, limited_time, expires_at } = req.body;
  if (!name || !price) return res.status(400).json({ message: 'Missing required fields' });
  try {
    const [result] = await pool.query(
      `INSERT INTO shop_items (name, description, price, image_url, category, badge, rarity, featured, limited_time, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, description, price, image_url, category, badge, rarity, featured || 0, limited_time || 0, expires_at || null]
    );
    res.json({ message: 'Shop item created', item_id: result.insertId });
  } catch (error) {
    console.error('Error creating shop item:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ADMIN: Update a shop item
router.put('/items/:id', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const fields = req.body;
  if (!id || Object.keys(fields).length === 0) return res.status(400).json({ message: 'Missing fields' });
  const allowed = ['name','description','price','image_url','category','badge','rarity','featured','limited_time','expires_at'];
  const updates = [];
  const values = [];
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      updates.push(`${key} = ?`);
      values.push(fields[key]);
    }
  }
  if (updates.length === 0) return res.status(400).json({ message: 'No valid fields to update' });
  values.push(id);
  try {
    await pool.query(`UPDATE shop_items SET ${updates.join(', ')} WHERE id = ?`, values);
    const [items] = await pool.query('SELECT * FROM shop_items WHERE id = ?', [id]);
    res.json({ message: 'Shop item updated', item: items[0] });
  } catch (error) {
    console.error('Error updating shop item:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ADMIN: Delete a shop item
router.delete('/items/:id', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM shop_items WHERE id = ?', [id]);
    res.json({ message: 'Shop item deleted' });
  } catch (error) {
    console.error('Error deleting shop item:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router; 
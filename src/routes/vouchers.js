const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { pool } = require('../config/database');
const crypto = require('crypto');

// POST /api/v1/vouchers/create - Create a voucher
router.post('/create', authenticateToken, async (req, res) => {
  const { amount, inviter_id } = req.body;
  if (!amount || isNaN(amount) || amount <= 0) {
    return res.status(400).json({ message: 'Invalid amount' });
  }
  // Generate unique code
  let code;
  let exists = true;
  while (exists) {
    code = crypto.randomBytes(6).toString('hex').toUpperCase();
    const [rows] = await pool.query('SELECT code FROM vouchers WHERE code = ?', [code]);
    exists = rows.length > 0;
  }
  try {
    await pool.query(
      'INSERT INTO vouchers (code, agent_id, amount, inviter_id, status, created_at) VALUES (?, ?, ?, ?, \'issued\', NOW())',
      [code, req.user.id, amount, inviter_id || null]
    );
    res.json({ code, amount, inviter_id: inviter_id || null });
  } catch (error) {
    console.error('Error creating voucher:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/v1/vouchers/redeem - Redeem a voucher
router.post('/redeem', authenticateToken, async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ message: 'Missing code' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // 1. Validate voucher
    const [vouchers] = await conn.query('SELECT * FROM vouchers WHERE code = ? FOR UPDATE', [code]);
    if (vouchers.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: 'Voucher not found' });
    }
    const voucher = vouchers[0];
    if (voucher.status !== 'issued') {
      await conn.rollback();
      return res.status(400).json({ message: 'Voucher already redeemed or expired' });
    }
    // 2. Mark as redeemed
    await conn.query('UPDATE vouchers SET status = \'redeemed\', redeemed_by = ?, redeemed_at = NOW() WHERE code = ?', [req.user.id, code]);
    // 3. Credit QOINZ to redeemer
    await conn.query('UPDATE users SET qoinz_balance = qoinz_balance + ? WHERE id = ?', [voucher.amount, req.user.id]);
    // 4. Log transaction
    await conn.query('INSERT INTO wallet_transactions (user_id, amount, type, source_id, notes) VALUES (?, ?, ?, ?, ?)', [req.user.id, voucher.amount, 'voucher_redeem', voucher.code, `Redeemed voucher ${voucher.code}`]);
    // 5. Handle inviter bonus (optional: credit inviter, give exp, etc.)
    if (voucher.inviter_id) {
      // Example: Give inviter a 10% bonus
      const inviterBonus = Math.round(voucher.amount * 0.1 * 100) / 100;
      if (inviterBonus > 0) {
        await conn.query('UPDATE users SET qoinz_balance = qoinz_balance + ? WHERE id = ?', [inviterBonus, voucher.inviter_id]);
        await conn.query('INSERT INTO wallet_transactions (user_id, amount, type, source_id, notes) VALUES (?, ?, ?, ?, ?)', [voucher.inviter_id, inviterBonus, 'bonus', voucher.code, `Inviter bonus for voucher ${voucher.code}`]);
      }
      // Optionally: Add EXP/achievement logic here
    }
    await conn.commit();
    // Fetch updated wallet and voucher info
    const [[user]] = await conn.query('SELECT qoinz_balance FROM users WHERE id = ?', [req.user.id]);
    const [[updatedVoucher]] = await conn.query('SELECT * FROM vouchers WHERE code = ?', [code]);
    res.json({ message: 'Voucher redeemed', balance: user.qoinz_balance, voucher: updatedVoucher });
  } catch (error) {
    await conn.rollback();
    console.error('Error redeeming voucher:', error);
    res.status(500).json({ message: 'Server error' });
  } finally {
    conn.release();
  }
});

// GET /api/v1/vouchers/my - List vouchers created/redeemed by the user
router.get('/my', authenticateToken, async (req, res) => {
  try {
    const [created] = await pool.query('SELECT * FROM vouchers WHERE agent_id = ?', [req.user.id]);
    const [redeemed] = await pool.query('SELECT * FROM vouchers WHERE redeemed_by = ?', [req.user.id]);
    res.json({ created, redeemed });
  } catch (error) {
    console.error('Error fetching user vouchers:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ADMIN: List all vouchers (with optional filters)
router.get('/', authenticateToken, async (req, res, next) => {
  if (!req.user || !req.user.is_admin) {
    return res.status(403).json({ message: 'Admin access required' });
  }
  const { status, agent_id, redeemed_by } = req.query;
  let query = 'SELECT * FROM vouchers WHERE 1=1';
  const params = [];
  if (status) { query += ' AND status = ?'; params.push(status); }
  if (agent_id) { query += ' AND agent_id = ?'; params.push(agent_id); }
  if (redeemed_by) { query += ' AND redeemed_by = ?'; params.push(redeemed_by); }
  try {
    const [vouchers] = await pool.query(query, params);
    res.json(vouchers);
  } catch (error) {
    console.error('Error fetching vouchers:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ADMIN: Delete or expire a voucher
router.delete('/:code', authenticateToken, async (req, res, next) => {
  if (!req.user || !req.user.is_admin) {
    return res.status(403).json({ message: 'Admin access required' });
  }
  const { code } = req.params;
  try {
    // Mark as expired if not already redeemed, else delete
    const [vouchers] = await pool.query('SELECT * FROM vouchers WHERE code = ?', [code]);
    if (vouchers.length === 0) return res.status(404).json({ message: 'Voucher not found' });
    if (vouchers[0].status === 'issued') {
      await pool.query('UPDATE vouchers SET status = \'expired\' WHERE code = ?', [code]);
      res.json({ message: 'Voucher expired' });
    } else {
      await pool.query('DELETE FROM vouchers WHERE code = ?', [code]);
      res.json({ message: 'Voucher deleted' });
    }
  } catch (error) {
    console.error('Error deleting/expiring voucher:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router; 
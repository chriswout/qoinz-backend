const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// Get wallet balance and transactions
router.get('/', authenticateToken, async (req, res) => {
    try {
        // Get user's Qoinz balance
        const [users] = await pool.query(
            'SELECT qoinz_balance FROM users WHERE id = ?',
            [req.user.id]
        );

        if (users.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Get recent transactions
        const [transactions] = await pool.query(
            `SELECT * FROM wallet_transactions 
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT 10`,
            [req.user.id]
        );

        res.json({
            balance: users[0].qoinz_balance,
            transactions
        });
    } catch (error) {
        console.error('Get wallet error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get transaction history with pagination
router.get('/transactions', authenticateToken, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;

        // Get total count
        const [countResult] = await pool.query(
            'SELECT COUNT(*) as total FROM wallet_transactions WHERE user_id = ?',
            [req.user.id]
        );

        // Get transactions
        const [transactions] = await pool.query(
            `SELECT t.*, 
                CASE 
                    WHEN t.type = 'achievement' THEN a.id
                    WHEN t.type = 'admin' THEN NULL
                    WHEN t.type = 'table' THEN tbl.id
                    ELSE NULL 
                END as source_id,
                CASE 
                    WHEN t.type = 'achievement' THEN a.name
                    WHEN t.type = 'admin' THEN 'Admin'
                    WHEN t.type = 'table' THEN tbl.name
                    ELSE NULL 
                END as source_name
            FROM wallet_transactions t
            LEFT JOIN achievements a ON t.source_id = a.id AND t.type = 'achievement'
            LEFT JOIN tables tbl ON t.source_id = tbl.id AND t.type = 'table'
            WHERE t.user_id = ?
            ORDER BY t.created_at DESC
            LIMIT ? OFFSET ?`,
            [req.user.id, limit, offset]
        );

        res.json({
            transactions,
            pagination: {
                total: countResult[0].total,
                page,
                limit,
                pages: Math.ceil(countResult[0].total / limit)
            }
        });
    } catch (error) {
        console.error('Get transactions error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router; 
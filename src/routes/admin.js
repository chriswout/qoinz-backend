const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { verifyToken } = require('../middleware/auth');

// Middleware to check if user is admin
const isAdmin = async (req, res, next) => {
    try {
        const [users] = await pool.query(
            'SELECT is_admin FROM users WHERE id = ?',
            [req.user.id]
        );

        if (users.length === 0 || !users[0].is_admin) {
            return res.status(403).json({ message: 'Access denied. Admin only.' });
        }

        next();
    } catch (error) {
        console.error('Admin check error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Get all users
router.get('/users', verifyToken, isAdmin, async (req, res) => {
    try {
        const [users] = await pool.query(
            'SELECT id, username, email, level, exp, table_slots, first_name, last_name, phone, qoinz_balance, created_at FROM users'
        );

        res.json(users);
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get user by ID
router.get('/users/:id', verifyToken, isAdmin, async (req, res) => {
    try {
        const [users] = await pool.query(
            'SELECT id, username, email, level, exp, table_slots, first_name, last_name, phone, qoinz_balance, created_at FROM users WHERE id = ?',
            [req.params.id]
        );

        if (users.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json(users[0]);
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Update user
router.put('/users/:id', verifyToken, isAdmin, async (req, res) => {
    try {
        const { username, email, level, exp, table_slots, first_name, last_name, phone, qoinz_balance } = req.body;

        // Check if username or email is already taken
        if (username || email) {
            const [existingUsers] = await pool.query(
                'SELECT * FROM users WHERE (username = ? OR email = ?) AND id != ?',
                [username, email, req.params.id]
            );

            if (existingUsers.length > 0) {
                return res.status(400).json({ message: 'Username or email already taken' });
            }
        }

        // Update user
        await pool.query(
            'UPDATE users SET username = COALESCE(?, username), email = COALESCE(?, email), level = COALESCE(?, level), exp = COALESCE(?, exp), table_slots = COALESCE(?, table_slots), first_name = COALESCE(?, first_name), last_name = COALESCE(?, last_name), phone = COALESCE(?, phone), qoinz_balance = COALESCE(?, qoinz_balance) WHERE id = ?',
            [username, email, level, exp, table_slots, first_name, last_name, phone, qoinz_balance, req.params.id]
        );

        res.json({ message: 'User updated successfully' });
    } catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Delete user
router.delete('/users/:id', verifyToken, isAdmin, async (req, res) => {
    try {
        await pool.query('DELETE FROM users WHERE id = ?', [req.params.id]);

        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router; 
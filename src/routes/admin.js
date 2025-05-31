const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

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
router.get('/users', authenticateToken, isAdmin, async (req, res) => {
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
router.get('/users/:id', authenticateToken, isAdmin, async (req, res) => {
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
router.put('/users/:id', authenticateToken, isAdmin, async (req, res) => {
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
router.delete('/users/:id', authenticateToken, isAdmin, async (req, res) => {
    try {
        await pool.query('DELETE FROM users WHERE id = ?', [req.params.id]);

        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// List all levels
router.get('/levels', authenticateToken, isAdmin, async (req, res) => {
    try {
        const [levels] = await pool.query('SELECT * FROM level_rewards ORDER BY level ASC');
        res.json(levels);
    } catch (error) {
        console.error('Get levels error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Add a new level
router.post('/levels', authenticateToken, isAdmin, async (req, res) => {
    try {
        const { level, label, exp_required, branch_slots, qoinz_reward, exp_reward, badge } = req.body;
        await pool.query(
            'INSERT INTO level_rewards (level, label, exp_required, branch_slots, qoinz_reward, exp_reward, badge) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [level, label, exp_required, branch_slots, qoinz_reward, exp_reward, badge]
        );
        res.json({ message: 'Level added successfully' });
    } catch (error) {
        console.error('Add level error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Edit a level
router.put('/levels/:id', authenticateToken, isAdmin, async (req, res) => {
    try {
        const { level, label, exp_required, branch_slots, qoinz_reward, exp_reward, badge } = req.body;
        await pool.query(
            'UPDATE level_rewards SET level = ?, label = ?, exp_required = ?, branch_slots = ?, qoinz_reward = ?, exp_reward = ?, badge = ? WHERE id = ?',
            [level, label, exp_required, branch_slots, qoinz_reward, exp_reward, badge, req.params.id]
        );
        res.json({ message: 'Level updated successfully' });
    } catch (error) {
        console.error('Update level error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Delete a level
router.delete('/levels/:id', authenticateToken, isAdmin, async (req, res) => {
    try {
        await pool.query('DELETE FROM level_rewards WHERE id = ?', [req.params.id]);
        res.json({ message: 'Level deleted successfully' });
    } catch (error) {
        console.error('Delete level error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router; 
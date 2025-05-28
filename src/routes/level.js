const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { verifyToken } = require('../middleware/auth');

// Get user's level and experience
router.get('/', verifyToken, async (req, res) => {
    try {
        const [users] = await pool.query(
            'SELECT level, exp FROM users WHERE id = ?',
            [req.user.id]
        );

        if (users.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json(users[0]);
    } catch (error) {
        console.error('Get level error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Add experience to user
router.post('/exp', verifyToken, async (req, res) => {
    try {
        const { amount } = req.body;

        if (!amount || amount <= 0) {
            return res.status(400).json({ message: 'Invalid experience amount' });
        }

        // Get current user data
        const [users] = await pool.query(
            'SELECT level, exp FROM users WHERE id = ?',
            [req.user.id]
        );

        if (users.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        const user = users[0];
        const newExp = user.exp + amount;
        const expForNextLevel = user.level * 1000; // Example: 1000 exp per level

        let newLevel = user.level;
        if (newExp >= expForNextLevel) {
            newLevel = Math.floor(newExp / 1000) + 1;
        }

        // Update user's level and experience
        await pool.query(
            'UPDATE users SET level = ?, exp = ? WHERE id = ?',
            [newLevel, newExp, req.user.id]
        );

        res.json({
            message: 'Experience added successfully',
            level: newLevel,
            exp: newExp,
            expForNextLevel: newLevel * 1000
        });
    } catch (error) {
        console.error('Add experience error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get level requirements
router.get('/requirements', verifyToken, async (req, res) => {
    try {
        const [users] = await pool.query(
            'SELECT level, exp FROM users WHERE id = ?',
            [req.user.id]
        );

        if (users.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        const user = users[0];
        const expForNextLevel = user.level * 1000;
        const expNeeded = expForNextLevel - user.exp;

        res.json({
            currentLevel: user.level,
            currentExp: user.exp,
            expForNextLevel,
            expNeeded,
            progress: (user.exp / expForNextLevel) * 100
        });
    } catch (error) {
        console.error('Get level requirements error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router; 
const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { verifyToken } = require('../middleware/auth');

// Get user's achievements
router.get('/', verifyToken, async (req, res) => {
    try {
        const [achievements] = await pool.query(
            `SELECT a.*, 
                ua.unlocked_at
            FROM achievements a
            LEFT JOIN user_achievements ua ON a.id = ua.achievement_id AND ua.user_id = ?
            ORDER BY a.exp_reward ASC`,
            [req.user.id]
        );

        res.json(achievements);
    } catch (error) {
        console.error('Get achievements error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get achievement details
router.get('/:id', verifyToken, async (req, res) => {
    try {
        const [achievements] = await pool.query(
            `SELECT a.*, 
                ua.unlocked_at,
                CASE 
                    WHEN ua.unlocked_at IS NOT NULL THEN true
                    ELSE false
                END as is_unlocked
            FROM achievements a
            LEFT JOIN user_achievements ua ON a.id = ua.achievement_id AND ua.user_id = ?
            WHERE a.id = ?`,
            [req.user.id, req.params.id]
        );

        if (achievements.length === 0) {
            return res.status(404).json({ message: 'Achievement not found' });
        }

        res.json(achievements[0]);
    } catch (error) {
        console.error('Get achievement details error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Claim achievement reward
router.post('/:id/claim', verifyToken, async (req, res) => {
    try {
        // Start transaction
        await pool.query('START TRANSACTION');

        // Check if achievement exists and is unlocked
        const [achievements] = await pool.query(
            `SELECT a.*, ua.unlocked_at
            FROM achievements a
            JOIN user_achievements ua ON a.id = ua.achievement_id
            WHERE a.id = ? AND ua.user_id = ?`,
            [req.params.id, req.user.id]
        );

        if (achievements.length === 0) {
            await pool.query('ROLLBACK');
            return res.status(404).json({ message: 'Achievement not found' });
        }

        const achievement = achievements[0];

        if (!achievement.unlocked_at) {
            await pool.query('ROLLBACK');
            return res.status(400).json({ message: 'Achievement not unlocked yet' });
        }

        // Add reward to user's Qoinz balance
        await pool.query(
            'UPDATE users SET qoinz_balance = qoinz_balance + ? WHERE id = ?',
            [achievement.qoinz_reward, req.user.id]
        );

        // Record transaction
        await pool.query(
            'INSERT INTO wallet_transactions (user_id, amount, type, source_id) VALUES (?, ?, ?, ?)',
            [req.user.id, achievement.qoinz_reward, 'achievement', achievement.id]
        );

        await pool.query('COMMIT');

        res.json({
            message: 'Reward claimed successfully',
            amount: achievement.qoinz_reward
        });
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Claim reward error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router; 
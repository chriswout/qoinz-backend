const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// Get user's level and experience (with label and exp_required)
router.get('/', authenticateToken, async (req, res) => {
    try {
        const [users] = await pool.query(
            'SELECT level, exp FROM users WHERE id = ?',
            [req.user.id]
        );
        if (users.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }
        const user = users[0];
        const [levelRows] = await pool.query(
            'SELECT label, exp_required, branch_slots, qoinz_reward, exp_reward, badge FROM level_rewards WHERE level = ?',
            [user.level]
        );
        const levelInfo = levelRows[0] || {};
        res.json({
            level: user.level,
            exp: user.exp,
            label: levelInfo.label || '',
            exp_required: levelInfo.exp_required || 0,
            branch_slots: levelInfo.branch_slots || 1,
            qoinz_reward: levelInfo.qoinz_reward || 0,
            exp_reward: levelInfo.exp_reward || 0,
            badge: levelInfo.badge || ''
        });
    } catch (error) {
        console.error('Get level error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Add experience to user and log in exp_log (dynamic leveling)
router.post('/exp', authenticateToken, async (req, res) => {
    try {
        const { amount, source, source_id } = req.body;
        if (!amount || amount <= 0) {
            return res.status(400).json({ message: 'Invalid experience amount' });
        }
        // Get current user data
        const [users] = await pool.query(
            'SELECT id, level, exp FROM users WHERE id = ?',
            [req.user.id]
        );
        if (users.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }
        let user = users[0];
        let expToAdd = amount;
        let leveledUp = false;
        let rewards = [];
        while (true) {
            // Get next level info
            const [nextLevelRows] = await pool.query(
                'SELECT level, label, exp_required, branch_slots, qoinz_reward, exp_reward, badge FROM level_rewards WHERE level = ?',
                [user.level + 1]
            );
            const nextLevel = nextLevelRows[0];
            if (!nextLevel) {
                // No more levels, just add exp
                user.exp += expToAdd;
                await pool.query('UPDATE users SET exp = ? WHERE id = ?', [user.exp, user.id]);
                break;
            }
            const expNeeded = nextLevel.exp_required - user.exp;
            if (expToAdd >= expNeeded) {
                // Level up
                user.level += 1;
                user.exp = 0;
                expToAdd -= expNeeded;
                leveledUp = true;
                // Award perks (branch_slots, qoinz_reward, badge, etc.)
                if (nextLevel.branch_slots) {
                    await pool.query('UPDATE users SET table_slots = ? WHERE id = ?', [nextLevel.branch_slots, user.id]);
                }
                if (nextLevel.qoinz_reward) {
                    await pool.query('UPDATE users SET qoinz_balance = qoinz_balance + ? WHERE id = ?', [nextLevel.qoinz_reward, user.id]);
                }
                // Optionally: log badge/achievement
                rewards.push({
                    level: user.level,
                    label: nextLevel.label,
                    branch_slots: nextLevel.branch_slots,
                    qoinz_reward: nextLevel.qoinz_reward,
                    badge: nextLevel.badge
                });
                await pool.query('UPDATE users SET level = ?, exp = ? WHERE id = ?', [user.level, user.exp, user.id]);
            } else {
                // Not enough to level up
                user.exp += expToAdd;
                await pool.query('UPDATE users SET exp = ? WHERE id = ?', [user.exp, user.id]);
                break;
            }
        }
        // Log EXP gain in exp_log
        await pool.query(
            'INSERT INTO exp_log (user_id, amount, source, source_id, created_at) VALUES (?, ?, ?, ?, NOW())',
            [user.id, amount, source || 'admin', source_id || null]
        );
        // Return current level info
        const [levelRows] = await pool.query(
            'SELECT label, exp_required, branch_slots, qoinz_reward, exp_reward, badge FROM level_rewards WHERE level = ?',
            [user.level]
        );
        const levelInfo = levelRows[0] || {};
        res.json({
            message: 'Experience added successfully',
            level: user.level,
            exp: user.exp,
            label: levelInfo.label || '',
            exp_required: levelInfo.exp_required || 0,
            branch_slots: levelInfo.branch_slots || 1,
            qoinz_reward: levelInfo.qoinz_reward || 0,
            exp_reward: levelInfo.exp_reward || 0,
            badge: levelInfo.badge || '',
            leveledUp,
            rewards
        });
    } catch (error) {
        console.error('Add experience error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get level requirements (dynamic)
router.get('/requirements', authenticateToken, async (req, res) => {
    try {
        const [users] = await pool.query(
            'SELECT level, exp FROM users WHERE id = ?',
            [req.user.id]
        );
        if (users.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }
        const user = users[0];
        const [nextLevelRows] = await pool.query(
            'SELECT level, label, exp_required FROM level_rewards WHERE level = ?',
            [user.level + 1]
        );
        const nextLevel = nextLevelRows[0];
        let expForNextLevel = 0;
        let expNeeded = 0;
        let nextLabel = '';
        if (nextLevel) {
            expForNextLevel = nextLevel.exp_required;
            expNeeded = expForNextLevel - user.exp;
            nextLabel = nextLevel.label;
        }
        res.json({
            currentLevel: user.level,
            currentExp: user.exp,
            nextLevel: user.level + 1,
            nextLabel,
            expForNextLevel,
            expNeeded,
            progress: expForNextLevel ? (user.exp / expForNextLevel) * 100 : 100
        });
    } catch (error) {
        console.error('Get level requirements error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router; 
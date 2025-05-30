const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { verifyToken } = require('../middleware/auth');
const bcrypt = require('bcryptjs');
const { logUserActivity } = require('../middleware/activityLogger');

// Get user profile
router.get('/profile', verifyToken, async (req, res) => {
    try {
        const [users] = await pool.query(
            'SELECT id, username, email, level, exp, table_slots, first_name, last_name, phone, qoinz_balance, created_at FROM users WHERE id = ?',
            [req.user.id]
        );

        if (users.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json(users[0]);
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Update user profile
router.put('/profile', verifyToken, logUserActivity('update_profile'), async (req, res) => {
    try {
        const { username, email, first_name, last_name, phone } = req.body;

        // Check if username or email is already taken
        if (username || email) {
            const [existingUsers] = await pool.query(
                'SELECT * FROM users WHERE (username = ? OR email = ?) AND id != ?',
                [username, email, req.user.id]
            );

            if (existingUsers.length > 0) {
                return res.status(400).json({ message: 'Username or email already taken' });
            }
        }

        // Update user (now includes first_name, last_name, phone)
        await pool.query(
            'UPDATE users SET username = COALESCE(?, username), email = COALESCE(?, email), first_name = COALESCE(?, first_name), last_name = COALESCE(?, last_name), phone = COALESCE(?, phone) WHERE id = ?',
            [username, email, first_name, last_name, phone, req.user.id]
        );

        res.json({ message: 'Profile updated successfully' });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get user statistics
router.get('/stats', verifyToken, async (req, res) => {
    try {
        const [stats] = await pool.query(
            `SELECT 
                u.level,
                u.exp,
                u.table_slots,
                u.first_name,
                u.last_name,
                u.phone,
                u.qoinz_balance,
                COUNT(DISTINCT t.id) as total_tables,
                COUNT(DISTINCT CASE WHEN t.status = 'completed' THEN t.id END) as completed_tables,
                COUNT(DISTINCT ua.achievement_id) as achievements_unlocked
            FROM users u
            LEFT JOIN tables t ON u.id = t.owner_id
            LEFT JOIN user_achievements ua ON u.id = ua.user_id
            WHERE u.id = ?
            GROUP BY u.id`,
            [req.user.id]
        );

        if (stats.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json(stats[0]);
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Change password endpoint
router.post('/change-password', verifyToken, logUserActivity('change_password'), async (req, res) => {
    try {
        const { old_password, new_password } = req.body;
        if (!old_password || !new_password) {
            return res.status(400).json({ message: 'Old and new password are required.' });
        }

        // Get user
        const [users] = await pool.query(
            'SELECT password_hash FROM users WHERE id = ?',
            [req.user.id]
        );
        if (users.length === 0) {
            return res.status(404).json({ message: 'User not found.' });
        }

        // Validate old password
        const isMatch = await bcrypt.compare(old_password, users[0].password_hash);
        if (!isMatch) {
            return res.status(400).json({ message: 'Old password is incorrect.' });
        }

        // Hash new password
        const salt = await bcrypt.genSalt(10);
        const newHash = await bcrypt.hash(new_password, salt);

        // Update password
        await pool.query(
            'UPDATE users SET password_hash = ? WHERE id = ?',
            [newHash, req.user.id]
        );

        res.json({ message: 'Password changed successfully.' });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router; 
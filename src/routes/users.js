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
            `SELECT 
                id, username, email, level, exp, branch_slots, active_branches,
                first_name, last_name, phone, qoinz_balance, referral_code,
                total_referrals, total_qoinz_earned, branch_completion_count,
                total_exp_earned, last_activity, status, role, created_at
            FROM users WHERE id = ?`,
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
        const { 
            username, email, first_name, last_name, phone,
            status, role 
        } = req.body;

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

        // Update user
        await pool.query(
            `UPDATE users SET 
                username = COALESCE(?, username),
                email = COALESCE(?, email),
                first_name = COALESCE(?, first_name),
                last_name = COALESCE(?, last_name),
                phone = COALESCE(?, phone),
                status = COALESCE(?, status),
                role = COALESCE(?, role),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
            [username, email, first_name, last_name, phone, status, role, req.user.id]
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
                u.branch_slots,
                u.active_branches,
                u.first_name,
                u.last_name,
                u.phone,
                u.qoinz_balance,
                u.referral_code,
                u.total_referrals,
                u.total_qoinz_earned,
                u.branch_completion_count,
                u.total_exp_earned,
                u.last_activity,
                u.status,
                u.role,
                COUNT(DISTINCT b.id) as total_branches,
                COUNT(DISTINCT CASE WHEN b.is_completed = 1 THEN b.id END) as completed_branches,
                COUNT(DISTINCT ua.achievement_id) as achievements_unlocked,
                COUNT(DISTINCT r.id) as total_referrals_made,
                SUM(CASE WHEN wt.type = 'referral' THEN wt.amount ELSE 0 END) as referral_earnings
            FROM users u
            LEFT JOIN branches b ON u.id = b.owner_id
            LEFT JOIN user_achievements ua ON u.id = ua.user_id
            LEFT JOIN referrals r ON u.id = r.inviter_id
            LEFT JOIN wallet_transactions wt ON u.id = wt.user_id
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

// Get user's referral network
router.get('/referral-network', verifyToken, async (req, res) => {
    try {
        const [network] = await pool.query(
            `WITH RECURSIVE referral_tree AS (
                SELECT 
                    u.id, u.username, u.level, u.referral_code,
                    r.inviter_id, 1 as depth
                FROM users u
                LEFT JOIN referrals r ON u.id = r.invitee_id
                WHERE u.id = ?
                
                UNION ALL
                
                SELECT 
                    u.id, u.username, u.level, u.referral_code,
                    r.inviter_id, rt.depth + 1
                FROM users u
                JOIN referrals r ON u.id = r.invitee_id
                JOIN referral_tree rt ON r.inviter_id = rt.id
                WHERE rt.depth < 5
            )
            SELECT * FROM referral_tree
            ORDER BY depth, id`,
            [req.user.id]
        );

        res.json(network);
    } catch (error) {
        console.error('Get referral network error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get user's branch performance
router.get('/branch-performance', verifyToken, async (req, res) => {
    try {
        const [performance] = await pool.query(
            `SELECT 
                b.id as branch_id,
                b.branch_number,
                b.member_count,
                b.is_completed,
                b.completion_date,
                COUNT(DISTINCT r.id) as total_referrals,
                DATEDIFF(b.completion_date, b.created_at) as days_to_completion
            FROM branches b
            LEFT JOIN referrals r ON b.id = r.branch_id
            WHERE b.owner_id = ?
            GROUP BY b.id
            ORDER BY b.created_at DESC`,
            [req.user.id]
        );

        res.json(performance);
    } catch (error) {
        console.error('Get branch performance error:', error);
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
const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// Get user's branches
router.get('/', authenticateToken, async (req, res) => {
    try {
        const [branches] = await pool.query(
            'SELECT * FROM branches WHERE owner_id = ? ORDER BY created_at DESC',
            [req.user.id]
        );

        res.json(branches);
    } catch (error) {
        console.error('Get branches error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Create new branch
router.post('/', authenticateToken, async (req, res) => {
    try {
        // Check if user has reached max branches
        const [user] = await pool.query(
            'SELECT branch_slots, active_branches FROM users WHERE id = ?',
            [req.user.id]
        );

        const [branchCount] = await pool.query(
            'SELECT COUNT(*) as count FROM branches WHERE owner_id = ?',
            [req.user.id]
        );

        if (branchCount[0].count >= user[0].branch_slots) {
            return res.status(400).json({ message: 'Maximum number of branches reached' });
        }

        // Increment active_branches
        await pool.query(
            'UPDATE users SET active_branches = active_branches + 1 WHERE id = ?',
            [req.user.id]
        );

        // Create new branch
        const [result] = await pool.query(
            'INSERT INTO branches (owner_id, branch_number) VALUES (?, ?)',
            [req.user.id, branchCount[0].count + 1]
        );

        res.status(201).json({
            message: 'Branch created successfully',
            branchId: result.insertId
        });
    } catch (error) {
        console.error('Create branch error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get branch details
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const [branches] = await pool.query(
            `SELECT b.*, 
                COUNT(DISTINCT r.id) as total_referrals,
                GROUP_CONCAT(DISTINCT u.username) as member_usernames
            FROM branches b
            LEFT JOIN referrals r ON b.id = r.branch_id
            LEFT JOIN users u ON r.invitee_id = u.id
            WHERE b.id = ? AND b.owner_id = ?
            GROUP BY b.id`,
            [req.params.id, req.user.id]
        );

        if (branches.length === 0) {
            return res.status(404).json({ message: 'Branch not found' });
        }

        res.json(branches[0]);
    } catch (error) {
        console.error('Get branch details error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get branch activity log
router.get('/:id/activity', authenticateToken, async (req, res) => {
    try {
        // First verify the branch belongs to the user
        const [branches] = await pool.query(
            'SELECT id FROM branches WHERE id = ? AND owner_id = ?',
            [req.params.id, req.user.id]
        );

        if (branches.length === 0) {
            return res.status(404).json({ message: 'Branch not found' });
        }

        // Get activity logs for this branch
        const [activities] = await pool.query(
            `SELECT ual.*, u.username 
            FROM user_activity_logs ual
            JOIN users u ON ual.user_id = u.id
            WHERE ual.details->>'$.branch_id' = ?
            ORDER BY ual.timestamp DESC
            LIMIT 50`,
            [req.params.id]
        );

        res.json(activities);
    } catch (error) {
        console.error('Get branch activity error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get branch performance metrics
router.get('/:id/performance', authenticateToken, async (req, res) => {
    try {
        // First verify the branch belongs to the user
        const [branches] = await pool.query(
            'SELECT id FROM branches WHERE id = ? AND owner_id = ?',
            [req.params.id, req.user.id]
        );

        if (branches.length === 0) {
            return res.status(404).json({ message: 'Branch not found' });
        }

        // Get performance metrics from the view
        const [performance] = await pool.query(
            'SELECT * FROM branch_performance WHERE branch_id = ?',
            [req.params.id]
        );

        if (performance.length === 0) {
            return res.status(404).json({ message: 'Performance data not found' });
        }

        res.json(performance[0]);
    } catch (error) {
        console.error('Get branch performance error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get branch members statistics
router.get('/:id/members/stats', authenticateToken, async (req, res) => {
    try {
        // First verify the branch belongs to the user
        const [branches] = await pool.query(
            'SELECT id FROM branches WHERE id = ? AND owner_id = ?',
            [req.params.id, req.user.id]
        );

        if (branches.length === 0) {
            return res.status(404).json({ message: 'Branch not found' });
        }

        // Get detailed member statistics
        const [members] = await pool.query(
            `SELECT 
                u.id,
                u.username,
                u.level,
                u.exp,
                u.qoinz_balance,
                COUNT(DISTINCT r2.id) as total_referrals,
                COUNT(DISTINCT b2.id) as total_branches,
                COUNT(DISTINCT CASE WHEN b2.is_completed = 1 THEN b2.id END) as completed_branches
            FROM referrals r
            JOIN users u ON r.invitee_id = u.id
            LEFT JOIN referrals r2 ON u.id = r2.inviter_id
            LEFT JOIN branches b2 ON u.id = b2.owner_id
            WHERE r.branch_id = ?
            GROUP BY u.id`,
            [req.params.id]
        );

        res.json(members);
    } catch (error) {
        console.error('Get branch members stats error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get branch rewards history
router.get('/:id/rewards/history', authenticateToken, async (req, res) => {
    try {
        // First verify the branch belongs to the user
        const [branches] = await pool.query(
            'SELECT id FROM branches WHERE id = ? AND owner_id = ?',
            [req.params.id, req.user.id]
        );

        if (branches.length === 0) {
            return res.status(404).json({ message: 'Branch not found' });
        }

        // Get QOINZ rewards
        const [qoinzRewards] = await pool.query(
            `SELECT 
                wt.*,
                'qoinz' as reward_type
            FROM wallet_transactions wt
            WHERE wt.source_id = ? AND wt.type = 'milestone'`,
            [req.params.id]
        );

        // Get EXP rewards
        const [expRewards] = await pool.query(
            `SELECT 
                et.*,
                'exp' as reward_type
            FROM exp_transactions et
            WHERE et.source_id = ? AND et.source = 'branch_completion'`,
            [req.params.id]
        );

        // Combine and sort rewards
        const rewards = [...qoinzRewards, ...expRewards].sort((a, b) => 
            new Date(b.created_at) - new Date(a.created_at)
        );

        res.json(rewards);
    } catch (error) {
        console.error('Get branch rewards history error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router; 
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

module.exports = router; 
const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { verifyToken } = require('../middleware/auth');

// Get user's branches
router.get('/', verifyToken, async (req, res) => {
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
router.post('/', verifyToken, async (req, res) => {
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

        // Start transaction
        const connection = await pool.getConnection();
        await connection.beginTransaction();

        try {
            // Increment active_branches
            await connection.query(
                'UPDATE users SET active_branches = active_branches + 1 WHERE id = ?',
                [req.user.id]
            );

            // Create new branch
            const [result] = await connection.query(
                'INSERT INTO branches (owner_id, branch_number, max_members, auto_placement_enabled) VALUES (?, ?, 9, ?)',
                [req.user.id, branchCount[0].count + 1, req.body.auto_placement || false]
            );

            // Add owner as first member
            await connection.query(
                'INSERT INTO branch_members (branch_id, user_id, position) VALUES (?, ?, 1)',
                [result.insertId, req.user.id]
            );

            // Commit transaction
            await connection.commit();

            // Check for level up
            await connection.query('CALL check_level_up(?)', [req.user.id]);

            res.status(201).json({
                message: 'Branch created successfully',
                branchId: result.insertId
            });
        } catch (error) {
            // Rollback transaction on error
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Create branch error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get branch details
router.get('/:branchId', verifyToken, async (req, res) => {
    try {
        const { branchId } = req.params;

        // Get branch details with members
        const [branch] = await pool.query(
            `SELECT b.*, 
                    GROUP_CONCAT(bm.user_id) as member_ids,
                    GROUP_CONCAT(bm.position) as positions
             FROM branches b
             LEFT JOIN branch_members bm ON b.id = bm.branch_id
             WHERE b.id = ?
             GROUP BY b.id`,
            [branchId]
        );

        if (!branch[0]) {
            return res.status(404).json({ message: 'Branch not found' });
        }

        // Format response
        const formattedBranch = {
            ...branch[0],
            member_ids: branch[0].member_ids ? branch[0].member_ids.split(',').map(Number) : [],
            positions: branch[0].positions ? branch[0].positions.split(',').map(Number) : [],
            completion_rewards: JSON.parse(branch[0].completion_rewards || '{}')
        };

        res.json(formattedBranch);
    } catch (error) {
        console.error('Get branch error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Update branch settings
router.patch('/:branchId', verifyToken, async (req, res) => {
    try {
        const { branchId } = req.params;
        const { auto_placement_enabled } = req.body;

        // Check if user owns the branch
        const [branch] = await pool.query(
            'SELECT * FROM branches WHERE id = ? AND owner_id = ?',
            [branchId, req.user.id]
        );

        if (!branch[0]) {
            return res.status(404).json({ message: 'Branch not found or unauthorized' });
        }

        // Update branch settings
        await pool.query(
            'UPDATE branches SET auto_placement_enabled = ? WHERE id = ?',
            [auto_placement_enabled, branchId]
        );

        res.json({
            message: 'Branch settings updated successfully'
        });
    } catch (error) {
        console.error('Update branch error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Add member to branch
router.post('/:branchId/members', verifyToken, async (req, res) => {
    try {
        const { branchId } = req.params;
        const { userId, position } = req.body;

        // Start transaction
        const connection = await pool.getConnection();
        await connection.beginTransaction();

        try {
            // Check if branch exists and is not completed
            const [branch] = await connection.query(
                'SELECT * FROM branches WHERE id = ? AND is_completed = 0',
                [branchId]
            );

            if (!branch[0]) {
                throw new Error('Branch not found or already completed');
            }

            // Check if position is available
            const [existingMember] = await connection.query(
                'SELECT * FROM branch_members WHERE branch_id = ? AND position = ?',
                [branchId, position]
            );

            if (existingMember[0]) {
                throw new Error('Position already taken');
            }

            // Check if user is already in a branch
            const [userBranch] = await connection.query(
                'SELECT * FROM branch_members WHERE user_id = ?',
                [userId]
            );

            if (userBranch[0]) {
                throw new Error('User already in a branch');
            }

            // Add member to branch
            await connection.query(
                'INSERT INTO branch_members (branch_id, user_id, position) VALUES (?, ?, ?)',
                [branchId, userId, position]
            );

            // Get user details
            const [user] = await connection.query(
                'SELECT name, level FROM users WHERE id = ?',
                [userId]
            );

            // Update branch member count
            await connection.query(
                'UPDATE branches SET member_count = member_count + 1 WHERE id = ?',
                [branchId]
            );

            // Check for branch completion
            await connection.query('CALL check_branch_completion(?)', [branchId]);

            // Commit transaction
            await connection.commit();

            res.status(201).json({
                message: 'Member added successfully',
                name: user[0].name,
                level: user[0].level
            });
        } catch (error) {
            // Rollback transaction on error
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Add member error:', error);
        res.status(500).json({ message: error.message || 'Server error' });
    }
});

// Check branch completion
router.get('/:branchId/completion', verifyToken, async (req, res) => {
    try {
        const { branchId } = req.params;

        // Get branch details
        const [branch] = await pool.query(
            `SELECT b.*, 
                    COUNT(bm.id) as current_members,
                    GROUP_CONCAT(u.level) as member_levels
             FROM branches b
             LEFT JOIN branch_members bm ON b.id = bm.branch_id
             LEFT JOIN users u ON bm.user_id = u.id
             WHERE b.id = ?
             GROUP BY b.id`,
            [branchId]
        );

        if (!branch[0]) {
            return res.status(404).json({ message: 'Branch not found' });
        }

        const { current_members, member_levels, max_members } = branch[0];
        const levels = member_levels ? member_levels.split(',').map(Number) : [];
        const averageLevel = levels.length ? levels.reduce((a, b) => a + b, 0) / levels.length : 0;

        // Calculate rewards based on completion status
        const isCompleted = current_members >= max_members;
        const rewards = isCompleted ? {
            qoinz: Math.floor(averageLevel * 100), // Base QOINZ reward
            exp: Math.floor(averageLevel * 50)     // Base EXP reward
        } : null;

        // If completed, update branch status
        if (isCompleted && !branch[0].is_completed) {
            await pool.query(
                `UPDATE branches 
                 SET is_completed = 1,
                     completion_date = NOW(),
                     completion_rewards = ?
                 WHERE id = ?`,
                [JSON.stringify(rewards), branchId]
            );
        }

        res.json({
            is_completed: isCompleted,
            current_members,
            max_members,
            average_level: averageLevel,
            rewards
        });
    } catch (error) {
        console.error('Check branch completion error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Auto-place member
router.post('/:branchId/auto-place', verifyToken, async (req, res) => {
    try {
        const { branchId } = req.params;
        const { userId } = req.body;

        // Start transaction
        const connection = await pool.getConnection();
        await connection.beginTransaction();

        try {
            // Check if branch exists and is not completed
            const [branch] = await connection.query(
                'SELECT * FROM branches WHERE id = ? AND is_completed = 0',
                [branchId]
            );

            if (!branch[0]) {
                throw new Error('Branch not found or already completed');
            }

            // Check if user is already in a branch
            const [userBranch] = await connection.query(
                'SELECT * FROM branch_members WHERE user_id = ?',
                [userId]
            );

            if (userBranch[0]) {
                throw new Error('User already in a branch');
            }

            // Find next available position
            const [positions] = await connection.query(
                'SELECT position FROM branch_members WHERE branch_id = ? ORDER BY position',
                [branchId]
            );

            const takenPositions = positions.map(p => p.position);
            const nextPosition = Array.from({ length: 9 }, (_, i) => i + 1)
                .find(pos => !takenPositions.includes(pos));

            if (!nextPosition) {
                throw new Error('No available positions in branch');
            }

            // Add member to branch
            await connection.query(
                'INSERT INTO branch_members (branch_id, user_id, position) VALUES (?, ?, ?)',
                [branchId, userId, nextPosition]
            );

            // Get user details
            const [user] = await connection.query(
                'SELECT name, level FROM users WHERE id = ?',
                [userId]
            );

            // Update branch member count
            await connection.query(
                'UPDATE branches SET member_count = member_count + 1 WHERE id = ?',
                [branchId]
            );

            // Check for branch completion
            await connection.query('CALL check_branch_completion(?)', [branchId]);

            // Commit transaction
            await connection.commit();

            res.status(201).json({
                message: 'Member auto-placed successfully',
                position: nextPosition,
                name: user[0].name,
                level: user[0].level
            });
        } catch (error) {
            // Rollback transaction on error
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Auto-place member error:', error);
        res.status(500).json({ message: error.message || 'Server error' });
    }
});

// Get branch rewards
router.get('/:branchId/rewards', verifyToken, async (req, res) => {
    try {
        const { branchId } = req.params;

        // Get branch rewards and completion status
        const [branch] = await pool.query(
            `SELECT b.*, 
                    b.completion_rewards,
                    b.completion_date,
                    COUNT(bm.id) as current_members,
                    GROUP_CONCAT(u.level) as member_levels
             FROM branches b
             LEFT JOIN branch_members bm ON b.id = bm.branch_id
             LEFT JOIN users u ON bm.user_id = u.id
             WHERE b.id = ? AND b.owner_id = ?
             GROUP BY b.id`,
            [branchId, req.user.id]
        );

        if (!branch[0]) {
            return res.status(404).json({ message: 'Branch not found or unauthorized' });
        }

        const rewards = branch[0].completion_rewards ? JSON.parse(branch[0].completion_rewards) : null;
        const levels = branch[0].member_levels ? branch[0].member_levels.split(',').map(Number) : [];
        const averageLevel = levels.length ? levels.reduce((a, b) => a + b, 0) / levels.length : 0;

        res.json({
            is_completed: branch[0].is_completed,
            completion_date: branch[0].completion_date,
            current_members: branch[0].current_members,
            average_level: averageLevel,
            rewards,
            rewards_claimed: branch[0].rewards_claimed || false
        });
    } catch (error) {
        console.error('Get branch rewards error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Claim branch rewards
router.post('/:branchId/rewards/claim', verifyToken, async (req, res) => {
    try {
        const { branchId } = req.params;

        // Start transaction
        const connection = await pool.getConnection();
        await connection.beginTransaction();

        try {
            // Get branch details and check ownership
            const [branch] = await connection.query(
                `SELECT * FROM branches 
                 WHERE id = ? AND owner_id = ? AND is_completed = 1 
                 AND (rewards_claimed = 0 OR rewards_claimed IS NULL)`,
                [branchId, req.user.id]
            );

            if (!branch[0]) {
                throw new Error('Branch not found, not completed, or rewards already claimed');
            }

            const rewards = JSON.parse(branch[0].completion_rewards);

            // Add rewards to user's balance
            await connection.query(
                'UPDATE users SET qoinz_balance = qoinz_balance + ?, exp = exp + ? WHERE id = ?',
                [rewards.qoinz, rewards.exp, req.user.id]
            );

            // Mark rewards as claimed
            await connection.query(
                'UPDATE branches SET rewards_claimed = 1 WHERE id = ?',
                [branchId]
            );

            // Log transaction
            await connection.query(
                `INSERT INTO wallet_transactions 
                 (user_id, amount, type, reason, reference_id) 
                 VALUES (?, ?, 'credit', 'branch_completion', ?)`,
                [req.user.id, rewards.qoinz, branchId]
            );

            // Log EXP transaction
            await connection.query(
                `INSERT INTO exp_transactions 
                 (user_id, amount, source, reference_id) 
                 VALUES (?, ?, 'branch_completion', ?)`,
                [req.user.id, rewards.exp, branchId]
            );

            // Check for level up
            await connection.query('CALL check_level_up(?)', [req.user.id]);

            // Commit transaction
            await connection.commit();

            res.json({
                message: 'Rewards claimed successfully',
                rewards
            });
        } catch (error) {
            // Rollback transaction on error
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Claim branch rewards error:', error);
        res.status(500).json({ message: error.message || 'Server error' });
    }
});

// Get branch statistics
router.get('/:branchId/stats', verifyToken, async (req, res) => {
    try {
        const { branchId } = req.params;

        // Get branch statistics
        const [stats] = await pool.query(
            `SELECT 
                b.*,
                COUNT(bm.id) as total_members,
                AVG(u.level) as average_level,
                MIN(u.level) as min_level,
                MAX(u.level) as max_level,
                SUM(CASE WHEN u.level >= 3 THEN 1 ELSE 0 END) as high_level_members,
                GROUP_CONCAT(DISTINCT u.id) as member_ids
             FROM branches b
             LEFT JOIN branch_members bm ON b.id = bm.branch_id
             LEFT JOIN users u ON bm.user_id = u.id
             WHERE b.id = ? AND b.owner_id = ?
             GROUP BY b.id`,
            [branchId, req.user.id]
        );

        if (!stats[0]) {
            return res.status(404).json({ message: 'Branch not found or unauthorized' });
        }

        // Get member activity stats
        const [activity] = await pool.query(
            `SELECT 
                COUNT(DISTINCT ual.user_id) as active_members,
                COUNT(DISTINCT CASE WHEN ual.action_type = 'referral' THEN ual.user_id END) as members_with_referrals
             FROM user_activity_log ual
             WHERE ual.user_id IN (${stats[0].member_ids || '0'})
             AND ual.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`
        );

        res.json({
            branch_number: stats[0].branch_number,
            total_members: stats[0].total_members,
            average_level: parseFloat(stats[0].average_level) || 0,
            min_level: stats[0].min_level || 0,
            max_level: stats[0].max_level || 0,
            high_level_members: stats[0].high_level_members || 0,
            is_completed: stats[0].is_completed,
            completion_date: stats[0].completion_date,
            active_members: activity[0].active_members || 0,
            members_with_referrals: activity[0].members_with_referrals || 0,
            completion_rewards: JSON.parse(stats[0].completion_rewards || '{}')
        });
    } catch (error) {
        console.error('Get branch stats error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get branch network visualization data
router.get('/:branchId/network', verifyToken, async (req, res) => {
    try {
        const { branchId } = req.params;

        // Get branch network data
        const [network] = await pool.query(
            `WITH RECURSIVE branch_tree AS (
                -- Base case: get the root branch
                SELECT 
                    b.id, b.branch_number, b.owner_id, b.is_completed,
                    u.username as owner_name, u.level as owner_level,
                    0 as depth
                FROM branches b
                JOIN users u ON b.owner_id = u.id
                WHERE b.id = ?

                UNION ALL

                -- Recursive case: get child branches
                SELECT 
                    b.id, b.branch_number, b.owner_id, b.is_completed,
                    u.username as owner_name, u.level as owner_level,
                    bt.depth + 1
                FROM branches b
                JOIN users u ON b.owner_id = u.id
                JOIN branch_members bm ON b.owner_id = bm.user_id
                JOIN branch_tree bt ON bm.branch_id = bt.id
                WHERE bt.depth < 3  -- Limit depth to 3 levels
            )
            SELECT * FROM branch_tree
            ORDER BY depth, branch_number`,
            [branchId]
        );

        // Get member data for each branch
        const branchesWithMembers = await Promise.all(network.map(async (branch) => {
            const [members] = await pool.query(
                `SELECT 
                    u.id, u.username, u.level,
                    bm.position
                 FROM branch_members bm
                 JOIN users u ON bm.user_id = u.id
                 WHERE bm.branch_id = ?
                 ORDER BY bm.position`,
                [branch.id]
            );

            return {
                ...branch,
                members: members.map(m => ({
                    id: m.id,
                    name: m.username,
                    level: m.level,
                    position: m.position
                }))
            };
        }));

        res.json(branchesWithMembers);
    } catch (error) {
        console.error('Get branch network error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router; 
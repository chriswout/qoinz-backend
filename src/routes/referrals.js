const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { checkAndHandleLevelUp } = require('../utils/leveling');
const { handleAutoPlacement } = require('../utils/branchPlacement');
const { logUserActivity } = require('../middleware/activityLogger');

// Generate referral code
router.post('/generate', authenticateToken, async (req, res) => {
    try {
        // Get user's current referrals count
        const [referrals] = await pool.query(
            'SELECT COUNT(*) as count FROM referrals WHERE inviter_id = ?',
            [req.user.id]
        );

        // Get user's max branches
        const [users] = await pool.query(
            'SELECT branch_slots FROM users WHERE id = ?',
            [req.user.id]
        );

        if (users.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        const maxBranches = users[0].branch_slots;
        const currentReferrals = referrals[0].count;

        if (currentReferrals >= maxBranches) {
            return res.status(400).json({ 
                message: 'You have reached your maximum number of referrals',
                maxBranches,
                currentReferrals
            });
        }

        // Generate a unique referral code based on user ID
        const referralCode = `REF${req.user.id}${Date.now().toString(36).toUpperCase()}`;

        res.json({
            code: referralCode,
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
            remaining_slots: maxBranches - currentReferrals
        });
    } catch (error) {
        console.error('Generate referral code error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get user's referrals
router.get('/', authenticateToken, async (req, res) => {
    try {
        const [referrals] = await pool.query(
            `SELECT r.*, 
                u.username as invitee_username,
                u.email as invitee_email,
                u.level as invitee_level
            FROM referrals r
            JOIN users u ON r.invitee_id = u.id
            WHERE r.inviter_id = ?
            ORDER BY r.created_at DESC`,
            [req.user.id]
        );

        res.json(referrals);
    } catch (error) {
        console.error('Get referrals error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Create new referral
router.post('/', authenticateToken, logUserActivity('create_referral'), async (req, res) => {
    try {
        const { invitee_id, branch_id } = req.body;

        // Check if invitee exists
        const [invitees] = await pool.query(
            'SELECT id FROM users WHERE id = ?',
            [invitee_id]
        );

        if (invitees.length === 0) {
            return res.status(404).json({ message: 'Invitee not found' });
        }

        // Check if user has any available branches
        const [userBranches] = await pool.query(
            `SELECT COUNT(*) as count 
            FROM branches 
            WHERE owner_id = ? AND member_count < 9 AND is_completed = 0`,
            [req.user.id]
        );

        // If no available branches, try auto-placement
        if (userBranches[0].count === 0) {
            try {
                const placementResult = await handleAutoPlacement(req.user.id, invitee_id);
                
                // Check for level up after getting EXP for helping
                const levelUpResult = await checkAndHandleLevelUp(req.user.id);

                res.status(201).json({
                    message: 'Referral auto-placed successfully',
                    placement: placementResult,
                    levelUp: levelUpResult.leveledUp ? levelUpResult : undefined
                });
                return;
            } catch (error) {
                if (error.message === 'No suitable downline found for placement') {
                    return res.status(400).json({ 
                        message: 'No available branches and no suitable downline found for placement'
                    });
                }
                throw error;
            }
        }

        // If branch_id is provided, verify it belongs to user
        if (branch_id) {
            const [branches] = await pool.query(
                'SELECT id FROM branches WHERE id = ? AND owner_id = ? AND member_count < 9 AND is_completed = 0',
                [branch_id, req.user.id]
            );

            if (branches.length === 0) {
                return res.status(404).json({ message: 'Branch not found or not available' });
            }
        }

        // Check if referral already exists
        const [existingReferrals] = await pool.query(
            'SELECT id FROM referrals WHERE invitee_id = ?',
            [invitee_id]
        );

        if (existingReferrals.length > 0) {
            return res.status(400).json({ message: 'Referral already exists' });
        }

        // Start transaction
        await pool.query('START TRANSACTION');

        try {
            // If no branch_id provided, find or create a branch
            let finalBranchId = branch_id;
            if (!finalBranchId) {
                const [availableBranches] = await pool.query(
                    `SELECT id FROM branches 
                    WHERE owner_id = ? AND member_count < 9 AND is_completed = 0
                    ORDER BY member_count ASC
                    LIMIT 1`,
                    [req.user.id]
                );

                if (availableBranches.length === 0) {
                    // Create new branch
                    const [result] = await pool.query(
                        'INSERT INTO branches (owner_id, branch_number) VALUES (?, 1)',
                        [req.user.id]
                    );
                    finalBranchId = result.insertId;

                    // Increment active_branches
                    await pool.query(
                        'UPDATE users SET active_branches = active_branches + 1 WHERE id = ?',
                        [req.user.id]
                    );
                } else {
                    finalBranchId = availableBranches[0].id;
                }
            }

            // Create referral
            const [result] = await pool.query(
                'INSERT INTO referrals (inviter_id, invitee_id, branch_id) VALUES (?, ?, ?)',
                [req.user.id, invitee_id, finalBranchId]
            );

            // Add referral bonus to referrer's Qoinz balance
            const referralBonus = 100; // Amount of QOINZ to award for referral
            await pool.query(
                'UPDATE users SET qoinz_balance = qoinz_balance + ? WHERE id = ?',
                [referralBonus, req.user.id]
            );

            // Record transaction
            await pool.query(
                'INSERT INTO wallet_transactions (user_id, amount, type, source_id) VALUES (?, ?, ?, ?)',
                [req.user.id, referralBonus, 'referral', result.insertId]
            );

            // Update branch member count
            await pool.query(
                'UPDATE branches SET member_count = member_count + 1 WHERE id = ?',
                [finalBranchId]
            );

            // Check if branch is now complete (9 members)
            const [branchStatus] = await pool.query(
                'SELECT member_count, is_completed FROM branches WHERE id = ?',
                [finalBranchId]
            );

            if (branchStatus[0].member_count === 9 && !branchStatus[0].is_completed) {
                // Mark branch as completed
                await pool.query(
                    'UPDATE branches SET is_completed = 1, completed_at = CURRENT_TIMESTAMP WHERE id = ?',
                    [finalBranchId]
                );

                // Award QOINZ to branch owner (4.5 QOINZ)
                const branchCompletionBonus = 4.5;
                await pool.query(
                    'UPDATE users SET qoinz_balance = qoinz_balance + ? WHERE id = ?',
                    [branchCompletionBonus, req.user.id]
                );

                // Record QOINZ transaction
                await pool.query(
                    'INSERT INTO wallet_transactions (user_id, amount, type, source_id) VALUES (?, ?, ?, ?)',
                    [req.user.id, branchCompletionBonus, 'branch_completion', finalBranchId]
                );

                // Award EXP to branch owner (4.5 EXP)
                const expBonus = 4.5;
                await pool.query(
                    'UPDATE users SET exp = exp + ? WHERE id = ?',
                    [expBonus, req.user.id]
                );

                // Record EXP transaction
                await pool.query(
                    'INSERT INTO exp_transactions (user_id, amount, type, source_id) VALUES (?, ?, ?, ?)',
                    [req.user.id, expBonus, 'branch_completion', finalBranchId]
                );

                // Check for level up
                const levelUpResult = await checkAndHandleLevelUp(req.user.id);

                // Decrement active_branches count
                await pool.query(
                    'UPDATE users SET active_branches = active_branches - 1 WHERE id = ?',
                    [req.user.id]
                );

                await pool.query('COMMIT');

                // Add level up info to response if user leveled up
                if (levelUpResult.leveledUp) {
                    res.status(201).json({
                        message: 'Referral created successfully',
                        referralId: result.insertId,
                        bonus: referralBonus,
                        branchCompleted: true,
                        branchCompletionBonus: branchCompletionBonus,
                        expBonus,
                        levelUp: levelUpResult
                    });
                    return;
                }

                res.status(201).json({
                    message: 'Referral created successfully',
                    referralId: result.insertId,
                    bonus: referralBonus,
                    branchCompleted: true,
                    branchCompletionBonus: branchCompletionBonus,
                    expBonus
                });
                return;
            }

            await pool.query('COMMIT');

            res.status(201).json({
                message: 'Referral created successfully',
                referralId: result.insertId,
                bonus: referralBonus
            });
        } catch (error) {
            await pool.query('ROLLBACK');
            throw error;
        }
    } catch (error) {
        console.error('Create referral error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get referral details
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const [referrals] = await pool.query(
            `SELECT r.*, 
                u1.username as inviter_username,
                u2.username as invitee_username,
                b.branch_number
            FROM referrals r
            JOIN users u1 ON r.inviter_id = u1.id
            JOIN users u2 ON r.invitee_id = u2.id
            JOIN branches b ON r.branch_id = b.id
            WHERE r.id = ? AND (r.inviter_id = ? OR r.invitee_id = ?)`,
            [req.params.id, req.user.id, req.user.id]
        );

        if (referrals.length === 0) {
            return res.status(404).json({ message: 'Referral not found' });
        }

        res.json(referrals[0]);
    } catch (error) {
        console.error('Get referral details error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router; 
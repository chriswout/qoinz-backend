const { pool } = require('../config/database');

// Calculate EXP needed for next level
const calculateExpForNextLevel = (currentLevel) => {
    // Base EXP for level 1 to 2 is 100
    // Each level requires 50% more EXP than the previous level
    return Math.floor(100 * Math.pow(1.5, currentLevel - 1));
};

// Check if user should level up and handle rewards
const checkAndHandleLevelUp = async (userId) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // Get user's current level and EXP
        const [users] = await connection.query(
            'SELECT level, exp FROM users WHERE id = ?',
            [userId]
        );

        if (users.length === 0) {
            throw new Error('User not found');
        }

        const user = users[0];
        const expForNextLevel = calculateExpForNextLevel(user.level);

        // Check if user has enough EXP to level up
        if (user.exp >= expForNextLevel) {
            const newLevel = user.level + 1;
            
            // Calculate new branch slots (1 slot per level)
            const newBranchSlots = newLevel;

            // Update user's level and branch slots
            await connection.query(
                'UPDATE users SET level = ?, branch_slots = ? WHERE id = ?',
                [newLevel, newBranchSlots, userId]
            );

            // Award level-up bonus (5 QOINZ per level)
            const levelUpBonus = 5;
            await connection.query(
                'UPDATE users SET qoinz_balance = qoinz_balance + ? WHERE id = ?',
                [levelUpBonus, userId]
            );

            // Record QOINZ transaction
            await connection.query(
                'INSERT INTO wallet_transactions (user_id, amount, type, source_id) VALUES (?, ?, ?, ?)',
                [userId, levelUpBonus, 'level_up', newLevel]
            );

            // Check for level-up achievements
            await checkLevelUpAchievements(userId, newLevel, connection);

            await connection.commit();
            return {
                leveledUp: true,
                newLevel,
                newBranchSlots,
                levelUpBonus
            };
        }

        await connection.commit();
        return {
            leveledUp: false,
            currentLevel: user.level,
            expForNextLevel,
            currentExp: user.exp
        };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

// Check and award level-up achievements
const checkLevelUpAchievements = async (userId, newLevel, connection) => {
    // Define level-up achievements
    const levelAchievements = [
        { level: 5, name: 'Rising Star', description: 'Reached level 5' },
        { level: 10, name: 'Branch Master', description: 'Reached level 10' },
        { level: 20, name: 'Qoinz Veteran', description: 'Reached level 20' },
        { level: 50, name: 'Qoinz Legend', description: 'Reached level 50' }
    ];

    // Check if user has reached any level achievements
    for (const achievement of levelAchievements) {
        if (newLevel === achievement.level) {
            // Check if user already has this achievement
            const [existing] = await connection.query(
                'SELECT id FROM user_achievements WHERE user_id = ? AND achievement_id IN (SELECT id FROM achievements WHERE name = ?)',
                [userId, achievement.name]
            );

            if (existing.length === 0) {
                // Get achievement ID
                const [achievements] = await connection.query(
                    'SELECT id FROM achievements WHERE name = ?',
                    [achievement.name]
                );

                if (achievements.length > 0) {
                    // Award achievement
                    await connection.query(
                        'INSERT INTO user_achievements (user_id, achievement_id, unlocked_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
                        [userId, achievements[0].id]
                    );
                }
            }
        }
    }
};

module.exports = {
    calculateExpForNextLevel,
    checkAndHandleLevelUp
}; 
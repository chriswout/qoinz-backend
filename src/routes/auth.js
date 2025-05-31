const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');
const crypto = require('crypto');
const { logUserActivity } = require('../middleware/activityLogger');

// Validation middleware
const registerValidation = [
    body('username').trim().isLength({ min: 3 }).escape(),
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
    body('voucher_code').optional().trim()
];

const loginValidation = [
    body('email').isEmail().normalizeEmail(),
    body('password').exists()
];

const refreshTokenValidation = [
    body('refresh_token').exists()
];

// Generate tokens
const generateTokens = (userId) => {
    const accessToken = jwt.sign(
        { id: userId },
        process.env.JWT_SECRET || 'qoinz_secret_key_2024',
        { expiresIn: '15m' } // Access token expires in 15 minutes
    );

    const refreshToken = crypto.randomBytes(40).toString('hex');
    const refreshTokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    return {
        accessToken,
        refreshToken,
        refreshTokenExpiry
    };
};

// Store refresh token
const storeRefreshToken = async (userId, refreshToken, expiry) => {
    await pool.query(
        'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
        [userId, refreshToken, expiry]
    );
};

// Register route
router.post('/register', registerValidation, logUserActivity('register'), async (req, res) => {
    try {
        const { username, email, password, voucher_code } = req.body;

        // Check if user exists
        const [existingUsers] = await pool.query(
            'SELECT * FROM users WHERE email = ? OR username = ?',
            [email, username]
        );

        if (existingUsers.length > 0) {
            return res.status(400).json({ message: 'User already exists' });
        }

        // Validate voucher if provided
        let inviterId = null;
        if (voucher_code) {
            const [vouchers] = await pool.query(
                'SELECT * FROM vouchers WHERE code = ? AND status = ?',
                [voucher_code, 'issued']
            );

            if (vouchers.length === 0) {
                return res.status(400).json({ message: 'Invalid voucher code' });
            }
            inviterId = vouchers[0].inviter_id || null; // assuming inviter_id is stored on voucher
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create user
        const [result] = await pool.query(
            'INSERT INTO users (username, email, password_hash, voucher_code_used) VALUES (?, ?, ?, ?)',
            [username, email, hashedPassword, voucher_code || null]
        );

        // If voucher was used, mark it as redeemed and split QOINZ
        if (voucher_code) {
            await pool.query(
                'UPDATE vouchers SET status = ?, redeemed_by = ?, redeemed_at = CURRENT_TIMESTAMP WHERE code = ?',
                ['redeemed', result.insertId, voucher_code]
            );

            // QOINZ split
            const totalQoinz = 1;
            const inviterQoinz = 0.5;
            const houseQoinz = 0.3;
            const charityQoinz = 0.2;
            const houseUserId = 1;
            const charityUserId = 3;

            // Award to inviter if exists
            if (inviterId) {
                await pool.query(
                    'UPDATE users SET qoinz_balance = qoinz_balance + ? WHERE id = ?',
                    [inviterQoinz, inviterId]
                );
                await pool.query(
                    'INSERT INTO wallet_transactions (user_id, amount, type, source_id) VALUES (?, ?, ?, ?)',
                    [inviterId, inviterQoinz, 'voucher_split_inviter', result.insertId]
                );
            }
            // Award to house
            await pool.query(
                'UPDATE users SET qoinz_balance = qoinz_balance + ? WHERE id = ?',
                [houseQoinz, houseUserId]
            );
            await pool.query(
                'INSERT INTO wallet_transactions (user_id, amount, type, source_id) VALUES (?, ?, ?, ?)',
                [houseUserId, houseQoinz, 'voucher_split_house', result.insertId]
            );
            // Award to charity
            await pool.query(
                'UPDATE users SET qoinz_balance = qoinz_balance + ? WHERE id = ?',
                [charityQoinz, charityUserId]
            );
            await pool.query(
                'INSERT INTO wallet_transactions (user_id, amount, type, source_id) VALUES (?, ?, ?, ?)',
                [charityUserId, charityQoinz, 'voucher_split_charity', result.insertId]
            );
        }

        // Generate tokens
        const { accessToken, refreshToken, refreshTokenExpiry } = generateTokens(result.insertId);
        await storeRefreshToken(result.insertId, refreshToken, refreshTokenExpiry);

        res.status(201).json({
            message: 'User registered successfully',
            token: accessToken,
            refresh_token: refreshToken,
            user: {
                id: result.insertId,
                username,
                email,
                level: 1,
                exp: 0,
                first_name: null,
                last_name: null,
                phone: null,
                qoinz_balance: 0
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Login route
router.post('/login', loginValidation, logUserActivity('login'), async (req, res) => {
    try {
        const { email, password } = req.body;

        // Get user
        const [users] = await pool.query(
            'SELECT * FROM users WHERE email = ?',
            [email]
        );

        if (users.length === 0) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        const user = users[0];

        // Validate password
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        // Generate tokens
        const { accessToken, refreshToken, refreshTokenExpiry } = generateTokens(user.id);
        await storeRefreshToken(user.id, refreshToken, refreshTokenExpiry);

        res.json({
            message: 'Login successful',
            token: accessToken,
            refresh_token: refreshToken,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                level: user.level,
                exp: user.exp,
                first_name: user.first_name,
                last_name: user.last_name,
                phone: user.phone,
                qoinz_balance: user.qoinz_balance
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Refresh token route
router.post('/refresh', refreshTokenValidation, async (req, res) => {
    try {
        const { refresh_token } = req.body;

        // Find refresh token
        const [tokens] = await pool.query(
            'SELECT * FROM refresh_tokens WHERE token = ? AND expires_at > NOW()',
            [refresh_token]
        );

        if (tokens.length === 0) {
            return res.status(401).json({ message: 'Invalid refresh token' });
        }

        const token = tokens[0];

        // Generate new tokens
        const { accessToken, refreshToken, refreshTokenExpiry } = generateTokens(token.user_id);

        // Delete old refresh token
        await pool.query('DELETE FROM refresh_tokens WHERE token = ?', [refresh_token]);

        // Store new refresh token
        await storeRefreshToken(token.user_id, refreshToken, refreshTokenExpiry);

        res.json({
            token: accessToken,
            refresh_token: refreshToken
        });
    } catch (error) {
        console.error('Token refresh error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Logout route
router.post('/logout', logUserActivity('logout'), async (req, res) => {
    try {
        const { refresh_token } = req.body;
        await pool.query('DELETE FROM refresh_tokens WHERE token = ?', [refresh_token]);
        res.json({ message: 'Logged out successfully' });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router; 
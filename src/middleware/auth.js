const jwt = require('jsonwebtoken');
const { ApiError } = require('./errorHandler');
const { executeQuery, pool } = require('../config/database');

// Verify JWT token
const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ message: 'No token provided' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'qoinz_secret_key_2024');

        // Get user from database
        const [users] = await pool.query(
            'SELECT * FROM users WHERE id = ?',
            [decoded.id]
        );

        if (users.length === 0) {
            return res.status(401).json({ message: 'User not found' });
        }

        req.user = users[0];
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'Token expired' });
        }
        return res.status(401).json({ message: 'Invalid token' });
    }
};

// Check if user has required role
const checkRole = (roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ message: 'Not authenticated' });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        next();
    };
};

// Check if user has required level
function requireLevel(minLevel) {
    return (req, res, next) => {
        if (!req.user) {
            return next(new ApiError('AUTH_REQUIRED', 'Authentication required'));
        }

        if (req.user.level < minLevel) {
            return next(new ApiError('LEVEL_REQUIRED', `Minimum level ${minLevel} required`));
        }

        next();
    };
}

// Check if user owns the resource
async function checkOwnership(table, idField = 'id') {
    return async (req, res, next) => {
        try {
            const resourceId = req.params[idField];
            const userId = req.user.id;

            const result = await executeQuery(
                `SELECT * FROM ${table} WHERE ${idField} = ? AND user_id = ?`,
                [resourceId, userId]
            );

            if (!result || result.length === 0) {
                throw new ApiError('FORBIDDEN', 'You do not have permission to access this resource');
            }

            req.resource = result[0];
            next();
        } catch (error) {
            next(error);
        }
    };
}

// Check if user has enough QOINZ balance
async function checkBalance(requiredAmount) {
    return async (req, res, next) => {
        try {
            const userId = req.user.id;

            const result = await executeQuery(
                'SELECT qoinz_balance FROM users WHERE id = ?',
                [userId]
            );

            if (!result || result.length === 0) {
                throw new ApiError('USER_NOT_FOUND', 'User not found');
            }

            if (result[0].qoinz_balance < requiredAmount) {
                throw new ApiError('INSUFFICIENT_BALANCE', 'Insufficient QOINZ balance');
            }

            next();
        } catch (error) {
            next(error);
        }
    };
}

module.exports = {
    authenticateToken,
    checkRole,
    requireLevel,
    checkOwnership,
    checkBalance
}; 
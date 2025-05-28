const jwt = require('jsonwebtoken');
const { ApiError } = require('./errorHandler');
const { executeQuery, pool } = require('../config/database');

// Verify JWT token
const authenticateToken = async (req, res, next) => {
    console.log('🔒 Authentication middleware called:', {
        path: req.path,
        method: req.method,
        headers: {
            authorization: req.headers.authorization ? 'Bearer [REDACTED]' : 'none',
            'user-agent': req.headers['user-agent']
        }
    });

    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            console.log('❌ No token provided in request');
            return res.status(401).json({ message: 'No token provided' });
        }

        const token = authHeader.split(' ')[1];
        console.log('🔑 Attempting to verify token');
        
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'qoinz_secret_key_2024');
        console.log('✅ Token verified, user ID:', decoded.id);

        // Get user from database
        const [users] = await pool.query(
            'SELECT * FROM users WHERE id = ?',
            [decoded.id]
        );

        if (users.length === 0) {
            console.log('❌ User not found in database:', decoded.id);
            return res.status(401).json({ message: 'User not found' });
        }

        console.log('✅ User authenticated:', {
            id: users[0].id,
            username: users[0].username,
            role: users[0].role
        });

        req.user = users[0];
        next();
    } catch (error) {
        console.error('❌ Authentication error:', {
            name: error.name,
            message: error.message,
            stack: error.stack
        });

        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'Token expired' });
        }
        return res.status(401).json({ message: 'Invalid token' });
    }
};

// Check if user has required role
const checkRole = (roles) => {
    return (req, res, next) => {
        console.log('👮 Role check:', {
            path: req.path,
            userRole: req.user?.role,
            requiredRoles: roles
        });

        if (!req.user) {
            console.log('❌ No user object found in request');
            return res.status(401).json({ message: 'Not authenticated' });
        }

        if (!roles.includes(req.user.role)) {
            console.log('❌ User role not authorized:', {
                userRole: req.user.role,
                requiredRoles: roles
            });
            return res.status(403).json({ message: 'Not authorized' });
        }

        console.log('✅ Role check passed');
        next();
    };
};

// Check if user has required level
function requireLevel(minLevel) {
    return (req, res, next) => {
        console.log('📊 Level check:', {
            path: req.path,
            userLevel: req.user?.level,
            requiredLevel: minLevel
        });

        if (!req.user) {
            console.log('❌ No user object found in request');
            return next(new ApiError('AUTH_REQUIRED', 'Authentication required'));
        }

        if (req.user.level < minLevel) {
            console.log('❌ User level too low:', {
                userLevel: req.user.level,
                requiredLevel: minLevel
            });
            return next(new ApiError('LEVEL_REQUIRED', `Minimum level ${minLevel} required`));
        }

        console.log('✅ Level check passed');
        next();
    };
}

// Check if user owns the resource
async function checkOwnership(table, idField = 'id') {
    return async (req, res, next) => {
        console.log('🔑 Ownership check:', {
            path: req.path,
            table,
            idField,
            resourceId: req.params[idField],
            userId: req.user?.id
        });

        try {
            const resourceId = req.params[idField];
            const userId = req.user.id;

            const result = await executeQuery(
                `SELECT * FROM ${table} WHERE ${idField} = ? AND user_id = ?`,
                [resourceId, userId]
            );

            if (!result || result.length === 0) {
                console.log('❌ Resource ownership check failed');
                throw new ApiError('FORBIDDEN', 'You do not have permission to access this resource');
            }

            console.log('✅ Ownership check passed');
            req.resource = result[0];
            next();
        } catch (error) {
            console.error('❌ Ownership check error:', error);
            next(error);
        }
    };
}

// Check if user has enough QOINZ balance
async function checkBalance(requiredAmount) {
    return async (req, res, next) => {
        console.log('💰 Balance check:', {
            path: req.path,
            userId: req.user?.id,
            requiredAmount
        });

        try {
            const userId = req.user.id;

            const result = await executeQuery(
                'SELECT qoinz_balance FROM users WHERE id = ?',
                [userId]
            );

            if (!result || result.length === 0) {
                console.log('❌ User not found for balance check');
                throw new ApiError('USER_NOT_FOUND', 'User not found');
            }

            if (result[0].qoinz_balance < requiredAmount) {
                console.log('❌ Insufficient balance:', {
                    currentBalance: result[0].qoinz_balance,
                    requiredAmount
                });
                throw new ApiError('INSUFFICIENT_BALANCE', 'Insufficient QOINZ balance');
            }

            console.log('✅ Balance check passed');
            next();
        } catch (error) {
            console.error('❌ Balance check error:', error);
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
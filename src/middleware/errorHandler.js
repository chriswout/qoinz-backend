const winston = require('winston');

// Configure logger
const logger = winston.createLogger({
    level: 'error',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'error.log' })
    ]
});

// Custom error class for API errors
class ApiError extends Error {
    constructor(code, message, details = null) {
        super(message);
        this.code = code;
        this.details = details;
        this.status = this.getStatusFromCode(code);
    }

    getStatusFromCode(code) {
        const statusMap = {
            'AUTH_REQUIRED': 401,
            'INVALID_TOKEN': 401,
            'INVALID_CREDENTIALS': 401,
            'USER_EXISTS': 409,
            'INVALID_VOUCHER': 400,
            'INVALID_REFERRAL': 400,
            'BRANCH_LIMIT': 400,
            'INSUFFICIENT_BALANCE': 400,
            'VALIDATION_ERROR': 400,
            'SERVER_ERROR': 500
        };
        return statusMap[code] || 500;
    }
}

// Error handler middleware
function errorHandler(err, req, res, next) {
    // Log error
    logger.error({
        message: err.message,
        code: err.code,
        stack: err.stack,
        path: req.path,
        method: req.method,
        ip: req.ip
    });

    // Handle API errors
    if (err instanceof ApiError) {
        return res.status(err.status).json({
            success: false,
            error: {
                code: err.code,
                message: err.message,
                details: err.details
            }
        });
    }

    // Handle validation errors
    if (err.name === 'ValidationError') {
        return res.status(400).json({
            success: false,
            error: {
                code: 'VALIDATION_ERROR',
                message: 'Validation failed',
                details: err.details
            }
        });
    }

    // Handle database errors
    if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({
            success: false,
            error: {
                code: 'DUPLICATE_ENTRY',
                message: 'A record with this information already exists'
            }
        });
    }

    // Handle JWT errors
    if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({
            success: false,
            error: {
                code: 'INVALID_TOKEN',
                message: 'Invalid token'
            }
        });
    }

    if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
            success: false,
            error: {
                code: 'TOKEN_EXPIRED',
                message: 'Token has expired'
            }
        });
    }

    // Handle unknown errors
    return res.status(500).json({
        success: false,
        error: {
            code: 'SERVER_ERROR',
            message: 'An unexpected error occurred'
        }
    });
}

module.exports = {
    errorHandler,
    ApiError
}; 
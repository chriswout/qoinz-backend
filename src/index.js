const express = require('express');
const http = require('http');
const os = require('os');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const { errorHandler } = require('./middleware/errorHandler');
const { connectDB, pool } = require('./config/database');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const walletRoutes = require('./routes/wallet');
const levelRoutes = require('./routes/level');
const achievementRoutes = require('./routes/achievements');
const adminRoutes = require('./routes/admin');

// Fallbacks
process.env.NODE_ENV ||= 'production';
const HOST = '0.0.0.0';
const PORT = process.env.PORT || 3000;

console.log('🌍 Environment Variables:', {
    NODE_ENV: process.env.NODE_ENV,
    PORT,
    DB_HOST: process.env.DB_HOST,
    DB_USER: process.env.DB_USER,
    DB_NAME: process.env.DB_NAME
});

console.log('🌐 Network Interfaces:', os.networkInterfaces());

const app = express();
let server;
let isShuttingDown = false;

// Trust reverse proxies like CapRover
app.set('trust proxy', 1);

// Middleware: Logging
app.use(morgan('dev'));

// Middleware: Graceful shutdown check
app.use((req, res, next) => {
    if (isShuttingDown) return res.status(503).json({ error: 'Server is restarting' });
    next();
});

// Middleware: Security (relaxed for container)
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginOpenerPolicy: { policy: 'unsafe-none' },
    hsts: false,
    noSniff: false,
    frameguard: false,
    xssFilter: false,
    dnsPrefetchControl: false,
    ieNoOpen: false,
    referrerPolicy: false,
    permittedCrossDomainPolicies: false
}));

const allowedOrigins = ['https://qoinz.nostumba.online', 'http://localhost:4200'];

// Middleware: CORS
app.use(cors({
    origin: (origin, callback) => {
        console.log('CORS Request Origin:', origin);
        // Allow requests with no origin (like curl or Postman)
        if (!origin) {
            console.log('No origin, allowing request');
            return callback(null, true);
        }
        
        // Check if origin is in allowed list
        if (allowedOrigins.includes(origin)) {
            console.log('Origin allowed:', origin);
            return callback(null, origin); // Return the actual origin instead of true
        }
        
        console.log('Origin not allowed:', origin);
        return callback(new Error('Not allowed by CORS'), false);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    credentials: true,
    maxAge: 86400
}));

// Middleware: Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Middleware: Rate limiting
app.use(rateLimit({
    windowMs: 60 * 1000,
    max: process.env.NODE_ENV === 'production' ? 100 : 1000,
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    trustProxy: 1
}));

// Middleware: Conditional HTTPS redirect
app.use((req, res, next) => {
    const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
    const isLocalhost = req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1';
    const exempt = ['/', '/health', '/api/test'];
    const userAgent = req.headers['user-agent'] || '';
    const isBrowser = userAgent.includes('Mozilla');

    // Log request details for debugging
    console.log('Request details:', {
        path: req.path,
        ip: req.ip,
        isLocalhost,
        isSecure,
        userAgent,
        isBrowser
    });

    // Never redirect localhost or health checks
    if (isLocalhost || exempt.includes(req.path)) {
        return next();
    }

    // Only redirect non-secure browser requests
    if (!isSecure && isBrowser && req.method === 'GET') {
        return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }

    next();
});

// Routes: System
app.get('/', (req, res) => {
    res.json({
        message: 'Server is running',
        environment: process.env.NODE_ENV,
        host: req.get('host'),
        protocol: req.protocol,
        timestamp: new Date().toISOString()
    });
});

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        nodeVersion: process.version,
        pid: process.pid,
        env: {
            NODE_ENV: process.env.NODE_ENV,
            PORT,
            DB_HOST: process.env.DB_HOST,
            DB_USER: process.env.DB_USER,
            DB_NAME: process.env.DB_NAME
        }
    });
});

app.get('/api/test', (req, res) => {
    res.json({
        message: 'API is accessible',
        environment: process.env.NODE_ENV,
        host: req.get('host'),
        protocol: req.protocol,
        timestamp: new Date().toISOString()
    });
});

// Routes: Feature endpoints
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/wallet', walletRoutes);
app.use('/api/v1/level', levelRoutes);
app.use('/api/v1/achievements', achievementRoutes);
app.use('/api/v1/admin', adminRoutes);

// Middleware: Error handlers
app.use(errorHandler);
app.use((err, req, res, next) => {
    console.error('💥 Internal Error:', err);
    res.status(500).json({
        error: 'Internal Server Error',
        message: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
});

// Graceful shutdown
const gracefulShutdown = async (signal) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`📴 Received ${signal}, shutting down...`);

    if (server) {
        await new Promise((resolve) => {
            server.close(() => {
                console.log('🛑 Server closed.');
                resolve();
            });
        });
    }

    if (pool) {
        await pool.end();
        console.log('🛢️ DB pool closed.');
    }

    process.exit(0);
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Server init
const startServer = () => {
    server = http.createServer(app);
    server.listen(PORT, HOST, () => {
        const address = server.address();
        console.log(`🚀 Server running at http://${address.address}:${address.port}`);
    });
};

startServer(); 
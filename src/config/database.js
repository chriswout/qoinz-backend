const mysql = require('mysql2/promise');
const winston = require('winston');

// Configure logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' })
    ]
});

if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.simple()
    }));
}

// Create connection pool
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'srv-captain--db-engine-db',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '08qbRH69RSyl',
    database: process.env.DB_NAME || 'qoinz',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    connectTimeout: 60000,
    acquireTimeout: 60000,
    timeout: 60000,
    dateStrings: true
});

// Test database connection
const connectDB = async () => {
    try {
        console.log('Attempting database connection with config:', {
            host: process.env.DB_HOST || 'srv-captain--db-engine-db',
            user: process.env.DB_USER || 'root',
            database: process.env.DB_NAME || 'qoinz',
            // Don't log the password
        });

        const connection = await pool.getConnection();
        console.log('Database connection successful');
        
        // Test the connection with a simple query
        await connection.query('SELECT 1');
        console.log('Database query test successful');
        
        connection.release();
        logger.info('Database connected successfully');

        // Set up periodic connection check
        setInterval(async () => {
            try {
                const conn = await pool.getConnection();
                await conn.query('SELECT 1');
                conn.release();
            } catch (error) {
                console.error('Database health check failed:', error);
                logger.error('Database health check failed:', error);
            }
        }, 30000); // Check every 30 seconds

    } catch (error) {
        console.error('Database connection failed:', {
            message: error.message,
            code: error.code,
            errno: error.errno,
            sqlState: error.sqlState,
            sqlMessage: error.sqlMessage
        });
        logger.error('Database connection failed:', error);
        process.exit(1);
    }
};

// Helper function to execute queries
async function executeQuery(sql, params = []) {
    try {
        const [results] = await pool.execute(sql, params);
        return results;
    } catch (error) {
        logger.error('Query execution failed:', error);
        throw error;
    }
}

// Helper function to execute transactions
async function executeTransaction(queries) {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        
        for (const query of queries) {
            await connection.execute(query.sql, query.params);
        }
        
        await connection.commit();
    } catch (error) {
        await connection.rollback();
        logger.error('Transaction failed:', error);
        throw error;
    } finally {
        connection.release();
    }
}

module.exports = {
    connectDB,
    executeQuery,
    executeTransaction,
    pool
}; 
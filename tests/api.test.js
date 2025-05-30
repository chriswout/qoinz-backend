const request = require('supertest');
const app = require('../src/app');
const { pool } = require('../src/config/database');

let testUser;
let testToken;
let testBranch;

beforeAll(async () => {
    // Create a test user
    const response = await request(app)
        .post('/api/auth/register')
        .send({
            username: 'testuser',
            email: 'test@example.com',
            password: 'password123',
            first_name: 'Test',
            last_name: 'User',
            phone: '1234567890'
        });
    
    testUser = response.body.user;
    
    // Login to get token
    const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
            email: 'test@example.com',
            password: 'password123'
        });
    
    testToken = loginResponse.body.token;
});

afterAll(async () => {
    // Clean up test data
    await pool.query('DELETE FROM users WHERE email = ?', ['test@example.com']);
    await pool.end();
});

describe('Authentication Endpoints', () => {
    test('should register a new user', async () => {
        const response = await request(app)
            .post('/api/auth/register')
            .send({
                username: 'newuser',
                email: 'new@example.com',
                password: 'password123',
                first_name: 'New',
                last_name: 'User',
                phone: '1234567890'
            });
        
        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('user');
    });

    test('should login user', async () => {
        const response = await request(app)
            .post('/api/auth/login')
            .send({
                email: 'test@example.com',
                password: 'password123'
            });
        
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('token');
    });

    test('should refresh token', async () => {
        const response = await request(app)
            .post('/api/auth/refresh')
            .send({
                refresh_token: testToken
            });
        
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('token');
    });

    test('should logout user', async () => {
        const response = await request(app)
            .post('/api/auth/logout')
            .send({
                refresh_token: testToken
            });
        
        expect(response.status).toBe(200);
    });
});

describe('User Endpoints', () => {
    test('should get user profile', async () => {
        const response = await request(app)
            .get('/api/users/profile')
            .set('Authorization', `Bearer ${testToken}`);
        
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('username');
    });

    test('should update user profile', async () => {
        const response = await request(app)
            .put('/api/users/profile')
            .set('Authorization', `Bearer ${testToken}`)
            .send({
                first_name: 'Updated',
                last_name: 'Name'
            });
        
        expect(response.status).toBe(200);
    });

    test('should get user stats', async () => {
        const response = await request(app)
            .get('/api/users/stats')
            .set('Authorization', `Bearer ${testToken}`);
        
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('level');
        expect(response.body).toHaveProperty('exp');
    });

    test('should change password', async () => {
        const response = await request(app)
            .post('/api/users/change-password')
            .set('Authorization', `Bearer ${testToken}`)
            .send({
                old_password: 'password123',
                new_password: 'newpassword123'
            });
        
        expect(response.status).toBe(200);
    });
});

describe('Branch Endpoints', () => {
    test('should create new branch', async () => {
        const response = await request(app)
            .post('/api/branches')
            .set('Authorization', `Bearer ${testToken}`);
        
        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('branchId');
        testBranch = response.body.branchId;
    });

    test('should get user branches', async () => {
        const response = await request(app)
            .get('/api/branches')
            .set('Authorization', `Bearer ${testToken}`);
        
        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
    });

    test('should get branch details', async () => {
        const response = await request(app)
            .get(`/api/branches/${testBranch}`)
            .set('Authorization', `Bearer ${testToken}`);
        
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('id');
    });

    test('should get branch performance', async () => {
        const response = await request(app)
            .get(`/api/branches/${testBranch}/performance`)
            .set('Authorization', `Bearer ${testToken}`);
        
        expect(response.status).toBe(200);
    });

    test('should get branch activity', async () => {
        const response = await request(app)
            .get(`/api/branches/${testBranch}/activity`)
            .set('Authorization', `Bearer ${testToken}`);
        
        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
    });

    test('should get branch members stats', async () => {
        const response = await request(app)
            .get(`/api/branches/${testBranch}/members/stats`)
            .set('Authorization', `Bearer ${testToken}`);
        
        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
    });

    test('should get branch rewards history', async () => {
        const response = await request(app)
            .get(`/api/branches/${testBranch}/rewards/history`)
            .set('Authorization', `Bearer ${testToken}`);
        
        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
    });
});

describe('Level Endpoints', () => {
    test('should get user level', async () => {
        const response = await request(app)
            .get('/api/level')
            .set('Authorization', `Bearer ${testToken}`);
        
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('level');
        expect(response.body).toHaveProperty('exp');
    });
});

describe('Achievement Endpoints', () => {
    test('should get user achievements', async () => {
        const response = await request(app)
            .get('/api/achievements')
            .set('Authorization', `Bearer ${testToken}`);
        
        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
    });

    test('should get achievement details', async () => {
        const response = await request(app)
            .get('/api/achievements/1')
            .set('Authorization', `Bearer ${testToken}`);
        
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('id');
    });
}); 
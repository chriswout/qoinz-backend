const request = require('supertest');
const path = require('path');
const fs = require('fs');
const app = require('../src/app');
const db = require('../src/config/database');

describe('Avatar Upload Endpoints', () => {
  let authToken;
  let testUserId;

  beforeAll(async () => {
    // Create a test user and get auth token
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'testpassword123'
      });
    
    authToken = loginResponse.body.token;
    testUserId = loginResponse.body.user.id;
  });

  afterAll(async () => {
    // Clean up test data
    await db.query('DELETE FROM users WHERE email = ?', ['test@example.com']);
  });

  describe('POST /api/users/avatar/upload', () => {
    it('should upload avatar image successfully', async () => {
      const testImagePath = path.join(__dirname, 'fixtures/test-avatar.jpg');
      
      const response = await request(app)
        .post('/api/users/avatar/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('avatar', testImagePath);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('avatar_url');
      expect(response.body.avatar_url).toContain('https://images.qoinz.net/uploads/');
    });

    it('should reject non-image files', async () => {
      const testFilePath = path.join(__dirname, 'fixtures/test.txt');
      
      const response = await request(app)
        .post('/api/users/avatar/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('avatar', testFilePath);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('message', 'Only image files are allowed!');
    });

    it('should reject files larger than 5MB', async () => {
      const largeImagePath = path.join(__dirname, 'fixtures/large-image.jpg');
      
      const response = await request(app)
        .post('/api/users/avatar/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('avatar', largeImagePath);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('message', 'File too large');
    });
  });

  describe('POST /api/users/avatar/update', () => {
    it('should update avatar URL successfully', async () => {
      const testUrl = 'https://images.qoinz.net/uploads/test-avatar.jpg';
      
      const response = await request(app)
        .post('/api/users/avatar/update')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ avatar_url: testUrl });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'Avatar updated successfully');
      expect(response.body).toHaveProperty('avatar_url', testUrl);
    });
  });
}); 
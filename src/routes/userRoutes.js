const express = require('express');
const router = express.Router();
const { uploadAvatar, updateAvatar } = require('../controllers/userController');
const auth = require('../middleware/auth');
const { uploadSingle } = require('../middleware/upload');

// Avatar upload route
router.post('/avatar/upload', auth, uploadSingle('avatar'), uploadAvatar);

// Avatar URL update route
router.post('/avatar/update', auth, updateAvatar);

module.exports = router; 
const express = require('express');
const router = express.Router();
const { uploadAvatar, updateAvatar } = require('../controllers/userController');

// Debug: Check what is being imported
console.log('uploadAvatar:', uploadAvatar, 'Type:', typeof uploadAvatar);
console.log('updateAvatar:', updateAvatar, 'Type:', typeof updateAvatar);

const auth = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for temporary file storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/temp');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG and GIF are allowed.'), false);
  }
};

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter
});

// Avatar upload route
router.post('/avatar/upload', auth, upload.single('avatar'), uploadAvatar);

// Avatar URL update route
router.post('/avatar/update', auth, updateAvatar);

module.exports = router; 
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { uploadAvatar, updateAvatar } = require('../controllers/userController');
const auth = require('../middleware/auth');
const fs = require('fs');

// Configure multer for temporary file storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '../../uploads/temp'));
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// Create temp directory if it doesn't exist
const tempDir = path.join(__dirname, '../../uploads/temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Avatar upload route
router.post('/avatar/upload', auth, function(req, res, next) {
  const uploadMiddleware = upload.single('avatar');
  uploadMiddleware(req, res, function(err) {
    if (err) {
      return res.status(400).json({ message: err.message });
    }
    next();
  });
}, uploadAvatar);

// Avatar URL update route
router.post('/avatar/update', auth, updateAvatar);

module.exports = router; 
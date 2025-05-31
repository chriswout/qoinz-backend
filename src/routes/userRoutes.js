const express = require('express');
const router = express.Router();
const { uploadAvatar, updateAvatar } = require('../controllers/userController');
const auth = require('../middleware/auth');
let { uploadSingle } = require('../middleware/upload');

// Enterprise: Validate uploadSingle is a function
if (typeof uploadSingle !== 'function') {
  // Try fallback (in case of default export)
  if (uploadSingle && typeof uploadSingle.uploadSingle === 'function') {
    uploadSingle = uploadSingle.uploadSingle;
  } else {
    throw new Error('uploadSingle middleware is not a function. Check ../middleware/upload.js export.');
  }
}

// Avatar upload route
router.post('/avatar/upload', auth, uploadSingle('avatar'), uploadAvatar);

// Avatar URL update route
router.post('/avatar/update', auth, updateAvatar);

module.exports = router; 
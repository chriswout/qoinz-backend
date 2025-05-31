const express = require('express');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/database');

// Update user avatar
exports.updateAvatar = async (req, res) => {
  const { avatar_url } = req.body;
  const userId = req.user.id; // Assuming req.user is set by auth middleware

  try {
    const [result] = await pool.query('UPDATE users SET avatar_url = ? WHERE id = ?', [avatar_url, userId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({ message: 'Avatar updated successfully', avatar_url });
  } catch (error) {
    console.error('Error updating avatar:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Upload avatar image
exports.uploadAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Create form data
    const formData = new FormData();
    formData.append('image', fs.createReadStream(req.file.path));

    // Send to image server
    const response = await axios.post('https://images.qoinz.net/upload', formData, {
      headers: {
        ...formData.getHeaders(),
        'Authorization': `Bearer ${process.env.IMAGE_SERVER_TOKEN}`
      }
    });

    // Update user's avatar URL in database
    const [result] = await pool.query(
      'UPDATE users SET avatar_url = ? WHERE id = ?',
      [response.data.url, req.user.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Clean up temporary file
    fs.unlinkSync(req.file.path);

    res.json({
      message: 'Avatar uploaded successfully',
      avatar_url: response.data.url
    });
  } catch (error) {
    console.error('Error uploading avatar:', error);
    // Clean up temporary file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ message: 'Error uploading avatar' });
  }
}; 
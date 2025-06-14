const express = require('express');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/database');
const { Readable } = require('stream');

// Update user avatar
exports.updateAvatar = async (req, res) => {
  const { avatar_url } = req.body;
  const userId = req.user.id; // Assuming req.user is set by auth middleware

  try {
    const [result] = await pool.query('UPDATE users SET avatar_url = ? WHERE id = ?', [avatar_url, userId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    // Fetch and return the full updated user object
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
    res.json(rows[0]);
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

    // Create form data for image server
    const formData = new FormData();
    const stream = Readable.from(req.file.buffer);
    formData.append('image', stream, {
      filename: req.file.originalname,
      contentType: req.file.mimetype
    });

    // Upload to image server
    const imageServerResponse = await axios.post('https://images.qoinz.net/upload', formData, {
      headers: {
        ...formData.getHeaders(),
        'Authorization': `Bearer ${process.env.IMAGE_SERVER_TOKEN}`
      }
    });

    if (!imageServerResponse.data || !imageServerResponse.data.url) {
      throw new Error('Failed to get image URL from image server');
    }

    const imageUrl = imageServerResponse.data.url;

    // Update user's avatar URL in database
    const [result] = await pool.query(
      'UPDATE users SET avatar_url = ? WHERE id = ?',
      [imageUrl, req.user.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Fetch and return the full updated user object
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
    res.json(rows[0]);
  } catch (error) {
    console.error('Error uploading avatar:', error);
    res.status(500).json({
      message: 'Error uploading avatar',
      error: error.message
    });
  }
}; 
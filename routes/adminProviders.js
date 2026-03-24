const express = require('express');
const router = express.Router();

// Basic admin providers route
router.get('/health', (req, res) => {
  res.json({ success: true, message: 'Admin providers route working' });
});

module.exports = router;
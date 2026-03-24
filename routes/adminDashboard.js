const express = require('express');
const router = express.Router();

// Basic admin dashboard route
router.get('/health', (req, res) => {
  res.json({ success: true, message: 'Admin dashboard route working' });
});

module.exports = router;
const express = require('express');
const router = express.Router();

// Basic admin auth route
router.get('/health', (req, res) => {
  res.json({ success: true, message: 'Admin auth route working' });
});

module.exports = router;
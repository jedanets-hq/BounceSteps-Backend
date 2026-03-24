const express = require('express');
const router = express.Router();

// Basic admin users route
router.get('/health', (req, res) => {
  res.json({ success: true, message: 'Admin users route working' });
});

module.exports = router;
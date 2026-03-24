const express = require('express');
const router = express.Router();

// Basic admin services route
router.get('/health', (req, res) => {
  res.json({ success: true, message: 'Admin services route working' });
});

module.exports = router;
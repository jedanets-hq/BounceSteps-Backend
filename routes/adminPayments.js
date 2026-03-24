const express = require('express');
const router = express.Router();

// Basic admin payments route
router.get('/health', (req, res) => {
  res.json({ success: true, message: 'Admin payments route working' });
});

module.exports = router;
const express = require('express');
const router = express.Router();

// Basic messages route
router.get('/health', (req, res) => {
  res.json({ success: true, message: 'Messages route working' });
});

module.exports = router;
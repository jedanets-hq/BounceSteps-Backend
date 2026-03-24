const express = require('express');
const router = express.Router();

// Basic provider payments route
router.get('/health', (req, res) => {
  res.json({ success: true, message: 'Provider payments route working' });
});

module.exports = router;
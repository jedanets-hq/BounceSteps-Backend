const express = require('express');
const router = express.Router();

// Basic fix-services route
router.get('/health', (req, res) => {
  res.json({ success: true, message: 'Fix services route working' });
});

module.exports = router;
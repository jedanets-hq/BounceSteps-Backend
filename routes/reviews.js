const express = require('express');
const router = express.Router();

// Basic reviews route
router.get('/health', (req, res) => {
  res.json({ success: true, message: 'Reviews route working' });
});

module.exports = router;
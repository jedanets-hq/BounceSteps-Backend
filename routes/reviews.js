const express = require('express');
const { pool } = require('../config/postgresql');
const { authenticateJWT } = require('../middleware/jwtAuth');
const router = express.Router();

// Get reviews for a provider
router.get('/provider/:providerId', async (req, res) => {
  try {
    const { providerId } = req.params;
    
    const result = await pool.query(`
      SELECT 
        r.id,
        r.rating,
        r.comment,
        r.created_at,
        u.name as user_name,
        u.email as user_email
      FROM reviews r
      LEFT JOIN users u ON r.user_id = u.id
      WHERE r.provider_id = $1
      ORDER BY r.created_at DESC
    `, [providerId]);
    
    res.json({
      success: true,
      reviews: result.rows
    });
  } catch (error) {
    console.error('Error fetching provider reviews:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch reviews'
    });
  }
});

// Get reviews for a service
router.get('/service/:serviceId', async (req, res) => {
  try {
    const { serviceId } = req.params;
    
    const result = await pool.query(`
      SELECT 
        r.id,
        r.rating,
        r.comment,
        r.created_at,
        u.name as user_name,
        u.email as user_email
      FROM reviews r
      LEFT JOIN users u ON r.user_id = u.id
      WHERE r.service_id = $1
      ORDER BY r.created_at DESC
    `, [serviceId]);
    
    res.json({
      success: true,
      reviews: result.rows
    });
  } catch (error) {
    console.error('Error fetching service reviews:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch reviews'
    });
  }
});

// Add a review for a provider
router.post('/provider/:providerId', authenticateJWT, async (req, res) => {
  try {
    const { providerId } = req.params;
    const { rating, comment } = req.body;
    const userId = req.user.id;
    
    // Validate rating
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be between 1 and 5'
      });
    }
    
    // Check if user already reviewed this provider
    const existingReview = await pool.query(
      'SELECT id FROM reviews WHERE user_id = $1 AND provider_id = $2',
      [userId, providerId]
    );
    
    if (existingReview.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'You have already reviewed this provider'
      });
    }
    
    // Insert review
    const result = await pool.query(`
      INSERT INTO reviews (user_id, provider_id, rating, comment)
      VALUES ($1, $2, $3, $4)
      RETURNING id, rating, comment, created_at
    `, [userId, providerId, rating, comment || null]);
    
    res.json({
      success: true,
      message: 'Review added successfully',
      review: result.rows[0]
    });
  } catch (error) {
    console.error('Error adding provider review:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add review'
    });
  }
});

// Add a review for a service
router.post('/service/:serviceId', authenticateJWT, async (req, res) => {
  try {
    const { serviceId } = req.params;
    const { rating, comment } = req.body;
    const userId = req.user.id;
    
    // Validate rating
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be between 1 and 5'
      });
    }
    
    // Get provider_id from service
    const serviceResult = await pool.query(
      'SELECT provider_id FROM services WHERE id = $1',
      [serviceId]
    );
    
    if (serviceResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }
    
    const providerId = serviceResult.rows[0].provider_id;
    
    // Check if user already reviewed this service
    const existingReview = await pool.query(
      'SELECT id FROM reviews WHERE user_id = $1 AND service_id = $2',
      [userId, serviceId]
    );
    
    if (existingReview.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'You have already reviewed this service'
      });
    }
    
    // Insert review
    const result = await pool.query(`
      INSERT INTO reviews (user_id, service_id, provider_id, rating, comment)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, rating, comment, created_at
    `, [userId, serviceId, providerId, rating, comment || null]);
    
    res.json({
      success: true,
      message: 'Review added successfully',
      review: result.rows[0]
    });
  } catch (error) {
    console.error('Error adding service review:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add review'
    });
  }
});

// Update a review
router.put('/:reviewId', authenticateJWT, async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { rating, comment } = req.body;
    const userId = req.user.id;
    
    // Validate rating
    if (rating && (rating < 1 || rating > 5)) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be between 1 and 5'
      });
    }
    
    // Check if review exists and belongs to user
    const existingReview = await pool.query(
      'SELECT id FROM reviews WHERE id = $1 AND user_id = $2',
      [reviewId, userId]
    );
    
    if (existingReview.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Review not found or you do not have permission to edit it'
      });
    }
    
    // Update review
    const result = await pool.query(`
      UPDATE reviews 
      SET rating = COALESCE($1, rating),
          comment = COALESCE($2, comment),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING id, rating, comment, updated_at
    `, [rating, comment, reviewId]);
    
    res.json({
      success: true,
      message: 'Review updated successfully',
      review: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating review:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update review'
    });
  }
});

// Delete a review
router.delete('/:reviewId', authenticateJWT, async (req, res) => {
  try {
    const { reviewId } = req.params;
    const userId = req.user.id;
    
    // Check if review exists and belongs to user
    const existingReview = await pool.query(
      'SELECT id FROM reviews WHERE id = $1 AND user_id = $2',
      [reviewId, userId]
    );
    
    if (existingReview.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Review not found or you do not have permission to delete it'
      });
    }
    
    // Delete review
    await pool.query('DELETE FROM reviews WHERE id = $1', [reviewId]);
    
    res.json({
      success: true,
      message: 'Review deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting review:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete review'
    });
  }
});

module.exports = router;
const express = require('express');
const router = express.Router();

// Database connection with error handling
let pool;
try {
  pool = require('../config/postgresql').pool;
} catch (error) {
  console.warn('⚠️ Database connection not available for admin traveler stories');
}

// Get all traveler stories with filtering
router.get('/all', async (req, res) => {
  try {
    if (!pool) {
      return res.json({
        success: true,
        stories: [],
        message: 'No database connection - Please check database configuration'
      });
    }

    const { status, limit = 50 } = req.query;
    
    let whereClause = '';
    let queryParams = [];
    
    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
      whereClause = 'WHERE ts.status = $1';
      queryParams.push(status);
    }
    
    const query = `
      SELECT 
        ts.id,
        ts.title,
        ts.content,
        ts.location,
        ts.trip_date,
        ts.status,
        ts.likes_count,
        ts.images,
        ts.created_at,
        ts.updated_at,
        u.first_name,
        u.last_name,
        u.email,
        u.avatar_url as profile_image
      FROM traveler_stories ts
      JOIN users u ON ts.user_id = u.id
      ${whereClause}
      ORDER BY ts.created_at DESC
      LIMIT $${queryParams.length + 1}
    `;
    
    queryParams.push(parseInt(limit));
    
    const result = await pool.query(query, queryParams);
    
    res.json({
      success: true,
      stories: result.rows
    });
  } catch (error) {
    console.error('Admin traveler stories fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch traveler stories',
      error: error.message
    });
  }
});

// Approve a traveler story
router.put('/:id/approve', async (req, res) => {
  try {
    if (!pool) {
      return res.json({
        success: true,
        message: 'No database connection - Story approval simulated'
      });
    }

    const { id } = req.params;
    
    const result = await pool.query(
      'UPDATE traveler_stories SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING id, title, status',
      ['approved', id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Story not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Story approved successfully',
      story: result.rows[0]
    });
  } catch (error) {
    console.error('Admin story approve error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve story',
      error: error.message
    });
  }
});

// Reject a traveler story
router.put('/:id/reject', async (req, res) => {
  try {
    if (!pool) {
      return res.json({
        success: true,
        message: 'No database connection - Story rejection simulated'
      });
    }

    const { id } = req.params;
    
    const result = await pool.query(
      'UPDATE traveler_stories SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING id, title, status',
      ['rejected', id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Story not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Story rejected',
      story: result.rows[0]
    });
  } catch (error) {
    console.error('Admin story reject error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject story',
      error: error.message
    });
  }
});

// Delete a traveler story
router.delete('/admin/:id', async (req, res) => {
  try {
    if (!pool) {
      return res.json({
        success: true,
        message: 'No database connection - Story deletion simulated'
      });
    }

    const { id } = req.params;
    
    const result = await pool.query(
      'DELETE FROM traveler_stories WHERE id = $1 RETURNING id, title',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Story not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Story deleted successfully',
      story: result.rows[0]
    });
  } catch (error) {
    console.error('Admin story delete error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete story',
      error: error.message
    });
  }
});

module.exports = router;
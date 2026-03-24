const express = require('express');
const router = express.Router();
const { pool } = require('../models');
const { authenticateJWT } = require('../middleware/jwtAuth');

// Get approved stories for homepage (public)
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        ts.id,
        ts.title,
        ts.content as story,
        ts.location,
        ts.trip_date,
        ts.likes_count,
        ts.created_at,
        u.first_name,
        u.last_name,
        u.avatar_url as profile_image
      FROM traveler_stories ts
      JOIN users u ON ts.user_id = u.id
      WHERE ts.status = 'approved'
      ORDER BY ts.created_at DESC
      LIMIT 20
    `);
    
    res.json({ success: true, stories: result.rows });
  } catch (error) {
    console.error('Error fetching approved stories:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch stories' });
  }
});

// Get stories by user (for traveler dashboard)
router.get('/my-stories', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    
    const result = await pool.query(`
      SELECT 
        id,
        title,
        content,
        location,
        trip_date,
        status,
        likes_count,
        created_at,
        updated_at
      FROM traveler_stories
      WHERE user_id = $1
      ORDER BY created_at DESC
    `, [userId]);
    
    res.json({ success: true, stories: result.rows });
  } catch (error) {
    console.error('Error fetching user stories:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch your stories' });
  }
});

// Create new story (traveler)
router.post('/', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user?.id;
    const { title, content, location, trip_date } = req.body;
    
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    
    if (!title || !content) {
      return res.status(400).json({ success: false, message: 'Title and content are required' });
    }
    
    const result = await pool.query(`
      INSERT INTO traveler_stories (user_id, title, content, location, trip_date, status)
      VALUES ($1, $2, $3, $4, $5, 'pending')
      RETURNING id, title, content, location, trip_date, status, created_at
    `, [userId, title, content, location, trip_date || null]);
    
    res.json({ 
      success: true, 
      message: 'Story submitted successfully! It will be visible after admin approval.',
      story: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating story:', error);
    res.status(500).json({ success: false, message: 'Failed to create story' });
  }
});

// Get pending stories (admin only - no auth for local development)
router.get('/admin/pending', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        ts.id,
        ts.title,
        ts.content,
        ts.location,
        ts.trip_date,
        ts.status,
        ts.created_at,
        u.id as user_id,
        u.first_name,
        u.last_name,
        u.email,
        u.avatar_url as profile_image
      FROM traveler_stories ts
      JOIN users u ON ts.user_id = u.id
      WHERE ts.status = 'pending'
      ORDER BY ts.created_at DESC
    `);
    
    res.json({ success: true, stories: result.rows });
  } catch (error) {
    console.error('Error fetching pending stories:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch pending stories' });
  }
});

// Get all stories with status (admin only - no auth for local development)
router.get('/admin/all', async (req, res) => {
  try {
    const { status } = req.query;
    
    let query = `
      SELECT 
        ts.id,
        ts.title,
        ts.content,
        ts.location,
        ts.trip_date,
        ts.status,
        ts.likes_count,
        ts.created_at,
        ts.updated_at,
        u.id as user_id,
        u.first_name,
        u.last_name,
        u.email,
        u.avatar_url as profile_image
      FROM traveler_stories ts
      JOIN users u ON ts.user_id = u.id
    `;
    
    const params = [];
    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
      query += ' WHERE ts.status = $1';
      params.push(status);
    }
    
    query += ' ORDER BY ts.created_at DESC';
    
    const result = await pool.query(query, params);
    
    res.json({ success: true, stories: result.rows });
  } catch (error) {
    console.error('Error fetching all stories:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch stories' });
  }
});

// Approve story (admin only - no auth for local development)
router.put('/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      UPDATE traveler_stories
      SET status = 'approved', updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, title, status
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Story not found' });
    }
    
    res.json({ 
      success: true, 
      message: 'Story approved successfully',
      story: result.rows[0]
    });
  } catch (error) {
    console.error('Error approving story:', error);
    res.status(500).json({ success: false, message: 'Failed to approve story' });
  }
});

// Reject story (admin only - no auth for local development)
router.put('/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      UPDATE traveler_stories
      SET status = 'rejected', updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, title, status
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Story not found' });
    }
    
    res.json({ 
      success: true, 
      message: 'Story rejected',
      story: result.rows[0]
    });
  } catch (error) {
    console.error('Error rejecting story:', error);
    res.status(500).json({ success: false, message: 'Failed to reject story' });
  }
});

// Delete story (admin or owner)
router.delete('/:id', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const isAdmin = req.user?.user_type === 'admin';
    
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    
    // Check ownership or admin
    let query = 'DELETE FROM traveler_stories WHERE id = $1';
    const params = [id];
    
    if (!isAdmin) {
      query += ' AND user_id = $2';
      params.push(userId);
    }
    
    query += ' RETURNING id';
    
    const result = await pool.query(query, params);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Story not found or unauthorized' });
    }
    
    res.json({ success: true, message: 'Story deleted successfully' });
  } catch (error) {
    console.error('Error deleting story:', error);
    res.status(500).json({ success: false, message: 'Failed to delete story' });
  }
});

// Delete story (admin only - no auth for local development)
router.delete('/admin/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'DELETE FROM traveler_stories WHERE id = $1 RETURNING id',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Story not found' });
    }
    
    res.json({ success: true, message: 'Story deleted successfully' });
  } catch (error) {
    console.error('Error deleting story:', error);
    res.status(500).json({ success: false, message: 'Failed to delete story' });
  }
});

module.exports = router;

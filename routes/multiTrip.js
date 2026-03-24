const express = require('express');
const router = express.Router();
const { pool } = require('../models');
const passport = require('passport');

// Get all multi-trip journeys for authenticated user
router.get('/', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const userId = req.user.id;
    
    const result = await pool.query(`
      SELECT * FROM multi_trip_journeys
      WHERE user_id = $1
      ORDER BY created_at DESC
    `, [userId]);
    
    res.json({ success: true, journeys: result.rows });
  } catch (error) {
    console.error('Get multi-trip journeys error:', error);
    res.json({ success: true, journeys: [] }); // Return empty array to prevent crashes
  }
});

// Create new multi-trip journey
router.post('/create', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const userId = req.user.id;
    const { journeyName, destinations, startDate, endDate, travelers, budget } = req.body;
    
    console.log('📝 Creating multi-trip journey:', { userId, journeyName, destinations: destinations?.length });
    
    if (!journeyName || !destinations || destinations.length < 2) {
      return res.status(400).json({ 
        success: false, 
        message: 'Journey name and at least 2 destinations are required' 
      });
    }
    
    const result = await pool.query(`
      INSERT INTO multi_trip_journeys (
        user_id, journey_name, destinations, start_date, end_date, travelers, budget, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      userId,
      journeyName,
      JSON.stringify(destinations),
      startDate,
      endDate,
      travelers || 1,
      budget || 0,
      'planned'
    ]);
    
    console.log('✅ Multi-trip journey created:', result.rows[0].id);
    
    res.status(201).json({ 
      success: true, 
      message: 'Multi-trip journey created successfully',
      journey: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Create multi-trip journey error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create journey',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get single journey with services
router.get('/:id', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const userId = req.user.id;
    const journeyId = req.params.id;
    
    // Get journey
    const journeyResult = await pool.query(`
      SELECT * FROM multi_trip_journeys
      WHERE id = $1 AND user_id = $2
    `, [journeyId, userId]);
    
    if (journeyResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Journey not found' });
    }
    
    const journey = journeyResult.rows[0];
    
    // Get associated services
    const servicesResult = await pool.query(`
      SELECT js.*, s.*, sp.business_name
      FROM journey_services js
      LEFT JOIN services s ON js.service_id = s.id
      LEFT JOIN service_providers sp ON s.provider_id = sp.user_id
      WHERE js.journey_id = $1
      ORDER BY js.destination_index
    `, [journeyId]);
    
    journey.services = servicesResult.rows;
    
    res.json({ success: true, journey });
  } catch (error) {
    console.error('Get journey error:', error);
    res.status(500).json({ success: false, message: 'Failed to get journey' });
  }
});

module.exports = router;

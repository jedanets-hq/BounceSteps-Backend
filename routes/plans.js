const express = require('express');
const router = express.Router();
const { pool } = require('../models');
const passport = require('passport');

// Get all plans for authenticated user
router.get('/', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Check if plans table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'plans'
      );
    `);
    
    if (tableCheck.rows[0].exists) {
      const result = await pool.query(`
        SELECT * FROM plans
        WHERE user_id = $1
        ORDER BY created_at DESC
      `, [userId]);
      
      res.json({ success: true, plans: result.rows });
    } else {
      // Table doesn't exist yet - return empty array
      res.json({ success: true, plans: [] });
    }
  } catch (error) {
    console.error('Get plans error:', error);
    res.status(500).json({ success: false, message: 'Failed to get plans' });
  }
});

// Create new plan
router.post('/', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const userId = req.user.id;
    const { title, description, destinations, start_date, end_date, budget, plan_data } = req.body;
    
    // Check if plans table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'plans'
      );
    `);
    
    if (!tableCheck.rows[0].exists) {
      // Create plans table if it doesn't exist
      await pool.query(`
        CREATE TABLE IF NOT EXISTS plans (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          title VARCHAR(255) NOT NULL,
          description TEXT,
          destinations TEXT[],
          start_date DATE,
          end_date DATE,
          budget DECIMAL(10, 2),
          plan_data JSONB,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
    }
    
    const result = await pool.query(`
      INSERT INTO plans (user_id, title, description, destinations, start_date, end_date, budget, plan_data)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [userId, title, description, destinations, start_date, end_date, budget, JSON.stringify(plan_data)]);
    
    res.status(201).json({ success: true, plan: result.rows[0] });
  } catch (error) {
    console.error('Create plan error:', error);
    res.status(500).json({ success: false, message: 'Failed to create plan' });
  }
});

module.exports = router;

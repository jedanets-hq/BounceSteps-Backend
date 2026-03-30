const express = require('express');
const router = express.Router();
const { pool } = require('../models');
const { authenticateJWT } = require('../middleware/jwtAuth');

// Get cart items for authenticated user
router.get('/', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    console.log('📦 Fetching cart for user:', userId);
    
    const result = await pool.query(`
      SELECT c.*, 
             s.title, 
             s.description, 
             s.price, 
             s.category,
             s.images,
             s.region,
             s.district,
             s.area,
             s.location,
             sp.business_name as provider_name,
             sp.user_id as provider_id
      FROM cart c
      LEFT JOIN services s ON c.service_id = s.id
      LEFT JOIN service_providers sp ON s.provider_id = sp.user_id
      WHERE c.user_id = $1
      ORDER BY c.created_at DESC
    `, [userId]);
    
    console.log(`✅ Found ${result.rows.length} cart items`);
    
    res.json({ 
      success: true, 
      data: result.rows 
    });
  } catch (error) {
    console.error('❌ Get cart error:', error);
    res.status(500).json({ success: false, message: 'Failed to get cart' });
  }
});

// Add item to cart - POST /cart (main endpoint)
router.post('/', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    const { serviceId, quantity = 1 } = req.body;
    
    console.log('➕ Adding to cart:', { userId, serviceId, quantity });
    
    if (!serviceId) {
      return res.status(400).json({ success: false, message: 'Service ID is required' });
    }
    
    // Check if service exists
    const serviceCheck = await pool.query('SELECT * FROM services WHERE id = $1', [serviceId]);
    if (serviceCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }
    
    // Check if item already in cart
    const existingItem = await pool.query(
      'SELECT * FROM cart WHERE user_id = $1 AND service_id = $2',
      [userId, serviceId]
    );
    
    if (existingItem.rows.length > 0) {
      // Update quantity
      const result = await pool.query(
        'UPDATE cart SET quantity = quantity + $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2 AND service_id = $3 RETURNING *',
        [quantity, userId, serviceId]
      );
      console.log('✅ Cart item quantity updated');
      return res.json({ success: true, message: 'Cart updated', data: result.rows[0] });
    } else {
      // Insert new item
      const result = await pool.query(
        'INSERT INTO cart (user_id, service_id, quantity) VALUES ($1, $2, $3) RETURNING *',
        [userId, serviceId, quantity]
      );
      console.log('✅ Item added to cart');
      return res.json({ success: true, message: 'Item added to cart', data: result.rows[0] });
    }
  } catch (error) {
    console.error('❌ Add to cart error:', error);
    res.status(500).json({ success: false, message: 'Failed to add to cart' });
  }
});

// Add item to cart - POST /cart/add (alternative endpoint for compatibility)
router.post('/add', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    const { serviceId, quantity = 1 } = req.body;
    
    console.log('➕ Adding to cart (via /add):', { userId, serviceId, quantity });
    
    if (!serviceId) {
      return res.status(400).json({ success: false, message: 'Service ID is required' });
    }
    
    // Check if service exists
    const serviceCheck = await pool.query('SELECT * FROM services WHERE id = $1', [serviceId]);
    if (serviceCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }
    
    // Check if item already in cart
    const existingItem = await pool.query(
      'SELECT * FROM cart WHERE user_id = $1 AND service_id = $2',
      [userId, serviceId]
    );
    
    if (existingItem.rows.length > 0) {
      // Update quantity
      const result = await pool.query(
        'UPDATE cart SET quantity = quantity + $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2 AND service_id = $3 RETURNING *',
        [quantity, userId, serviceId]
      );
      console.log('✅ Cart item quantity updated');
      return res.json({ success: true, message: 'Cart updated', data: result.rows[0] });
    } else {
      // Insert new item
      const result = await pool.query(
        'INSERT INTO cart (user_id, service_id, quantity) VALUES ($1, $2, $3) RETURNING *',
        [userId, serviceId, quantity]
      );
      console.log('✅ Item added to cart');
      return res.json({ success: true, message: 'Item added to cart', data: result.rows[0] });
    }
  } catch (error) {
    console.error('❌ Add to cart error:', error);
    res.status(500).json({ success: false, message: 'Failed to add to cart' });
  }
});

// Update cart item quantity
router.put('/:id', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    const cartItemId = req.params.id;
    const { quantity } = req.body;
    
    console.log('📝 Updating cart item:', { cartItemId, quantity });
    
    if (quantity <= 0) {
      return res.status(400).json({ success: false, message: 'Quantity must be greater than 0' });
    }
    
    const result = await pool.query(
      'UPDATE cart SET quantity = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3 RETURNING *',
      [quantity, cartItemId, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Cart item not found' });
    }
    
    console.log('✅ Cart item updated');
    res.json({ success: true, message: 'Cart updated', data: result.rows[0] });
  } catch (error) {
    console.error('❌ Update cart error:', error);
    res.status(500).json({ success: false, message: 'Failed to update cart' });
  }
});

// Remove item from cart
router.delete('/:id', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    const cartItemId = req.params.id;
    
    console.log('🗑️ Removing cart item:', cartItemId);
    
    const result = await pool.query(
      'DELETE FROM cart WHERE id = $1 AND user_id = $2 RETURNING *',
      [cartItemId, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Cart item not found' });
    }
    
    console.log('✅ Cart item removed');
    res.json({ success: true, message: 'Item removed from cart' });
  } catch (error) {
    console.error('❌ Remove from cart error:', error);
    res.status(500).json({ success: false, message: 'Failed to remove from cart' });
  }
});

// Clear entire cart
router.delete('/', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    
    console.log('🗑️ Clearing cart for user:', userId);
    
    await pool.query('DELETE FROM cart WHERE user_id = $1', [userId]);
    
    console.log('✅ Cart cleared');
    res.json({ success: true, message: 'Cart cleared' });
  } catch (error) {
    console.error('❌ Clear cart error:', error);
    res.status(500).json({ success: false, message: 'Failed to clear cart' });
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const { pool } = require('../models');
const { authenticateJWT } = require('../middleware/jwtAuth');

// Initiate payment
router.post('/initiate', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    const { 
      cartItems, 
      paymentMethod, 
      paymentData, 
      total 
    } = req.body;

    console.log('💳 Initiating payment for user:', userId);
    console.log('💰 Payment amount:', total);
    console.log('💳 Payment method:', paymentMethod);

    // Validate required fields
    if (!cartItems || cartItems.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'No items selected for payment' 
      });
    }

    if (!paymentMethod) {
      return res.status(400).json({ 
        success: false, 
        message: 'Payment method is required' 
      });
    }

    // Validate payment data based on method
    if (paymentMethod === 'card') {
      const { cardNumber, expiryDate, cvv, cardName } = paymentData;
      if (!cardNumber || !expiryDate || !cvv || !cardName) {
        return res.status(400).json({ 
          success: false, 
          message: 'Complete card details are required' 
        });
      }
    } else if (paymentMethod === 'mobile') {
      const { mobileProvider, mobileNumber } = paymentData;
      if (!mobileProvider || !mobileNumber) {
        return res.status(400).json({ 
          success: false, 
          message: 'Mobile provider and phone number are required' 
        });
      }
    }

    // Create payment record
    const paymentReference = `PAY-${Date.now()}-${userId}`;
    
    const paymentResult = await pool.query(`
      INSERT INTO payments (
        user_id, 
        reference, 
        amount, 
        payment_method, 
        status, 
        created_at
      ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP) 
      RETURNING *
    `, [userId, paymentReference, total, paymentMethod, 'pending']);

    const payment = paymentResult.rows[0];

    // For demo purposes, simulate payment processing
    // In production, integrate with actual payment gateways
    
    if (paymentMethod === 'card') {
      // Simulate card payment processing
      console.log('💳 Processing card payment...');
      
      // Mock validation - in production, use actual payment gateway
      const isValidCard = paymentData.cardNumber && paymentData.cardNumber.replace(/\s/g, '').length >= 13;
      
      if (isValidCard) {
        // Update payment status to completed
        await pool.query(
          'UPDATE payments SET status = $1, completed_at = CURRENT_TIMESTAMP WHERE id = $2',
          ['completed', payment.id]
        );
        
        console.log('✅ Card payment completed');
        
        res.json({
          success: true,
          message: 'Payment completed successfully',
          data: {
            paymentId: payment.id,
            reference: paymentReference,
            status: 'completed',
            method: paymentMethod
          }
        });
      } else {
        // Update payment status to failed
        await pool.query(
          'UPDATE payments SET status = $1 WHERE id = $2',
          ['failed', payment.id]
        );
        
        res.status(400).json({
          success: false,
          message: 'Invalid card details'
        });
      }
      
    } else if (paymentMethod === 'mobile') {
      // Simulate mobile money processing
      console.log('📱 Processing mobile money payment...');
      
      // Mock validation - in production, integrate with mobile money APIs
      const isValidPhone = paymentData.mobileNumber && paymentData.mobileNumber.length >= 10;
      
      if (isValidPhone) {
        // Update payment status to completed
        await pool.query(
          'UPDATE payments SET status = $1, completed_at = CURRENT_TIMESTAMP WHERE id = $2',
          ['completed', payment.id]
        );
        
        console.log('✅ Mobile money payment completed');
        
        res.json({
          success: true,
          message: 'Payment completed successfully',
          data: {
            paymentId: payment.id,
            reference: paymentReference,
            status: 'completed',
            method: paymentMethod,
            provider: paymentData.mobileProvider
          }
        });
      } else {
        // Update payment status to failed
        await pool.query(
          'UPDATE payments SET status = $1 WHERE id = $2',
          ['failed', payment.id]
        );
        
        res.status(400).json({
          success: false,
          message: 'Invalid phone number'
        });
      }
    }

  } catch (error) {
    console.error('❌ Payment initiation error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Payment processing failed' 
    });
  }
});

// Verify payment status
router.post('/verify', authenticateJWT, async (req, res) => {
  try {
    const { paymentReference } = req.body;
    
    if (!paymentReference) {
      return res.status(400).json({ 
        success: false, 
        message: 'Payment reference is required' 
      });
    }

    const result = await pool.query(
      'SELECT * FROM payments WHERE reference = $1',
      [paymentReference]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Payment not found' 
      });
    }

    const payment = result.rows[0];
    
    res.json({
      success: true,
      data: {
        paymentId: payment.id,
        reference: payment.reference,
        amount: payment.amount,
        status: payment.status,
        paymentMethod: payment.payment_method,
        createdAt: payment.created_at,
        completedAt: payment.completed_at
      }
    });

  } catch (error) {
    console.error('❌ Payment verification error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Payment verification failed' 
    });
  }
});

// Get user payment history
router.get('/history', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const result = await pool.query(`
      SELECT 
        id,
        reference,
        amount,
        payment_method,
        status,
        created_at,
        completed_at
      FROM payments 
      WHERE user_id = $1 
      ORDER BY created_at DESC
      LIMIT 50
    `, [userId]);

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('❌ Payment history error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get payment history' 
    });
  }
});

module.exports = router;
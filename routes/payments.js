const express = require('express');
const router = express.Router();
const { pool } = require('../models');
const { authenticateJWT } = require('../middleware/jwtAuth');
const pesapalService = require('../services/pesapalService');

// Initiate PesaPal payment
router.post('/pesapal/initiate', authenticateJWT, async (req, res) => {
  const client = await pool.connect();
  try {
    const userId = req.user.id;
    const { 
      cartItems, 
      paymentMethod, // 'mobile' or 'card'
      phoneNumber,
      email,
      firstName,
      lastName,
      total 
    } = req.body;

    console.log('💳 Initiating PesaPal payment for user:', userId);
    console.log('💰 Payment amount:', total, 'TZS');
    console.log('💳 Payment method:', paymentMethod);

    // Validate required fields
    if (!cartItems || cartItems.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'No items selected for payment' 
      });
    }

    if (!total || total <= 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid payment amount' 
      });
    }

    if (!phoneNumber) {
      return res.status(400).json({ 
        success: false, 
        message: 'Phone number is required' 
      });
    }

    await client.query('BEGIN');

    // Create booking records for each cart item
    const bookingIds = [];
    for (const item of cartItems) {
      const bookingResult = await client.query(`
        INSERT INTO bookings (
          user_id,
          service_id,
          provider_id,
          booking_date,
          travel_date,
          participants,
          total_price,
          status,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
        RETURNING id
      `, [
        userId,
        item.serviceId,
        item.providerId,
        new Date(), // booking_date - when booking was made
        item.startDate || item.travelDate || new Date(), // travel_date - when service will be used
        item.guests || item.participants || 1,
        item.price,
        'pending',
      ]);
      
      bookingIds.push(bookingResult.rows[0].id);
    }

    // Create payment record
    const paymentReference = `PAY-${Date.now()}-${userId}`;
    
    const paymentResult = await client.query(`
      INSERT INTO payments (
        user_id, 
        reference, 
        amount, 
        payment_method, 
        status,
        booking_ids,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP) 
      RETURNING *
    `, [userId, paymentReference, total, paymentMethod, 'pending', JSON.stringify(bookingIds)]);

    const payment = paymentResult.rows[0];

    // Prepare callback URLs
    const callbackUrl = `${process.env.FRONTEND_URL}/payment/callback?reference=${paymentReference}`;
    const cancellationUrl = `${process.env.FRONTEND_URL}/payment/cancelled?reference=${paymentReference}`;
    
    // Create PesaPal payment request
    const pesapalResult = await pesapalService.createPaymentRequest({
      bookingId: payment.id,
      amount: total,
      currency: 'TZS',
      description: `Payment for ${cartItems.length} service(s)`,
      callbackUrl: callbackUrl,
      cancellationUrl: cancellationUrl,
      notificationId: process.env.PESAPAL_IPN_ID,
      billingAddress: {
        email_address: email || req.user.email || '',
        phone_number: phoneNumber,
        country_code: 'TZ',
        first_name: firstName || req.user.first_name || '',
        middle_name: '',
        last_name: lastName || req.user.last_name || '',
        line_1: '',
        line_2: '',
        city: '',
        state: '',
        postal_code: '',
        zip_code: ''
      }
    });

    if (!pesapalResult.success) {
      await client.query('ROLLBACK');
      return res.status(500).json({
        success: false,
        message: 'Failed to initiate payment with PesaPal',
        error: pesapalResult.error
      });
    }

    // Update payment with PesaPal tracking ID
    await client.query(`
      UPDATE payments 
      SET pesapal_tracking_id = $1, 
          pesapal_merchant_reference = $2
      WHERE id = $3
    `, [pesapalResult.orderTrackingId, pesapalResult.merchantReference, payment.id]);

    await client.query('COMMIT');

    console.log('✅ PesaPal payment initiated:', {
      paymentId: payment.id,
      trackingId: pesapalResult.orderTrackingId,
      redirectUrl: pesapalResult.redirectUrl
    });

    res.json({
      success: true,
      message: 'Payment initiated successfully',
      data: {
        paymentId: payment.id,
        reference: paymentReference,
        redirectUrl: pesapalResult.redirectUrl,
        orderTrackingId: pesapalResult.orderTrackingId,
        merchantReference: pesapalResult.merchantReference
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ PesaPal payment initiation error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Payment processing failed',
      error: error.message
    });
  } finally {
    client.release();
  }
});

// PesaPal payment callback
router.get('/pesapal/callback', async (req, res) => {
  try {
    const { OrderTrackingId, OrderMerchantReference } = req.query;

    console.log('📥 PesaPal callback received:', {
      trackingId: OrderTrackingId,
      merchantRef: OrderMerchantReference
    });

    if (!OrderTrackingId) {
      return res.status(400).json({
        success: false,
        message: 'Order tracking ID is required'
      });
    }

    // Verify payment with PesaPal
    const verificationResult = await pesapalService.verifyPayment(OrderTrackingId);

    if (!verificationResult.success) {
      return res.status(500).json({
        success: false,
        message: 'Payment verification failed',
        error: verificationResult.error
      });
    }

    // Update payment status in database
    const paymentResult = await pool.query(`
      SELECT * FROM payments 
      WHERE pesapal_tracking_id = $1
    `, [OrderTrackingId]);

    if (paymentResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Payment record not found'
      });
    }

    const payment = paymentResult.rows[0];

    // Update payment status based on PesaPal response
    let newStatus = 'pending';
    if (verificationResult.confirmed && verificationResult.paymentStatus === 'Completed') {
      newStatus = 'completed';
    } else if (verificationResult.paymentStatus === 'Failed') {
      newStatus = 'failed';
    }

    await pool.query(`
      UPDATE payments 
      SET status = $1,
          pesapal_payment_status = $2,
          pesapal_confirmation_code = $3,
          completed_at = CASE WHEN $1 = 'completed' THEN CURRENT_TIMESTAMP ELSE completed_at END
      WHERE id = $4
    `, [newStatus, verificationResult.paymentStatus, verificationResult.confirmationCode, payment.id]);

    // If payment completed, update booking status
    if (newStatus === 'completed') {
      const bookingIds = JSON.parse(payment.booking_ids || '[]');
      if (bookingIds.length > 0) {
        await pool.query(`
          UPDATE bookings 
          SET status = 'confirmed',
              payment_status = 'paid'
          WHERE id = ANY($1)
        `, [bookingIds]);
      }
      console.log('✅ Payment completed and bookings confirmed');
    }

    res.json({
      success: true,
      message: 'Payment callback processed',
      data: {
        paymentId: payment.id,
        status: newStatus,
        pesapalStatus: verificationResult.paymentStatus,
        amount: verificationResult.amount,
        confirmationCode: verificationResult.confirmationCode
      }
    });

  } catch (error) {
    console.error('❌ PesaPal callback error:', error);
    res.status(500).json({
      success: false,
      message: 'Callback processing failed',
      error: error.message
    });
  }
});

// PesaPal IPN (Instant Payment Notification)
router.post('/pesapal/ipn', async (req, res) => {
  try {
    const { OrderTrackingId, OrderMerchantReference, OrderNotificationType } = req.body;

    console.log('📡 PesaPal IPN received:', {
      trackingId: OrderTrackingId,
      merchantRef: OrderMerchantReference,
      notificationType: OrderNotificationType
    });

    if (!OrderTrackingId) {
      return res.status(200).json({
        success: false,
        message: 'Order tracking ID is required'
      });
    }

    // Verify payment status
    const verificationResult = await pesapalService.verifyPayment(OrderTrackingId);

    if (verificationResult.success) {
      // Update payment in database
      await pool.query(`
        UPDATE payments 
        SET pesapal_payment_status = $1,
            pesapal_confirmation_code = $2,
            status = CASE 
              WHEN $1 = 'Completed' THEN 'completed'
              WHEN $1 = 'Failed' THEN 'failed'
              ELSE status
            END,
            completed_at = CASE 
              WHEN $1 = 'Completed' THEN CURRENT_TIMESTAMP 
              ELSE completed_at 
            END
        WHERE pesapal_tracking_id = $3
      `, [verificationResult.paymentStatus, verificationResult.confirmationCode, OrderTrackingId]);

      console.log('✅ IPN processed successfully');
    }

    // Always return 200 to acknowledge IPN
    res.status(200).json({
      success: true,
      message: 'IPN processed'
    });

  } catch (error) {
    console.error('❌ PesaPal IPN error:', error);
    // Still return 200 to prevent PesaPal from retrying
    res.status(200).json({
      success: false,
      message: 'IPN processing failed'
    });
  }
});

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
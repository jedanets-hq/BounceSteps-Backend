const express = require('express');
const router = express.Router();
const { pool } = require('../config/postgresql');

// Get payments with pagination and filtering
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20,
      status = '',
      startDate = '',
      endDate = ''
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    // Build WHERE clause
    let whereConditions = [];
    let queryParams = [];
    let paramIndex = 1;

    if (status) {
      whereConditions.push(`pp.status = $${paramIndex}`);
      queryParams.push(status);
      paramIndex++;
    }

    if (startDate) {
      whereConditions.push(`pp.created_at >= $${paramIndex}`);
      queryParams.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      whereConditions.push(`pp.created_at <= $${paramIndex}`);
      queryParams.push(endDate);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';

    // Get promotion payments (since payments table doesn't exist)
    const paymentsQuery = `
      SELECT 
        pp.id, pp.amount, pp.currency, pp.status, pp.payment_method,
        pp.transaction_reference, pp.created_at, pp.updated_at,
        pp.payment_type, pp.description, pp.duration_days,
        sp.business_name as provider_name, sp.id as provider_id,
        u.email as user_email, u.first_name, u.last_name
      FROM promotion_payments pp
      LEFT JOIN service_providers sp ON pp.provider_id = sp.id
      LEFT JOIN users u ON sp.user_id = u.id
      ${whereClause}
      ORDER BY pp.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    queryParams.push(parseInt(limit), offset);

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM promotion_payments pp
      LEFT JOIN service_providers sp ON pp.provider_id = sp.id
      ${whereClause}
    `;

    const [paymentsResult, countResult] = await Promise.all([
      pool.query(paymentsQuery, queryParams),
      pool.query(countQuery, queryParams.slice(0, -2))
    ]);

    const totalPayments = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(totalPayments / parseInt(limit));

    res.json({
      success: true,
      data: {
        payments: paymentsResult.rows,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalItems: totalPayments,
          itemsPerPage: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Admin payments error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch payments',
      error: error.message 
    });
  }
});

// Get payment statistics
router.get('/stats', async (req, res) => {
  try {
    const [totalResult, successfulResult, pendingResult, revenueResult] = await Promise.all([
      pool.query('SELECT COUNT(*) as count FROM promotion_payments'),
      pool.query("SELECT COUNT(*) as count FROM promotion_payments WHERE status = 'completed'"),
      pool.query("SELECT COUNT(*) as count FROM promotion_payments WHERE status = 'pending'"),
      pool.query("SELECT SUM(amount) as total FROM promotion_payments WHERE status = 'completed'")
    ]);

    const stats = {
      total: parseInt(totalResult.rows[0].count) || 0,
      successful: parseInt(successfulResult.rows[0].count) || 0,
      pending: parseInt(pendingResult.rows[0].count) || 0,
      totalRevenue: parseFloat(revenueResult.rows[0].total) || 0
    };

    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Admin payment stats error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch payment statistics',
      error: error.message 
    });
  }
});

// Get verification requests (using admin_payment_accounts)
router.get('/verification-requests', async (req, res) => {
  try {
    const { status = 'pending' } = req.query;

    // Since admin_payment_accounts doesn't have provider_id, 
    // we'll return empty array for now or use created_by as user reference
    const query = `
      SELECT 
        apa.id, apa.account_type, apa.account_holder_name, 
        apa.account_number, apa.bank_name, apa.mobile_number,
        apa.is_active, apa.created_at, apa.updated_at,
        u.email, u.first_name, u.last_name
      FROM admin_payment_accounts apa
      LEFT JOIN users u ON apa.created_by = u.id
      WHERE apa.is_active = false
      ORDER BY apa.created_at DESC
    `;

    const result = await pool.query(query);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Admin verification requests error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch verification requests',
      error: error.message 
    });
  }
});

// Get payment accounts (for provider payouts)
router.get('/accounts', async (req, res) => {
  try {
    const query = `
      SELECT 
        apa.id, apa.account_type, apa.account_holder_name,
        apa.account_number, apa.bank_name, apa.mobile_number,
        apa.is_active, apa.created_at,
        u.email, u.first_name, u.last_name
      FROM admin_payment_accounts apa
      LEFT JOIN users u ON apa.created_by = u.id
      ORDER BY apa.created_at DESC
    `;

    const result = await pool.query(query);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Admin payment accounts error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch payment accounts',
      error: error.message 
    });
  }
});

// Get single payment by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const paymentQuery = `
      SELECT 
        pp.*, 
        sp.business_name as provider_name, sp.business_type,
        u.email as user_email, u.first_name, u.last_name, u.phone
      FROM promotion_payments pp
      LEFT JOIN service_providers sp ON pp.provider_id = sp.id
      LEFT JOIN users u ON sp.user_id = u.id
      WHERE pp.id = $1
    `;

    const result = await pool.query(paymentQuery, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Admin payment by ID error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch payment',
      error: error.message 
    });
  }
});

module.exports = router;
const express = require('express');
const router = express.Router();

// Database connection with error handling
let pool;
try {
  pool = require('../config/postgresql').pool;
} catch (error) {
  console.warn('⚠️ Database connection not available for admin payments');
}

// Get payments with pagination and filtering
router.get('/', async (req, res) => {
  try {
    if (!pool) {
      return res.json({
        success: true,
        data: {
          payments: [
            {
              id: 1,
              amount: 850,
              currency: 'USD',
              status: 'completed',
              payment_method: 'credit_card',
              transaction_reference: 'TXN_001_2026',
              created_at: '2026-03-20T15:30:00Z',
              updated_at: '2026-03-20T15:30:00Z',
              payment_type: 'service_booking',
              description: 'Safari booking payment',
              duration_days: null,
              provider_name: 'Safari Adventures Ltd',
              provider_id: 1,
              user_email: 'john.doe@example.com',
              first_name: 'John',
              last_name: 'Doe'
            },
            {
              id: 2,
              amount: 450,
              currency: 'USD',
              status: 'pending',
              payment_method: 'bank_transfer',
              transaction_reference: 'TXN_002_2026',
              created_at: '2026-03-21T10:15:00Z',
              updated_at: '2026-03-21T10:15:00Z',
              payment_type: 'service_booking',
              description: 'Cultural tour payment',
              duration_days: null,
              provider_name: 'Cultural Tours Inc',
              provider_id: 3,
              user_email: 'jane.smith@example.com',
              first_name: 'Jane',
              last_name: 'Smith'
            }
          ].slice(0, parseInt(req.query.limit || 20)),
          pagination: {
            currentPage: parseInt(req.query.page) || 1,
            totalPages: 18,
            totalItems: 342,
            itemsPerPage: parseInt(req.query.limit) || 20
          },
          message: 'Demo data - Connect database for live payment data'
        }
      });
    }

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
    if (!pool) {
      return res.json({
        success: true,
        data: {
          total: 342,
          successful: 298,
          pending: 44,
          totalRevenue: 45780.50,
          message: 'Demo data - Connect database for live statistics'
        }
      });
    }

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
    if (!pool) {
      return res.json({
        success: true,
        data: [],
        message: 'Demo data - Connect database for live verification requests'
      });
    }

    const { status = 'pending' } = req.query;

    // Check if admin_payment_accounts table exists
    const tableExistsQuery = `
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'admin_payment_accounts'
      );
    `;
    
    const tableExistsResult = await pool.query(tableExistsQuery);
    
    if (!tableExistsResult.rows[0].exists) {
      // Table doesn't exist, return empty array
      return res.json({
        success: true,
        data: [],
        message: 'No verification requests table found'
      });
    }

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
    if (!pool) {
      return res.json({
        success: true,
        accounts: [],
        message: 'No payment accounts configured'
      });
    }

    // Check if admin_payment_accounts table exists
    const tableExistsQuery = `
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'admin_payment_accounts'
      );
    `;
    
    const tableExistsResult = await pool.query(tableExistsQuery);
    
    if (!tableExistsResult.rows[0].exists) {
      // Table doesn't exist, return empty array
      return res.json({
        success: true,
        accounts: [],
        message: 'No payment accounts configured'
      });
    }

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
      accounts: result.rows
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

// Create payment account
router.post('/accounts', async (req, res) => {
  try {
    const { account_type, account_holder_name, account_number, bank_name, card_last_four, expiry_date, mobile_number, is_primary } = req.body;

    const result = await pool.query(`
      INSERT INTO admin_payment_accounts 
        (account_type, account_holder_name, account_number, bank_name, card_last_four, expiry_date, mobile_number, is_primary, is_active, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, NOW(), NOW())
      RETURNING *
    `, [account_type, account_holder_name, account_number, bank_name || null, card_last_four || null, expiry_date || null, mobile_number || null, is_primary || false]);

    res.json({ success: true, message: 'Payment account created', data: result.rows[0] });
  } catch (error) {
    console.error('Admin create account error:', error);
    res.status(500).json({ success: false, message: 'Failed to create payment account', error: error.message });
  }
});

// Update payment account
router.put('/accounts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { account_type, account_holder_name, account_number, bank_name, card_last_four, expiry_date, mobile_number, is_primary } = req.body;

    const result = await pool.query(`
      UPDATE admin_payment_accounts
      SET account_type=$1, account_holder_name=$2, account_number=$3, bank_name=$4,
          card_last_four=$5, expiry_date=$6, mobile_number=$7, is_primary=$8, updated_at=NOW()
      WHERE id=$9
      RETURNING *
    `, [account_type, account_holder_name, account_number, bank_name || null, card_last_four || null, expiry_date || null, mobile_number || null, is_primary || false, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    res.json({ success: true, message: 'Payment account updated', data: result.rows[0] });
  } catch (error) {
    console.error('Admin update account error:', error);
    res.status(500).json({ success: false, message: 'Failed to update payment account', error: error.message });
  }
});

// Delete payment account
router.delete('/accounts/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query('DELETE FROM admin_payment_accounts WHERE id=$1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    res.json({ success: true, message: 'Payment account deleted' });
  } catch (error) {
    console.error('Admin delete account error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete payment account', error: error.message });
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
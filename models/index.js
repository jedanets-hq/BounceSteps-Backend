const { pool } = require('../config/postgresql');

// User Model
const User = {
  async findByEmail(email) {
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    return result.rows[0];
  },

  async findByGoogleId(googleId) {
    const result = await pool.query(
      'SELECT * FROM users WHERE google_id = $1',
      [googleId]
    );
    return result.rows[0];
  },

  async findById(id) {
    const result = await pool.query(
      'SELECT * FROM users WHERE id = $1',
      [id]
    );
    return result.rows[0];
  },

  async create(userData) {
    const {
      email,
      password,
      first_name,
      last_name,
      phone,
      user_type,
      google_id,
      avatar_url,
      is_verified,
      auth_provider
    } = userData;

    const result = await pool.query(
      `INSERT INTO users (
        email, password, first_name, last_name, phone, 
        user_type, google_id, avatar_url, is_verified, auth_provider, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) 
      RETURNING *`,
      [
        email,
        password,
        first_name,
        last_name,
        phone,
        user_type,
        google_id || null,
        avatar_url || null,
        is_verified !== undefined ? is_verified : false,
        auth_provider || (password ? 'email' : 'google'),
        true // is_active defaults to true
      ]
    );
    return result.rows[0];
  },

  async update(id, updates) {
    const fields = [];
    const values = [];
    let paramCount = 1;

    Object.keys(updates).forEach(key => {
      fields.push(`${key} = $${paramCount}`);
      values.push(updates[key]);
      paramCount++;
    });

    values.push(id);
    const result = await pool.query(
      `UPDATE users SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $${paramCount} RETURNING *`,
      values
    );
    return result.rows[0];
  }
};

// ServiceProvider Model
const ServiceProvider = {
  async findOne(query) {
    const keys = Object.keys(query);
    const values = Object.values(query);
    
    const result = await pool.query(
      `SELECT * FROM service_providers WHERE ${keys[0]} = $1`,
      [values[0]]
    );
    return result.rows[0];
  },

  async create(providerData) {
    const {
      user_id,
      business_name,
      business_type,
      description,
      location,
      service_location,
      country,
      region,
      district,
      area,
      ward,
      location_data,
      service_categories
    } = providerData;

    const result = await pool.query(
      `INSERT INTO service_providers (
        user_id, business_name, business_type, description, 
        location, service_location, country, region, district, 
        area, ward, location_data, service_categories
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) 
      RETURNING *`,
      [
        user_id,
        business_name,
        business_type,
        description,
        location,
        service_location,
        country,
        region,
        district,
        area,
        ward,
        JSON.stringify(location_data),
        JSON.stringify(service_categories)
      ]
    );
    return result.rows[0];
  }
};

// Message Model
const Message = {
  async getConversations(userId) {
    // Get unique people the user has messaged with
    const result = await pool.query(
      `SELECT DISTINCT ON (other_user_id) 
        u.id as other_user_id, 
        u.first_name, 
        u.last_name, 
        u.avatar_url,
        m.message_text as last_message,
        m.created_at as last_message_time,
        m.is_read
      FROM (
        SELECT 
          CASE 
            WHEN traveller_id = $1 THEN provider_id 
            ELSE traveller_id 
          END as other_user_id,
          message_text,
          created_at,
          is_read,
          id
        FROM messages 
        WHERE traveller_id = $1 OR provider_id = $1
      ) m
      JOIN users u ON u.id = m.other_user_id
      ORDER BY other_user_id, m.created_at DESC`,
      [userId]
    );
    return result.rows;
  },

  async getConversation(userId, otherUserId) {
    const result = await pool.query(
      `SELECT m.*, u.first_name as sender_name
       FROM messages m
       JOIN users u ON u.id = (CASE WHEN m.sender_type = 'traveller' THEN m.traveller_id ELSE m.provider_id END)
       WHERE (m.traveller_id = $1 AND m.provider_id = $2)
          OR (m.traveller_id = $2 AND m.provider_id = $1)
       ORDER BY m.created_at ASC`,
      [userId, otherUserId]
    );
    return result.rows;
  },

  async create(messageData) {
    const { traveller_id, provider_id, service_id, sender_type, message_text } = messageData;
    const result = await pool.query(
      `INSERT INTO messages (traveller_id, provider_id, service_id, sender_type, message_text)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [traveller_id, provider_id, service_id || null, sender_type, message_text]
    );
    return result.rows[0];
  },

  async getUnreadCount(userId) {
    const result = await pool.query(
      `SELECT COUNT(*) FROM messages 
       WHERE (traveller_id = $1 OR provider_id = $1)
       AND is_read = false
       AND (
         (sender_type = 'provider' AND traveller_id = $1) OR
         (sender_type = 'traveller' AND provider_id = $1)
       )`,
      [userId]
    );
    return parseInt(result.rows[0].count);
  }
};

module.exports = { User, ServiceProvider, Message, pool };

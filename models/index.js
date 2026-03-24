const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// PostgreSQL connection - Use environment variables for production
const poolConfig = process.env.DATABASE_URL 
  ? {
      connectionString: process.env.DATABASE_URL,
      // Only use SSL in production (when NODE_ENV is production)
      ssl: process.env.NODE_ENV === 'production' 
        ? { rejectUnauthorized: false } 
        : false
    }
  : {
      user: process.env.DB_USER || 'postgres',
      host: process.env.DB_HOST || 'localhost',
      database: process.env.DB_NAME || 'isafari_db',
      password: process.env.DB_PASSWORD || 'password',
      port: process.env.DB_PORT || 5432,
    };

const pool = new Pool(poolConfig);

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

module.exports = { User, ServiceProvider, pool };

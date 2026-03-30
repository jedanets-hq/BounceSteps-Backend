const { Pool } = require('pg');

// PostgreSQL connection - Production-safe configuration for Cloud Run
const poolConfig = process.env.DATABASE_URL 
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' 
        ? { rejectUnauthorized: false } 
        : false,
      // Ensure no Unix socket usage
      host: process.env.DB_HOST || '34.42.58.123',
      port: process.env.DB_PORT || 5432,
      // Connection pool settings for Cloud Run
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    }
  : {
      user: process.env.DB_USER || 'postgres',
      host: process.env.DB_HOST || '34.42.58.123',
      database: process.env.DB_NAME || 'bouncesteps-db',
      password: process.env.DB_PASSWORD || '@JedaNets01',
      port: process.env.DB_PORT || 5432,
      ssl: process.env.NODE_ENV === 'production' && !process.env.DB_HOST ? { rejectUnauthorized: false } : false,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    };

const pool = new Pool(poolConfig);

// Test database connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Error connecting to PostgreSQL database:', err);
  } else {
    console.log('✅ Connected to PostgreSQL database');
    release();
  }
});

module.exports = { pool };

const { Pool } = require('pg');

// PostgreSQL connection - Production-safe configuration for Cloud Run
const poolConfig = process.env.DATABASE_URL 
  ? {
      connectionString: process.env.DATABASE_URL,
      // For Cloud SQL Unix socket connections, SSL is not needed
      ssl: false,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    }
  : {
      user: process.env.DB_USER || 'postgres',
      host: process.env.DB_HOST || '127.0.0.1',
      database: process.env.DB_NAME || 'bouncesteps-db',
      password: process.env.DB_PASSWORD || '@Jctnftr01',
      port: process.env.DB_PORT || 5432,
      // For Cloud SQL Unix socket connection
      ...(process.env.DB_HOST && process.env.DB_HOST.startsWith('/cloudsql/') 
        ? { host: process.env.DB_HOST } 
        : {}),
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    };

const pool = new Pool(poolConfig);

// Test database connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Error connecting to PostgreSQL database:', err.message);
    console.error('Connection config:', {
      user: poolConfig.user,
      host: poolConfig.host,
      database: poolConfig.database,
      port: poolConfig.port
    });
  } else {
    console.log('✅ Connected to PostgreSQL database');
    console.log('📊 Database:', poolConfig.database);
    release();
  }
});

module.exports = { pool };

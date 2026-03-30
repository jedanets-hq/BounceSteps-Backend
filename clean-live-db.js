require('dotenv').config();
const { Pool } = require('pg');

// Force connect to live DB (no env variables) to clean up our mess
const livePoolConfig = {
  user: 'postgres',
  host: '34.42.58.123',
  database: 'bouncesteps-db',
  password: '@JedaNets01', // Password from config
  port: 5432,
  ssl: false,
};

const livePool = new Pool(livePoolConfig);

async function cleanLiveDb() {
  try {
    console.log('Connecting to LIVE database strictly to remove dummy data...');
    const result = await livePool.query("DELETE FROM services WHERE title LIKE '[Local Preview]%' RETURNING id, title;");
    console.log(`Deleted ${result.rowCount} mock services from LIVE DB!`);
  } catch (err) {
    console.error('Error cleaning live DB:', err.message);
  } finally {
    await livePool.end();
  }
}

cleanLiveDb();

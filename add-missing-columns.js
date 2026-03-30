const { Client } = require('pg');

const client = new Client({
  user: 'postgres',
  host: '127.0.0.1',
  database: 'bouncesteps-db',
  password: 'dany@123',
  port: 5432,
});

async function run() {
  try {
    await client.connect();
    console.log('Connected to DB');

    // Add missing service details
    await client.query(`
      ALTER TABLE services 
      ADD COLUMN IF NOT EXISTS duration INTEGER,
      ADD COLUMN IF NOT EXISTS max_participants INTEGER,
      ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active',
      ADD COLUMN IF NOT EXISTS country VARCHAR(100);
    `);
    console.log('Added duration, max_participants, status, country to services');

    // Add missing provider details just in case
    await client.query(`
      ALTER TABLE service_providers 
      ADD COLUMN IF NOT EXISTS country VARCHAR(100);
    `);
    console.log('Added country to service_providers');

    console.log('Successfully updated database schema.');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.end();
  }
}

run();

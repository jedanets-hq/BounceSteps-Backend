const { Client } = require('pg');

const client = new Client({
  user: 'postgres',
  host: '127.0.0.1',
  database: 'bouncesteps-db',
  password: 'dany@123',
  port: 5432,
});

async function run() {
  await client.connect();
  let res = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'services'");
  console.log("SERVICES COLUMNS:\n", res.rows.map(r => r.column_name).join(', '));
  
  res = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'service_providers'");
  console.log("\nPROVIDERS COLUMNS:\n", res.rows.map(r => r.column_name).join(', '));
  
  res = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'bookings'");
  console.log("\nBOOKINGS COLUMNS:\n", res.rows.map(r => r.column_name).join(', '));
  
  await client.end();
}

run();

require('dotenv').config();
const { pool } = require('./models/index');

async function insertTestServices() {
  try {
    // 1. Get first user to act as our test user
    const userRes = await pool.query('SELECT id FROM users LIMIT 1');
    if (userRes.rows.length === 0) {
      console.log('No users found in database. Please register a user first.');
      return;
    }
    const userId = userRes.rows[0].id;
    
    // 2. Get their provider id
    const provRes = await pool.query('SELECT id, region, district, area, country, location, service_location FROM service_providers WHERE user_id = $1 LIMIT 1', [userId]);
    
    let providerId;
    let provider;
    
    if (provRes.rows.length > 0) {
       providerId = provRes.rows[0].id;
       provider = provRes.rows[0];
    } else {
       console.log('No provider profile found. Creating a temporary testing provider profile for the user...');
       const insertProv = await pool.query(`
          INSERT INTO service_providers (user_id, business_name, description, location, region, district, country, is_verified)
          VALUES ($1, 'Test Business Provider', 'Dummy Provider', 'Zanzibar, Nungwi', 'Zanzibar North', 'Kaskazini A', 'Tanzania', true)
          RETURNING *
       `, [userId]);
       providerId = insertProv.rows[0].id;
       provider = insertProv.rows[0];
    }
    
    // Services mock data
    const services = [
      {
        title: "[Local Preview] Luxury Beachfront Villa in Nungwi",
        description: "Experience the ultimate getaway in this luxurious beachfront villa located in Nungwi, Zanzibar. Enjoy pristine white sand beaches and crystal clear waters right at your doorstep.",
        category: "Accommodation",
        price: 250,
        images: ["https://images.unsplash.com/photo-1540541338287-41700207dee6?auto=format&fit=crop&q=80&w=1000"],
        is_trending: true,
        is_featured: true
      },
      {
        title: "[Local Preview] Dar es Salaam City Tour",
        description: "A comprehensive guided tour through the historical and modern sites of Dar es Salaam, including the National Museum, Village Museum, and local markets.",
        category: "Tours & Activities", 
        price: 45,
        images: ["https://images.unsplash.com/photo-1516483638261-f41af5e5fa27?auto=format&fit=crop&q=80&w=1000"],
        is_trending: true,
        is_featured: true
      },
      {
        title: "[Local Preview] Serengeti Hot Air Balloon Safari",
        description: "Soar above the Serengeti at dawn and witness the great migration from a breathtaking vantage point. Includes a champagne breakfast upon landing.",
        category: "Tours & Activities",
        price: 600,
        images: ["https://images.unsplash.com/photo-1518545814580-0a2c071d2b78?auto=format&fit=crop&q=80&w=1000"],
        is_trending: true,
        is_featured: true
      }
    ];

    for (const svc of services) {
       await pool.query(`
          INSERT INTO services (
            provider_id,
            title,
            description,
            category,
            price,
            duration,
            max_participants,
            location,
            region,
            district,
            area,
            country,
            images,
            amenities,
            payment_methods,
            contact_info,
            status,
            is_active,
            is_trending,
            is_featured
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
          RETURNING *
        `, [
          providerId,
          svc.title,
          svc.description,
          svc.category,
          svc.price,
          24,
          10,
          provider.location || 'Tanzania',
          provider.region || '',
          provider.district || '',
          provider.area || '',
          provider.country || 'Tanzania',
          svc.images,
          ['wifi', 'parking', 'pool'],
          JSON.stringify({ cash: {enabled: true} }),
          JSON.stringify({ email: { enabled: true, value: 'test@example.com' } }),
          'active',
          true,
          svc.is_trending,
          svc.is_featured
        ]);
        console.log(`Inserted service: ${svc.title}`);
    }
    
    console.log('SUCCESS: Seeded dummy services! They should now appear on the home slide and trending sections.');
    
  } catch (error) {
    console.error('DATABASE ERROR:', error);
  } finally {
    process.exit(0);
  }
}

insertTestServices();

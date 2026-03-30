const { pool } = require('./models/index');

async function testInsert() {
  try {
    // 1. Get first user to act as our test user
    const userRes = await pool.query('SELECT id FROM users LIMIT 1');
    if (userRes.rows.length === 0) {
      console.log('No users found in database.');
      return;
    }
    const userId = userRes.rows[0].id;
    
    // 2. Get their provider id
    const provRes = await pool.query('SELECT id, region, district, area, country, location, service_location FROM service_providers WHERE user_id = $1 LIMIT 1', [userId]);
    
    let providerId;
    let provider = {};
    if (provRes.rows.length === 0) {
       console.log('No service providers found for user. Will try inserting with generic provider_id = 1');
       providerId = 1;
       provider = { region: 'test', district: 'test', area: 'test', country: 'test', location: 'test' };
    } else {
       providerId = provRes.rows[0].id;
       provider = provRes.rows[0];
    }

    console.log('Using providerId:', providerId);

    // 3. Attempt to insert a test service exactly like the POST route does.
    const result = await pool.query(`
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
        is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING *
    `, [
      providerId,
      'Test Service',
      'Test Description',
      'Accommodation',
      1000,
      24,
      10,
      provider.location || 'Tanzania',
      provider.region || '',
      provider.district || '',
      provider.area || '',
      provider.country || 'Tanzania',
      JSON.stringify(['image1.jpg']),
      JSON.stringify(['wifi']),
      JSON.stringify({ cash: true }),
      JSON.stringify({ email: { enabled: true, value: 'test@example.com' } }),
      'active',
      true
    ]);
    
    console.log('SUCCESS!');
    console.log(result.rows[0]);
    
    // Cleanup the test service
    await pool.query('DELETE FROM services WHERE id = $1', [result.rows[0].id]);
    
  } catch (error) {
    console.error('DATABASE ERROR:');
    console.error(error.message);
  } finally {
    process.exit(0);
  }
}

testInsert();

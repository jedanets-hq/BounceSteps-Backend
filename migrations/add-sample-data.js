/**
 * Add sample data for testing popular destinations and services
 */

const { pool } = require('../config/postgresql');

async function addSampleData() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 Adding sample data...');
    
    // First, create the services table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS services (
        id SERIAL PRIMARY KEY,
        provider_id INTEGER NOT NULL REFERENCES service_providers(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        category VARCHAR(100) NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        duration VARCHAR(100),
        max_participants INTEGER,
        location TEXT,
        region VARCHAR(100),
        district VARCHAR(100),
        area VARCHAR(100),
        country VARCHAR(100) DEFAULT 'Tanzania',
        images TEXT DEFAULT '[]',
        amenities TEXT DEFAULT '[]',
        payment_methods TEXT DEFAULT '{}',
        contact_info TEXT DEFAULT '{}',
        status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending')),
        is_active BOOLEAN DEFAULT true,
        is_featured BOOLEAN DEFAULT false,
        is_trending BOOLEAN DEFAULT false,
        average_rating DECIMAL(3,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Services table ready');

    // Create traveler_stories table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS traveler_stories (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        story TEXT NOT NULL,
        location VARCHAR(255),
        images TEXT DEFAULT '[]',
        status VARCHAR(20) DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected')),
        likes_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Traveler stories table ready');

    // Check if we already have sample data
    const existingServices = await client.query('SELECT COUNT(*) FROM services');
    if (parseInt(existingServices.rows[0].count) > 0) {
      console.log('✅ Sample data already exists, skipping...');
      return;
    }

    // Create sample users first
    console.log('📝 Creating sample users...');
    
    const sampleUsers = [
      {
        email: 'provider1@example.com',
        first_name: 'John',
        last_name: 'Safari',
        user_type: 'service_provider',
        is_verified: true
      },
      {
        email: 'provider2@example.com', 
        first_name: 'Mary',
        last_name: 'Tours',
        user_type: 'service_provider',
        is_verified: true
      },
      {
        email: 'provider3@example.com',
        first_name: 'David',
        last_name: 'Adventures',
        user_type: 'service_provider', 
        is_verified: true
      },
      {
        email: 'provider4@example.com',
        first_name: 'Sarah',
        last_name: 'Hotels',
        user_type: 'service_provider',
        is_verified: true
      },
      {
        email: 'traveler1@example.com',
        first_name: 'Alice',
        last_name: 'Johnson',
        user_type: 'traveler',
        is_verified: true
      }
    ];

    const userIds = [];
    for (const user of sampleUsers) {
      const result = await client.query(`
        INSERT INTO users (email, first_name, last_name, user_type, is_verified, is_active, password)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (email) DO UPDATE SET
          first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name,
          user_type = EXCLUDED.user_type,
          is_verified = EXCLUDED.is_verified
        RETURNING id
      `, [user.email, user.first_name, user.last_name, user.user_type, user.is_verified, true, 'sample123']);
      userIds.push(result.rows[0].id);
    }

    console.log('✅ Sample users created');

    // Create sample service providers
    console.log('📝 Creating sample service providers...');
    
    const sampleProviders = [
      {
        user_id: userIds[0],
        business_name: 'Serengeti Safari Tours',
        business_type: 'Tour Operator',
        description: 'Professional safari tours in Northern Tanzania',
        location: 'Arusha, Tanzania',
        region: 'Arusha',
        district: 'Arusha Urban',
        area: 'Kaloleni',
        country: 'Tanzania',
        is_verified: true,
        rating: 4.8
      },
      {
        user_id: userIds[1],
        business_name: 'Zanzibar Beach Resort',
        business_type: 'Hotel & Resort',
        description: 'Luxury beachfront accommodation in Zanzibar',
        location: 'Stone Town, Zanzibar',
        region: 'Zanzibar',
        district: 'Zanzibar Urban',
        area: 'Stone Town',
        country: 'Tanzania',
        is_verified: true,
        rating: 4.6
      },
      {
        user_id: userIds[2],
        business_name: 'Mwanza Lake Adventures',
        business_type: 'Adventure Tours',
        description: 'Lake Victoria boat tours and rock climbing',
        location: 'Mwanza, Tanzania',
        region: 'Mwanza',
        district: 'Ilemela',
        area: 'Nyamagana',
        country: 'Tanzania',
        is_verified: true,
        rating: 4.5
      },
      {
        user_id: userIds[3],
        business_name: 'Dar es Salaam City Hotels',
        business_type: 'Hotel',
        description: 'Modern city hotels in the commercial capital',
        location: 'Dar es Salaam, Tanzania',
        region: 'Dar es Salaam',
        district: 'Kinondoni',
        area: 'Masaki',
        country: 'Tanzania',
        is_verified: true,
        rating: 4.3
      }
    ];

    const providerIds = [];
    for (const provider of sampleProviders) {
      const result = await client.query(`
        INSERT INTO service_providers (
          user_id, business_name, business_type, description, location, 
          region, district, area, country, is_verified, rating
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (user_id) DO UPDATE SET
          business_name = EXCLUDED.business_name,
          business_type = EXCLUDED.business_type,
          description = EXCLUDED.description,
          location = EXCLUDED.location,
          region = EXCLUDED.region,
          district = EXCLUDED.district,
          area = EXCLUDED.area,
          is_verified = EXCLUDED.is_verified,
          rating = EXCLUDED.rating
        RETURNING id
      `, [
        provider.user_id, provider.business_name, provider.business_type,
        provider.description, provider.location, provider.region,
        provider.district, provider.area, provider.country,
        provider.is_verified, provider.rating
      ]);
      providerIds.push(result.rows[0].id);
    }

    console.log('✅ Sample service providers created');

    // Create sample services
    console.log('📝 Creating sample services...');
    
    const sampleServices = [
      // Arusha Services
      {
        provider_id: providerIds[0],
        title: 'Serengeti National Park Safari',
        description: 'Experience the Great Migration and Big Five in Tanzania\'s most famous national park. Professional guides, comfortable vehicles, and unforgettable wildlife encounters.',
        category: 'Safari & Wildlife',
        price: 450000,
        duration: '3 days',
        max_participants: 6,
        location: 'Serengeti National Park',
        region: 'Arusha',
        district: 'Serengeti',
        area: 'Seronera',
        images: JSON.stringify(['/serengeti1.jpg', '/serengeti2.jpg']),
        amenities: JSON.stringify(['Professional Guide', 'Game Drive Vehicle', 'Park Fees', 'Lunch']),
        payment_methods: JSON.stringify({
          visa: { enabled: true },
          mobileMoney: { enabled: true },
          paypal: { enabled: false }
        }),
        contact_info: JSON.stringify({
          email: { enabled: true, address: 'info@serengetisafari.com' },
          whatsapp: { enabled: true, number: '+255123456789' }
        }),
        is_featured: true,
        is_trending: true,
        average_rating: 4.8
      },
      {
        provider_id: providerIds[0],
        title: 'Ngorongoro Crater Tour',
        description: 'Explore the world\'s largest intact volcanic caldera, home to over 25,000 large animals including the Big Five.',
        category: 'Safari & Wildlife',
        price: 280000,
        duration: '1 day',
        max_participants: 8,
        location: 'Ngorongoro Conservation Area',
        region: 'Arusha',
        district: 'Ngorongoro',
        area: 'Crater',
        images: JSON.stringify(['/ngorongoro1.jpg', '/ngorongoro2.jpg']),
        amenities: JSON.stringify(['Professional Guide', 'Crater Fees', 'Picnic Lunch', '4WD Vehicle']),
        payment_methods: JSON.stringify({
          visa: { enabled: true },
          mobileMoney: { enabled: true },
          paypal: { enabled: false }
        }),
        contact_info: JSON.stringify({
          email: { enabled: true, address: 'info@serengetisafari.com' },
          whatsapp: { enabled: true, number: '+255123456789' }
        }),
        is_featured: true,
        average_rating: 4.7
      },
      
      // Zanzibar Services
      {
        provider_id: providerIds[1],
        title: 'Luxury Beach Resort Stay',
        description: 'Relax in our 5-star beachfront resort with pristine white sand beaches, crystal clear waters, and world-class amenities.',
        category: 'Accommodation',
        price: 180000,
        duration: 'per night',
        max_participants: 4,
        location: 'Nungwi Beach, Zanzibar',
        region: 'Zanzibar',
        district: 'Kaskazini A',
        area: 'Nungwi',
        images: JSON.stringify(['/zanzibar-resort1.jpg', '/zanzibar-resort2.jpg']),
        amenities: JSON.stringify(['Ocean View', 'Swimming Pool', 'Spa', 'Restaurant', 'WiFi', 'Air Conditioning']),
        payment_methods: JSON.stringify({
          visa: { enabled: true },
          mobileMoney: { enabled: true },
          paypal: { enabled: true }
        }),
        contact_info: JSON.stringify({
          email: { enabled: true, address: 'reservations@zanzibarresort.com' },
          whatsapp: { enabled: true, number: '+255987654321' }
        }),
        is_featured: true,
        is_trending: true,
        average_rating: 4.6
      },
      {
        provider_id: providerIds[1],
        title: 'Stone Town Cultural Tour',
        description: 'Discover the rich history and culture of Zanzibar\'s UNESCO World Heritage Stone Town with our expert local guides.',
        category: 'Cultural Tours',
        price: 45000,
        duration: '4 hours',
        max_participants: 12,
        location: 'Stone Town, Zanzibar',
        region: 'Zanzibar',
        district: 'Zanzibar Urban',
        area: 'Stone Town',
        images: JSON.stringify(['/stonetown1.jpg', '/stonetown2.jpg']),
        amenities: JSON.stringify(['Local Guide', 'Historical Sites', 'Spice Market Visit', 'Cultural Experience']),
        payment_methods: JSON.stringify({
          visa: { enabled: true },
          mobileMoney: { enabled: true },
          paypal: { enabled: false }
        }),
        contact_info: JSON.stringify({
          email: { enabled: true, address: 'tours@zanzibarresort.com' },
          whatsapp: { enabled: true, number: '+255987654321' }
        }),
        average_rating: 4.4
      },
      
      // Mwanza Services
      {
        provider_id: providerIds[2],
        title: 'Lake Victoria Boat Safari',
        description: 'Explore Africa\'s largest lake with fishing, bird watching, and visits to remote islands. Perfect for nature lovers.',
        category: 'Water Sports',
        price: 85000,
        duration: '6 hours',
        max_participants: 10,
        location: 'Lake Victoria, Mwanza',
        region: 'Mwanza',
        district: 'Ilemela',
        area: 'Nyamagana',
        images: JSON.stringify(['/lakevictoria1.jpg', '/lakevictoria2.jpg']),
        amenities: JSON.stringify(['Boat Transport', 'Fishing Equipment', 'Life Jackets', 'Lunch', 'Guide']),
        payment_methods: JSON.stringify({
          visa: { enabled: true },
          mobileMoney: { enabled: true },
          paypal: { enabled: false }
        }),
        contact_info: JSON.stringify({
          email: { enabled: true, address: 'info@mwanzaadventures.com' },
          whatsapp: { enabled: true, number: '+255765432109' }
        }),
        is_trending: true,
        average_rating: 4.5
      },
      {
        provider_id: providerIds[2],
        title: 'Rock City Climbing Adventure',
        description: 'Challenge yourself with rock climbing on Mwanza\'s famous granite rocks. Suitable for beginners and experienced climbers.',
        category: 'Adventure Sports',
        price: 65000,
        duration: '4 hours',
        max_participants: 6,
        location: 'Bismarck Rock, Mwanza',
        region: 'Mwanza',
        district: 'Ilemela',
        area: 'Nyamagana',
        images: JSON.stringify(['/rockclimbing1.jpg', '/rockclimbing2.jpg']),
        amenities: JSON.stringify(['Climbing Equipment', 'Safety Gear', 'Professional Instructor', 'Insurance']),
        payment_methods: JSON.stringify({
          visa: { enabled: true },
          mobileMoney: { enabled: true },
          paypal: { enabled: false }
        }),
        contact_info: JSON.stringify({
          email: { enabled: true, address: 'climbing@mwanzaadventures.com' },
          whatsapp: { enabled: true, number: '+255765432109' }
        }),
        average_rating: 4.3
      },
      
      // Dar es Salaam Services
      {
        provider_id: providerIds[3],
        title: 'Modern City Hotel',
        description: 'Stay in the heart of Tanzania\'s commercial capital with modern amenities, business facilities, and easy access to the city.',
        category: 'Accommodation',
        price: 120000,
        duration: 'per night',
        max_participants: 2,
        location: 'Masaki, Dar es Salaam',
        region: 'Dar es Salaam',
        district: 'Kinondoni',
        area: 'Masaki',
        images: JSON.stringify(['/dar-hotel1.jpg', '/dar-hotel2.jpg']),
        amenities: JSON.stringify(['Business Center', 'WiFi', 'Restaurant', 'Gym', 'Conference Rooms', 'Airport Shuttle']),
        payment_methods: JSON.stringify({
          visa: { enabled: true },
          mobileMoney: { enabled: true },
          paypal: { enabled: true }
        }),
        contact_info: JSON.stringify({
          email: { enabled: true, address: 'reservations@darcityhotel.com' },
          whatsapp: { enabled: true, number: '+255654321098' }
        }),
        is_featured: true,
        average_rating: 4.3
      },
      {
        provider_id: providerIds[3],
        title: 'Dar es Salaam City Tour',
        description: 'Explore Tanzania\'s largest city including markets, museums, beaches, and cultural sites with our knowledgeable guides.',
        category: 'City Tours',
        price: 55000,
        duration: '5 hours',
        max_participants: 8,
        location: 'Dar es Salaam City Center',
        region: 'Dar es Salaam',
        district: 'Ilala',
        area: 'City Center',
        images: JSON.stringify(['/dar-city1.jpg', '/dar-city2.jpg']),
        amenities: JSON.stringify(['City Guide', 'Transport', 'Market Visit', 'Museum Entry', 'Local Lunch']),
        payment_methods: JSON.stringify({
          visa: { enabled: true },
          mobileMoney: { enabled: true },
          paypal: { enabled: false }
        }),
        contact_info: JSON.stringify({
          email: { enabled: true, address: 'tours@darcityhotel.com' },
          whatsapp: { enabled: true, number: '+255654321098' }
        }),
        average_rating: 4.1
      }
    ];

    for (const service of sampleServices) {
      await client.query(`
        INSERT INTO services (
          provider_id, title, description, category, price, duration, max_participants,
          location, region, district, area, country, images, amenities, 
          payment_methods, contact_info, status, is_active, is_featured, 
          is_trending, average_rating
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
      `, [
        service.provider_id, service.title, service.description, service.category,
        service.price, service.duration, service.max_participants, service.location,
        service.region, service.district, service.area, 'Tanzania',
        service.images, service.amenities, service.payment_methods,
        service.contact_info, 'active', true, service.is_featured || false,
        service.is_trending || false, service.average_rating
      ]);
    }

    console.log('✅ Sample services created');

    // Create sample traveler stories
    console.log('📝 Creating sample traveler stories...');
    
    const sampleStories = [
      {
        user_id: userIds[4], // traveler user
        title: 'Amazing Safari Experience in Serengeti',
        story: 'Just returned from an incredible 3-day safari in Serengeti National Park. Saw the Big Five and witnessed the Great Migration. The guides were knowledgeable and the experience was unforgettable!',
        location: 'Serengeti National Park',
        images: JSON.stringify(['/story-serengeti1.jpg', '/story-serengeti2.jpg']),
        status: 'approved',
        likes_count: 15
      },
      {
        user_id: userIds[4],
        title: 'Paradise Found in Zanzibar',
        story: 'Spent a week in Zanzibar and it was pure paradise. The beaches are pristine, the culture is rich, and the food is amazing. Stone Town is a must-visit for history lovers.',
        location: 'Zanzibar',
        images: JSON.stringify(['/story-zanzibar1.jpg', '/story-zanzibar2.jpg']),
        status: 'approved',
        likes_count: 23
      },
      {
        user_id: userIds[4],
        title: 'Rock Climbing Adventure in Mwanza',
        story: 'Had an amazing rock climbing experience in Mwanza. The granite rocks provide excellent climbing opportunities and the views of Lake Victoria are breathtaking.',
        location: 'Mwanza',
        images: JSON.stringify(['/story-mwanza1.jpg']),
        status: 'approved',
        likes_count: 8
      }
    ];

    for (const story of sampleStories) {
      await client.query(`
        INSERT INTO traveler_stories (user_id, title, story, location, images, status, likes_count)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [story.user_id, story.title, story.story, story.location, story.images, story.status, story.likes_count]);
    }

    console.log('✅ Sample traveler stories created');
    console.log('✅ Sample data creation completed!');
    
  } catch (error) {
    console.error('❌ Sample data creation error:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { addSampleData };

// Run if called directly
if (require.main === module) {
  addSampleData()
    .then(() => {
      console.log('✅ Sample data added successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Failed to add sample data:', error);
      process.exit(1);
    });
}
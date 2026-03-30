const https = require('https');

function makeRequest(method, path, data) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'bouncestepsnetworkglobal-2.onrender.com',
      port: 443,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: JSON.parse(body)
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: body
          });
        }
      });
    });

    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

async function diagnose() {
  console.log('🔍 DIAGNOSING LOGIN 500 ERROR\n');
  console.log('═'.repeat(60));
  
  // Test 1: Backend Health
  console.log('\n1️⃣  Backend Health Check');
  console.log('─'.repeat(60));
  try {
    const health = await makeRequest('GET', '/api/health');
    if (health.status === 200) {
      console.log('✅ Backend is running');
      console.log('   Response:', JSON.stringify(health.body, null, 2));
    } else {
      console.log('❌ Backend health check failed');
      console.log('   Status:', health.status);
    }
  } catch (error) {
    console.log('❌ Cannot reach backend:', error.message);
    return;
  }
  
  // Test 2: Database Health (if endpoint exists)
  console.log('\n2️⃣  Database Health Check');
  console.log('─'.repeat(60));
  try {
    const dbHealth = await makeRequest('GET', '/api/health/database');
    if (dbHealth.status === 200) {
      console.log('✅ Database is connected');
      console.log('   Response:', JSON.stringify(dbHealth.body, null, 2));
    } else {
      console.log('⚠️  Database health endpoint not available or failing');
      console.log('   Status:', dbHealth.status);
    }
  } catch (error) {
    console.log('⚠️  Database health check not available');
  }
  
  // Test 3: Try Login with Known Users
  console.log('\n3️⃣  Testing Login with Known Users');
  console.log('─'.repeat(60));
  
  const testUsers = [
    { email: 'joctee@gmail.com', password: '123456', name: 'Joctee (known to exist)' },
    { email: 'test@example.com', password: '123456', name: 'Test User' },
    { email: 'admin@bouncesteps.com', password: 'admin123', name: 'Admin' }
  ];
  
  for (const user of testUsers) {
    console.log(`\n   Testing: ${user.name}`);
    console.log(`   Email: ${user.email}`);
    try {
      const login = await makeRequest('POST', '/api/auth/login', {
        email: user.email,
        password: user.password
      });
      
      console.log(`   Status: ${login.status}`);
      
      if (login.status === 200) {
        console.log('   ✅ LOGIN SUCCESSFUL!');
        console.log('   User:', login.body.user?.email);
        console.log('   Type:', login.body.user?.userType);
        console.log('\n   🎉 USE THESE CREDENTIALS TO LOGIN:');
        console.log(`   📧 Email: ${user.email}`);
        console.log(`   🔑 Password: ${user.password}`);
        return; // Stop after first successful login
      } else if (login.status === 401) {
        console.log('   ⚠️  Invalid credentials (user may exist but wrong password)');
        console.log('   Message:', login.body.message);
        console.log('   Field:', login.body.field);
      } else if (login.status === 500) {
        console.log('   ❌ SERVER ERROR (500)');
        console.log('   Message:', login.body.message);
        console.log('   This indicates a backend/database issue');
      } else {
        console.log('   Response:', JSON.stringify(login.body, null, 2));
      }
    } catch (error) {
      console.log('   ❌ Error:', error.message);
    }
  }
  
  // Test 4: Try Registration
  console.log('\n4️⃣  Testing User Registration');
  console.log('─'.repeat(60));
  
  const newUser = {
    email: `test${Date.now()}@bouncesteps.com`,
    password: 'Test123456',
    firstName: 'Test',
    lastName: 'User',
    userType: 'traveler',
    phone: '+255700000000'
  };
  
  console.log(`   Attempting to register: ${newUser.email}`);
  try {
    const register = await makeRequest('POST', '/api/auth/register', newUser);
    console.log(`   Status: ${register.status}`);
    
    if (register.status === 201 || register.status === 200) {
      console.log('   ✅ REGISTRATION SUCCESSFUL!');
      console.log('   User created:', register.body.user?.email);
      console.log('\n   🎉 USE THESE CREDENTIALS TO LOGIN:');
      console.log(`   📧 Email: ${newUser.email}`);
      console.log(`   🔑 Password: ${newUser.password}`);
    } else if (register.status === 500) {
      console.log('   ❌ SERVER ERROR (500) - Database Issue');
      console.log('   Message:', register.body.message);
      console.log('\n   🔧 DIAGNOSIS:');
      console.log('   - Database connection may be failing');
      console.log('   - Required tables may not exist');
      console.log('   - Migrations may not have run');
      console.log('\n   📋 NEXT STEPS:');
      console.log('   1. Check Render dashboard logs');
      console.log('   2. Verify DATABASE_URL environment variable');
      console.log('   3. Run migrations manually if needed');
      console.log('   4. Check if "users" table exists in database');
    } else {
      console.log('   Response:', JSON.stringify(register.body, null, 2));
    }
  } catch (error) {
    console.log('   ❌ Error:', error.message);
  }
  
  // Summary
  console.log('\n═'.repeat(60));
  console.log('📊 DIAGNOSIS SUMMARY');
  console.log('═'.repeat(60));
  console.log('\nIf you see 500 errors above:');
  console.log('  → Check Render backend logs for detailed error messages');
  console.log('  → Verify database connection and schema');
  console.log('  → Ensure migrations have run successfully');
  console.log('\nIf you see 401 errors:');
  console.log('  → User exists but password is wrong');
  console.log('  → Try password reset or use different credentials');
  console.log('\nFor immediate access:');
  console.log('  → Check if any login above was successful');
  console.log('  → Or create user directly in database');
  console.log('\n');
}

diagnose().catch(console.error);

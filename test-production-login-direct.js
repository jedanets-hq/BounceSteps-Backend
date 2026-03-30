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

async function test() {
  console.log('🔍 Testing Production Backend Login\n');
  
  // Test 1: Health check
  console.log('1. Health Check:');
  try {
    const health = await makeRequest('GET', '/api/health');
    console.log(`   Status: ${health.status}`);
    console.log(`   Response:`, health.body);
  } catch (error) {
    console.log(`   ❌ Error:`, error.message);
  }
  
  // Test 2: Login with empty body (should get validation error)
  console.log('\n2. Login with empty body:');
  try {
    const empty = await makeRequest('POST', '/api/auth/login', {});
    console.log(`   Status: ${empty.status}`);
    console.log(`   Response:`, JSON.stringify(empty.body, null, 2));
  } catch (error) {
    console.log(`   ❌ Error:`, error.message);
  }
  
  // Test 3: Login with invalid email format
  console.log('\n3. Login with invalid email:');
  try {
    const invalid = await makeRequest('POST', '/api/auth/login', {
      email: 'notanemail',
      password: '123456'
    });
    console.log(`   Status: ${invalid.status}`);
    console.log(`   Response:`, JSON.stringify(invalid.body, null, 2));
  } catch (error) {
    console.log(`   ❌ Error:`, error.message);
  }
  
  // Test 4: Login with valid format but non-existent user
  console.log('\n4. Login with non-existent user:');
  try {
    const nonexistent = await makeRequest('POST', '/api/auth/login', {
      email: 'nonexistent@test.com',
      password: '123456'
    });
    console.log(`   Status: ${nonexistent.status}`);
    console.log(`   Response:`, JSON.stringify(nonexistent.body, null, 2));
  } catch (error) {
    console.log(`   ❌ Error:`, error.message);
  }
  
  // Test 5: Try to register a new user
  console.log('\n5. Register new test user:');
  try {
    const register = await makeRequest('POST', '/api/auth/register', {
      email: 'quicktest@bouncesteps.com',
      password: 'Test123456',
      firstName: 'Quick',
      lastName: 'Test',
      userType: 'traveler',
      phone: '+255700000000'
    });
    console.log(`   Status: ${register.status}`);
    console.log(`   Response:`, JSON.stringify(register.body, null, 2));
    
    if (register.status === 201 || register.status === 200) {
      console.log('\n   ✅ Registration successful! Testing login...');
      
      const login = await makeRequest('POST', '/api/auth/login', {
        email: 'quicktest@bouncesteps.com',
        password: 'Test123456'
      });
      console.log(`   Login Status: ${login.status}`);
      console.log(`   Login Response:`, JSON.stringify(login.body, null, 2));
    }
  } catch (error) {
    console.log(`   ❌ Error:`, error.message);
  }
}

test().catch(console.error);

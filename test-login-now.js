// Test login on production backend
const https = require('https');

const API_HOST = 'isafarinetworkglobal-2.onrender.com';

function makeRequest(path, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: API_HOST,
      port: 443,
      path: `/api${path}`,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (data) {
      const jsonData = JSON.stringify(data);
      options.headers['Content-Length'] = Buffer.byteLength(jsonData);
    }

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function testLogin() {
  console.log('🔍 Testing Login on Production Backend');
  console.log('=' .repeat(50));
  
  // Get email and password from command line args
  const email = process.argv[2];
  const password = process.argv[3];
  
  if (!email || !password) {
    console.log('Usage: node test-login-now.js <email> <password>');
    console.log('Example: node test-login-now.js myemail@gmail.com mypassword123');
    return;
  }
  
  console.log(`\n📧 Testing login for: ${email}`);
  
  try {
    const result = await makeRequest('/auth/login', 'POST', { email, password });
    
    console.log(`\n📊 Response Status: ${result.status}`);
    console.log('📋 Response Data:', JSON.stringify(result.data, null, 2));
    
    if (result.data.success) {
      console.log('\n✅ LOGIN SUCCESSFUL!');
      console.log('User:', result.data.user?.email);
      console.log('User Type:', result.data.user?.userType);
    } else {
      console.log('\n❌ LOGIN FAILED');
      console.log('Error:', result.data.message);
      
      // Possible reasons
      console.log('\n🔍 Possible reasons:');
      console.log('1. Email not found in database');
      console.log('2. Password is incorrect');
      console.log('3. User was registered with Google (no password)');
      console.log('4. Backend needs to be redeployed with latest code');
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testLogin();

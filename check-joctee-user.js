// Script to check joctee user and fix password issue
const https = require('https');

// First, let's try to check if the user has a password by attempting login
// and analyzing the error

async function makeRequest(path, method, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'bouncestepsnetworkglobal-2.onrender.com',
      port: 443,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (data) {
      options.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(data));
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

async function main() {
  console.log('=== Checking joctee@gmail.com user ===\n');

  // Try login with provided password
  console.log('1. Trying login with password: 1234567');
  const loginResult = await makeRequest('/api/auth/login', 'POST', {
    email: 'joctee@gmail.com',
    password: '1234567'
  });
  console.log('   Status:', loginResult.status);
  console.log('   Response:', JSON.stringify(loginResult.data, null, 2));

  // Try with common test passwords
  const testPasswords = ['123456', '12345678', 'password', 'Password123'];
  
  for (const pwd of testPasswords) {
    console.log(`\n2. Trying login with password: ${pwd}`);
    const result = await makeRequest('/api/auth/login', 'POST', {
      email: 'joctee@gmail.com',
      password: pwd
    });
    console.log('   Status:', result.status);
    if (result.status === 200) {
      console.log('   SUCCESS! Password is:', pwd);
      break;
    } else {
      console.log('   Failed:', result.data.message);
    }
  }
}

main().catch(console.error);

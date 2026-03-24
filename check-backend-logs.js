const axios = require('axios');

const API_URL = 'https://isafarinetworkglobal-2.onrender.com/api';

async function testLogin() {
  console.log('🔍 Testing login with detailed error logging...\n');
  
  const testCredentials = [
    { email: 'test@example.com', password: '123456' },
    { email: 'joctee@gmail.com', password: '123456' },
    { email: 'provider@test.com', password: '123456' },
    { email: 'traveler@test.com', password: '123456' }
  ];

  for (const creds of testCredentials) {
    try {
      console.log(`\n📧 Testing: ${creds.email}`);
      const response = await axios.post(`${API_URL}/auth/login`, creds, {
        headers: { 'Content-Type': 'application/json' },
        validateStatus: () => true // Don't throw on any status
      });
      
      console.log(`   Status: ${response.status}`);
      console.log(`   Response:`, JSON.stringify(response.data, null, 2));
      
      if (response.status === 200) {
        console.log('   ✅ LOGIN SUCCESSFUL!');
        return;
      }
    } catch (error) {
      console.log(`   ❌ Error:`, error.message);
      if (error.response) {
        console.log(`   Response:`, error.response.data);
      }
    }
  }
}

testLogin();

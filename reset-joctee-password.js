// Script to reset joctee@gmail.com password
// Run this on the backend server or with DATABASE_URL set

const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

// Use Render's DATABASE_URL
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://isafarimasterorg_user:IuNv7yEfLRiDQL96cgmsxr2751MiBjsq@dpg-d5nhs5t6ubrc73asfksg-a.frankfurt-postgres.render.com/isafarimasterorg';

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function resetPassword() {
  try {
    console.log('Connecting to database...');
    
    // First check if user exists and has password
    const checkResult = await pool.query(
      "SELECT id, email, password IS NOT NULL as has_password FROM users WHERE email = $1",
      ['joctee@gmail.com']
    );
    
    if (checkResult.rows.length === 0) {
      console.log('User joctee@gmail.com not found!');
      return;
    }
    
    const user = checkResult.rows[0];
    console.log('User found:', user);
    console.log('Has password:', user.has_password);
    
    // Hash new password
    const newPassword = '1234567';
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    console.log('New hashed password generated');
    
    // Update password
    const updateResult = await pool.query(
      "UPDATE users SET password = $1, updated_at = NOW() WHERE email = $2 RETURNING id, email",
      [hashedPassword, 'joctee@gmail.com']
    );
    
    console.log('Password updated for:', updateResult.rows[0]);
    console.log('\n✅ Password reset successful!');
    console.log('Email: joctee@gmail.com');
    console.log('New Password: 1234567');
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

resetPassword();

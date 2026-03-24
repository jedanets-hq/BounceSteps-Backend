// Email Configuration Example
// Copy this file to email-config.js and update with your settings

module.exports = {
  // Admin email address (used as sender)
  ADMIN_EMAIL: 'admin@must.ac.tz',
  
  // SMTP Configuration
  EMAIL_CONFIG: {
    // For Gmail
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: 'admin@must.ac.tz', // Your Gmail address
      pass: 'your-app-password' // Your Gmail app password
    }
    
    // For other email providers, update accordingly:
    // 
    // For Outlook/Hotmail:
    // host: 'smtp-mail.outlook.com',
    // port: 587,
    // secure: false,
    // auth: {
    //   user: 'your-email@outlook.com',
    //   pass: 'your-password'
    // }
    //
    // For Yahoo:
    // host: 'smtp.mail.yahoo.com',
    // port: 587,
    // secure: false,
    // auth: {
    //   user: 'your-email@yahoo.com',
    //   pass: 'your-app-password'
    // }
    //
    // For custom SMTP server:
    // host: 'your-smtp-server.com',
    // port: 587, // or 465 for secure
    // secure: false, // true for 465, false for other ports
    // auth: {
    //   user: 'your-username',
    //   pass: 'your-password'
    // }
  }
};

// Gmail App Password Setup:
// 1. Go to your Google Account settings
// 2. Enable 2-factor authentication
// 3. Go to https://myaccount.google.com/apppasswords
// 4. Generate an app password for "Mail"
// 5. Use that 16-character password in the config above

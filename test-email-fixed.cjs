// Test script to verify Gmail email sending
const nodemailer = require('nodemailer');

const EMAIL_CONFIG = {
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: 'mfungojoctan01@gmail.com',
    pass: 'wjqp wnqp qdxh rnhp'
  }
};

async function testEmailSending() {
  console.log('🧪 Testing Gmail SMTP Configuration...');
  console.log('📧 From:', EMAIL_CONFIG.auth.user);
  
  try {
    // Create transporter
    const transporter = nodemailer.createTransporter(EMAIL_CONFIG);
    
    // Verify connection
    console.log('📡 Verifying SMTP connection...');
    const verified = await transporter.verify();
    console.log('✅ SMTP connection verified:', verified);
    
    // Send test email
    console.log('📧 Sending test email...');
    const mailOptions = {
      from: '"MUST LMS Test" <mfungojoctan01@gmail.com>',
      to: 'mfungojoctan01@gmail.com', // Send to self for testing
      subject: 'Test Email - MUST LMS Password Reset',
      text: 'This is a test email to verify Gmail SMTP configuration.',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #1e40af;">MUST LMS - Email Test</h1>
          <p>This is a test email to verify that Gmail SMTP is working.</p>
          <div style="background: #dbeafe; padding: 15px; border-radius: 6px; margin: 20px 0;">
            <p style="color: #1e40af; font-size: 24px; font-weight: bold; text-align: center; margin: 0;">
              Test Code: 123456
            </p>
          </div>
          <p>If you received this email, password reset emails will work!</p>
        </div>
      `
    };
    
    const result = await transporter.sendMail(mailOptions);
    console.log('✅ Test email sent successfully!');
    console.log('📧 Message ID:', result.messageId);
    
    console.log('\n🎉 Gmail SMTP Configuration is working correctly!');
    console.log('✅ Password reset emails will be delivered to users');
    
  } catch (error) {
    console.error('❌ Email test failed:', error.message);
    console.error('Full error:', error);
    
    if (error.code === 'EAUTH') {
      console.log('\n🔧 Authentication Error - App password might be incorrect');
    } else if (error.code === 'ENOTFOUND') {
      console.log('\n🔧 Network Error - Check internet connection');
    }
  }
}

// Run the test
testEmailSending();

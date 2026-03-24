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
  
  try {
    // Create transporter
    const transporter = nodemailer.createTransporter(EMAIL_CONFIG);
    
    // Verify connection
    console.log('📡 Verifying SMTP connection...');
    await transporter.verify();
    console.log('✅ SMTP connection verified successfully!');
    
    // Send test email
    console.log('📧 Sending test email...');
    const mailOptions = {
      from: '"MUST LMS Test" <mfungojoctan01@gmail.com>',
      to: 'mfungojoctan01@gmail.com', // Send to self for testing
      subject: 'Test Email - MUST LMS Password Reset',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #1e40af;">MUST Learning Management System</h1>
          </div>
          
          <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h2 style="color: #334155; margin-top: 0;">Email Test Successful!</h2>
            <p style="color: #64748b; line-height: 1.6;">
              This is a test email to verify that the Gmail SMTP configuration is working correctly.
            </p>
            
            <div style="background: #dbeafe; padding: 15px; border-radius: 6px; margin: 20px 0;">
              <p style="color: #1e40af; font-size: 24px; font-weight: bold; text-align: center; margin: 0;">
                Test Code: 123456
              </p>
            </div>
            
            <p style="color: #64748b; font-size: 14px;">
              If you received this email, the password reset system is working correctly.
            </p>
          </div>
          
          <div style="text-align: center; color: #94a3b8; font-size: 12px;">
            <p>MUST Learning Management System</p>
            <p>This is an automated test email</p>
          </div>
        </div>
      `
    };
    
    const result = await transporter.sendMail(mailOptions);
    console.log('✅ Test email sent successfully!');
    console.log('📧 Message ID:', result.messageId);
    console.log('📧 Response:', result.response);
    
    console.log('\n🎉 Gmail SMTP Configuration is working correctly!');
    console.log('✅ Password reset emails will be delivered to users');
    
  } catch (error) {
    console.error('❌ Email test failed:', error.message);
    
    if (error.code === 'EAUTH') {
      console.log('\n🔧 Authentication Error Solutions:');
      console.log('1. Make sure 2-factor authentication is enabled on Gmail');
      console.log('2. Generate a new app password: https://myaccount.google.com/apppasswords');
      console.log('3. Use the 16-character app password (not your regular Gmail password)');
      console.log('4. Make sure the Gmail address is correct');
    } else if (error.code === 'ENOTFOUND') {
      console.log('\n🔧 Network Error Solutions:');
      console.log('1. Check your internet connection');
      console.log('2. Make sure Gmail SMTP is not blocked by firewall');
    } else {
      console.log('\n🔧 General Error Solutions:');
      console.log('1. Double-check Gmail credentials');
      console.log('2. Verify app password is correct');
      console.log('3. Try generating a new app password');
    }
  }
}

// Run the test
testEmailSending();

// Setup test email account using Ethereal
const nodemailer = require('nodemailer');

async function setupTestEmail() {
  console.log('🔧 Setting up test email account...');
  
  try {
    // Create test account
    const testAccount = await nodemailer.createTestAccount();
    
    console.log('✅ Test email account created:');
    console.log('📧 Email:', testAccount.user);
    console.log('🔑 Password:', testAccount.pass);
    console.log('🌐 SMTP Host:', testAccount.smtp.host);
    console.log('🔌 SMTP Port:', testAccount.smtp.port);
    
    // Create transporter
    const transporter = nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass
      }
    });
    
    // Send test email
    const mailOptions = {
      from: `"MUST LMS" <${testAccount.user}>`,
      to: 'mfungojoctan01@gmail.com', // Your real email
      subject: 'MUST LMS - Password Reset Code (Test)',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #1e40af;">MUST Learning Management System</h1>
          <h2>Password Reset Request</h2>
          <p>Hello User,</p>
          <p>You have requested a password reset for your MUST LMS account.</p>
          
          <div style="background: #dbeafe; padding: 15px; border-radius: 6px; margin: 20px 0; text-align: center;">
            <p style="color: #1e40af; font-size: 24px; font-weight: bold; margin: 0;">
              Your verification code is: 123456
            </p>
          </div>
          
          <p>This code will expire in 15 minutes for security reasons.</p>
          <p>If you did not request this reset, please ignore this email.</p>
          
          <hr style="margin: 30px 0;">
          <p style="color: #666; font-size: 12px;">
            Best regards,<br>
            MUST LMS Team
          </p>
        </div>
      `
    };
    
    const result = await transporter.sendMail(mailOptions);
    
    console.log('\n✅ Test email sent successfully!');
    console.log('📧 Message ID:', result.messageId);
    
    // Get preview URL
    const previewUrl = nodemailer.getTestMessageUrl(result);
    console.log('🔗 Preview URL:', previewUrl);
    
    console.log('\n📋 Configuration for server.js:');
    console.log(`const EMAIL_CONFIG = {
  host: '${testAccount.smtp.host}',
  port: ${testAccount.smtp.port},
  secure: ${testAccount.smtp.secure},
  auth: {
    user: '${testAccount.user}',
    pass: '${testAccount.pass}'
  }
};`);
    
  } catch (error) {
    console.error('❌ Error setting up test email:', error);
  }
}

setupTestEmail();

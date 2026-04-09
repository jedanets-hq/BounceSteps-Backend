const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      secure: false, // true for 465, false for other ports
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      },
      tls: {
        rejectUnauthorized: false
      }
    });
  }

  async sendPasswordResetEmail(email, resetToken, resetUrl) {
    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM}>`,
      to: email,
      subject: 'Reset Your BounceSteps Password',
      html: this.getPasswordResetTemplate(resetToken, resetUrl)
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log('Password reset email sent:', info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('Error sending password reset email:', error);
      throw new Error('Failed to send password reset email');
    }
  }

  async sendWelcomeEmail(email, firstName, userType) {
    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM}>`,
      to: email,
      subject: '🎉 Welcome to BounceSteps - Your Journey Begins!',
      html: this.getWelcomeTemplate(firstName, userType)
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log('Welcome email sent:', info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('Error sending welcome email:', error);
      throw new Error('Failed to send welcome email');
    }
  }

  getWelcomeTemplate(firstName, userType) {
    const userTypeText = userType === 'service_provider' ? 'Service Provider' : 'Traveler';
    const welcomeMessage = userType === 'service_provider' 
      ? 'Ready to showcase your amazing services to travelers across Tanzania and beyond!'
      : 'Ready to discover incredible destinations and unforgettable experiences!';
    
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to BounceSteps!</title>
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                line-height: 1.6;
                color: #1f2937;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                padding: 20px;
                min-height: 100vh;
            }
            .email-wrapper {
                max-width: 600px;
                margin: 0 auto;
                background: #ffffff;
                border-radius: 16px;
                overflow: hidden;
                box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
            }
            .header {
                background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                padding: 40px 30px;
                text-align: center;
                color: white;
            }
            .logo-container {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 12px;
                margin-bottom: 16px;
            }
            .logo-icon {
                width: 48px;
                height: 48px;
                background: rgba(255, 255, 255, 0.2);
                border-radius: 12px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 24px;
            }
            .logo-text {
                font-size: 32px;
                font-weight: 800;
                letter-spacing: -0.5px;
            }
            .tagline {
                font-size: 16px;
                opacity: 0.9;
                font-weight: 400;
            }
            .content {
                padding: 40px 30px;
            }
            .greeting {
                font-size: 28px;
                font-weight: 700;
                color: #1f2937;
                margin-bottom: 16px;
                text-align: center;
            }
            .welcome-message {
                font-size: 18px;
                color: #10b981;
                margin-bottom: 24px;
                text-align: center;
                font-weight: 600;
            }
            .message {
                font-size: 16px;
                color: #4b5563;
                margin-bottom: 32px;
                text-align: center;
                line-height: 1.7;
            }
            .cta-section {
                background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
                border-radius: 12px;
                padding: 32px;
                margin: 32px 0;
                text-align: center;
            }
            .cta-title {
                font-size: 20px;
                font-weight: 700;
                color: #1f2937;
                margin-bottom: 16px;
            }
            .cta-button {
                display: inline-block;
                background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                color: white;
                padding: 16px 32px;
                text-decoration: none;
                border-radius: 12px;
                font-weight: 600;
                font-size: 16px;
                box-shadow: 0 4px 14px 0 rgba(16, 185, 129, 0.39);
                transition: all 0.3s ease;
                margin: 8px;
            }
            .features-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 20px;
                margin: 32px 0;
            }
            .feature-card {
                background: #f8fafc;
                border-radius: 12px;
                padding: 24px;
                text-align: center;
                border: 1px solid #e2e8f0;
            }
            .feature-icon {
                font-size: 32px;
                margin-bottom: 12px;
            }
            .feature-title {
                font-size: 16px;
                font-weight: 600;
                color: #1f2937;
                margin-bottom: 8px;
            }
            .feature-desc {
                font-size: 14px;
                color: #64748b;
            }
            .footer {
                background: #f8fafc;
                padding: 32px 30px;
                text-align: center;
                border-top: 1px solid #e5e7eb;
            }
            .footer-brand {
                font-weight: 600;
                color: #1f2937;
                margin-bottom: 8px;
            }
            .footer-text {
                color: #6b7280;
                font-size: 14px;
                margin-bottom: 16px;
            }
            .footer-copyright {
                color: #9ca3af;
                font-size: 12px;
            }
            @media (max-width: 600px) {
                .features-grid {
                    grid-template-columns: 1fr;
                }
                .header {
                    padding: 30px 20px;
                }
                .content {
                    padding: 30px 20px;
                }
                .logo-text {
                    font-size: 28px;
                }
                .greeting {
                    font-size: 24px;
                }
            }
        </style>
    </head>
    <body>
        <div class="email-wrapper">
            <!-- Header -->
            <div class="header">
                <div class="logo-container">
                    <div class="logo-icon">🏖️</div>
                    <div class="logo-text">BounceSteps</div>
                </div>
                <div class="tagline">Your gateway to extraordinary journeys</div>
            </div>
            
            <!-- Content -->
            <div class="content">
                <div class="greeting">Welcome, ${firstName}! 🎉</div>
                <div class="welcome-message">${welcomeMessage}</div>
                
                <div class="message">
                    Thank you for joining BounceSteps as a <strong>${userTypeText}</strong>. 
                    You're now part of Tanzania's premier travel and tourism community!
                </div>
                
                <!-- CTA Section -->
                <div class="cta-section">
                    <div class="cta-title">Ready to get started?</div>
                    <a href="${process.env.FRONTEND_URL || 'https://bouncesteps.com'}/login" class="cta-button">
                        🚀 Access Your Dashboard
                    </a>
                </div>
                
                <!-- Features Grid -->
                <div class="features-grid">
                    ${userType === 'service_provider' ? `
                    <div class="feature-card">
                        <div class="feature-icon">🏢</div>
                        <div class="feature-title">Manage Services</div>
                        <div class="feature-desc">Add and showcase your amazing services</div>
                    </div>
                    <div class="feature-card">
                        <div class="feature-icon">💬</div>
                        <div class="feature-title">Connect with Travelers</div>
                        <div class="feature-desc">Chat directly with potential customers</div>
                    </div>
                    <div class="feature-card">
                        <div class="feature-icon">📊</div>
                        <div class="feature-title">Track Performance</div>
                        <div class="feature-desc">Monitor bookings and earnings</div>
                    </div>
                    <div class="feature-card">
                        <div class="feature-icon">⭐</div>
                        <div class="feature-title">Build Reputation</div>
                        <div class="feature-desc">Collect reviews and ratings</div>
                    </div>
                    ` : `
                    <div class="feature-card">
                        <div class="feature-icon">🗺️</div>
                        <div class="feature-title">Discover Destinations</div>
                        <div class="feature-desc">Explore amazing places across Tanzania</div>
                    </div>
                    <div class="feature-card">
                        <div class="feature-icon">🎯</div>
                        <div class="feature-title">Plan Your Journey</div>
                        <div class="feature-desc">Create personalized travel itineraries</div>
                    </div>
                    <div class="feature-card">
                        <div class="feature-icon">💝</div>
                        <div class="feature-title">Book Services</div>
                        <div class="feature-desc">Find and book trusted local services</div>
                    </div>
                    <div class="feature-card">
                        <div class="feature-icon">❤️</div>
                        <div class="feature-title">Save Favorites</div>
                        <div class="feature-desc">Keep track of places you love</div>
                    </div>
                    `}
                </div>
                
                <div class="message">
                    Need help getting started? Our support team is here to assist you every step of the way.
                </div>
                
                <div style="text-align: center; margin-top: 32px;">
                    <p style="color: #4b5563; margin-bottom: 8px;">Welcome aboard!</p>
                    <p style="font-weight: 600; color: #1f2937;">The BounceSteps Team</p>
                </div>
            </div>
            
            <!-- Footer -->
            <div class="footer">
                <div class="footer-brand">BounceSteps - iSafari Global</div>
                <div class="footer-text">
                    Making travel dreams come true across Tanzania and beyond
                </div>
                <div class="footer-text">
                    Questions? Reply to this email or contact our support team
                </div>
                <div class="footer-copyright">
                    © 2026 BounceSteps. All rights reserved. | Powered by JEDA NETWORKS
                </div>
            </div>
        </div>
    </body>
    </html>
    `;
  }

  getPasswordResetTemplate(resetToken, resetUrl) {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reset Your Password - BounceSteps</title>
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                line-height: 1.6;
                color: #333333;
                background-color: #f5f5f5;
                padding: 20px;
            }
            .email-wrapper {
                max-width: 600px;
                margin: 0 auto;
                background: #ffffff;
                border-radius: 8px;
                overflow: hidden;
                box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
            }
            .header {
                background-color: #ffffff;
                padding: 30px 40px 20px 40px;
                border-bottom: 1px solid #e5e5e5;
            }
            .logo-container {
                display: flex;
                align-items: center;
                gap: 10px;
            }
            .logo-text {
                font-size: 24px;
                font-weight: 700;
                color: #333333;
            }
            .content {
                padding: 40px;
            }
            .greeting {
                font-size: 18px;
                font-weight: 400;
                color: #333333;
                margin-bottom: 20px;
            }
            .message {
                font-size: 16px;
                color: #333333;
                margin-bottom: 30px;
                line-height: 1.5;
            }
            .reset-code-section {
                background-color: #f8f8f8;
                border: 1px solid #e5e5e5;
                border-radius: 4px;
                padding: 20px;
                margin: 30px 0;
                text-align: center;
            }
            .code-label {
                font-size: 14px;
                color: #666666;
                margin-bottom: 10px;
            }
            .reset-code {
                font-size: 24px;
                font-weight: 700;
                color: #333333;
                font-family: 'Courier New', monospace;
                letter-spacing: 2px;
                margin-bottom: 10px;
            }
            .reset-button {
                display: inline-block;
                background-color: #0073b1;
                color: white;
                padding: 12px 24px;
                text-decoration: none;
                border-radius: 4px;
                font-weight: 500;
                font-size: 16px;
                margin: 20px 0;
            }
            .security-info {
                font-size: 14px;
                color: #666666;
                margin: 30px 0;
                line-height: 1.5;
            }
            .footer {
                background-color: #f8f8f8;
                padding: 30px 40px;
                border-top: 1px solid #e5e5e5;
                font-size: 12px;
                color: #666666;
                text-align: left;
            }
            .footer-text {
                margin-bottom: 5px;
            }
            @media (max-width: 600px) {
                .content, .header, .footer {
                    padding: 20px;
                }
                .logo-text {
                    font-size: 20px;
                }
                .reset-code {
                    font-size: 20px;
                }
            }
        </style>
    </head>
    <body>
        <div class="email-wrapper">
            <!-- Header with Logo -->
            <div class="header">
                <div class="logo-container">
                    <div class="logo-text">BounceSteps</div>
                </div>
            </div>
            
            <!-- Main Content -->
            <div class="content">
                <div class="greeting">Hello,</div>
                
                <div class="message">
                    Your password reset code was requested.
                </div>
                
                <div class="message">
                    <strong>When and where it happened:</strong><br>
                    Date: ${new Date().toLocaleString('en-US', { 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric', 
                        hour: '2-digit', 
                        minute: '2-digit',
                        timeZoneName: 'short'
                    })}
                </div>
                
                <!-- Reset Code Section -->
                <div class="reset-code-section">
                    <div class="code-label">Your reset code:</div>
                    <div class="reset-code">${resetToken}</div>
                </div>
                
                <div class="message">
                    If you didn't take this action, let us know it wasn't you by using this link. For your security, we'll require that you reset your BounceSteps password.
                </div>
                
                <div style="text-align: center;">
                    <a href="${resetUrl}" class="reset-button">Reset Password</a>
                </div>
                
                <div class="security-info">
                    To further secure your account, you can also:<br>
                    • Change your password regularly<br>
                    • Use a strong, unique password<br>
                    • Enable two-factor authentication if available
                </div>
            </div>
            
            <!-- Footer -->
            <div class="footer">
                <div class="footer-text">This email was intended for your BounceSteps account.</div>
                <div class="footer-text">You are receiving BounceSteps notification emails.</div>
                <div class="footer-text">Help</div>
                <div class="footer-text">BounceSteps</div>
                <div class="footer-text">© 2026 BounceSteps Corporation. All rights reserved.</div>
            </div>
        </div>
    </body>
    </html>
    `;
  }

  // Test email connection
  async testConnection() {
    try {
      await this.transporter.verify();
      console.log('Email service connection successful');
      return true;
    } catch (error) {
      console.error('Email service connection failed:', error);
      return false;
    }
  }
}

module.exports = new EmailService();
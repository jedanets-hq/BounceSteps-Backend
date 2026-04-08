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
      subject: '🔐 Reset Your BounceSteps Password',
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
                    © 2024 BounceSteps. All rights reserved. | Powered by JEDA NETWORKS
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
                background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
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
                font-size: 24px;
                font-weight: 700;
                color: #1f2937;
                margin-bottom: 24px;
                text-align: center;
            }
            .message {
                font-size: 16px;
                color: #4b5563;
                margin-bottom: 32px;
                text-align: center;
                line-height: 1.7;
            }
            .reset-button-container {
                text-align: center;
                margin: 40px 0;
            }
            .reset-button {
                display: inline-block;
                background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
                color: white;
                padding: 16px 32px;
                text-decoration: none;
                border-radius: 12px;
                font-weight: 600;
                font-size: 16px;
                box-shadow: 0 4px 14px 0 rgba(37, 99, 235, 0.39);
                transition: all 0.3s ease;
            }
            .reset-button:hover {
                transform: translateY(-2px);
                box-shadow: 0 8px 25px 0 rgba(37, 99, 235, 0.5);
            }
            .code-section {
                background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
                border: 2px solid #e2e8f0;
                border-radius: 12px;
                padding: 24px;
                margin: 32px 0;
                text-align: center;
            }
            .code-label {
                font-size: 14px;
                color: #64748b;
                margin-bottom: 8px;
                font-weight: 500;
            }
            .reset-code {
                font-size: 32px;
                font-weight: 800;
                color: #2563eb;
                font-family: 'Courier New', monospace;
                letter-spacing: 4px;
                margin-bottom: 8px;
            }
            .code-note {
                font-size: 12px;
                color: #64748b;
            }
            .security-notice {
                background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
                border: 1px solid #f59e0b;
                border-radius: 12px;
                padding: 20px;
                margin: 32px 0;
            }
            .security-title {
                display: flex;
                align-items: center;
                gap: 8px;
                font-weight: 600;
                color: #92400e;
                margin-bottom: 12px;
                font-size: 16px;
            }
            .security-list {
                list-style: none;
                color: #92400e;
                font-size: 14px;
            }
            .security-list li {
                margin-bottom: 6px;
                padding-left: 16px;
                position: relative;
            }
            .security-list li:before {
                content: "•";
                position: absolute;
                left: 0;
                color: #f59e0b;
                font-weight: bold;
            }
            .alternative-link {
                background: #f8fafc;
                border-radius: 8px;
                padding: 16px;
                margin: 24px 0;
                border-left: 4px solid #2563eb;
            }
            .alternative-link p {
                font-size: 14px;
                color: #4b5563;
                margin-bottom: 8px;
            }
            .link-text {
                word-break: break-all;
                color: #2563eb;
                font-size: 12px;
                background: #eff6ff;
                padding: 8px;
                border-radius: 4px;
                font-family: monospace;
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
            .divider {
                height: 1px;
                background: linear-gradient(90deg, transparent, #e5e7eb, transparent);
                margin: 32px 0;
            }
            @media (max-width: 600px) {
                body {
                    padding: 10px;
                }
                .header {
                    padding: 30px 20px;
                }
                .content {
                    padding: 30px 20px;
                }
                .footer {
                    padding: 24px 20px;
                }
                .logo-text {
                    font-size: 28px;
                }
                .greeting {
                    font-size: 20px;
                }
                .reset-code {
                    font-size: 24px;
                    letter-spacing: 2px;
                }
            }
        </style>
    </head>
    <body>
        <div class="email-wrapper">
            <!-- Header with Logo -->
            <div class="header">
                <div class="logo-container">
                    <div class="logo-icon">🏖️</div>
                    <div class="logo-text">BounceSteps</div>
                </div>
                <div class="tagline">Your gateway to extraordinary journeys</div>
            </div>
            
            <!-- Main Content -->
            <div class="content">
                <div class="greeting">Reset Your Password</div>
                
                <div class="message">
                    We received a request to reset your password for your BounceSteps account. 
                    If you made this request, use the button below or the reset code to create a new password.
                </div>
                
                <!-- Reset Button -->
                <div class="reset-button-container">
                    <a href="${resetUrl}" class="reset-button">
                        🔐 Reset My Password
                    </a>
                </div>
                
                <!-- Reset Code Section -->
                <div class="code-section">
                    <div class="code-label">Your Reset Code</div>
                    <div class="reset-code">${resetToken}</div>
                    <div class="code-note">Enter this code on the reset password page</div>
                </div>
                
                <!-- Security Notice -->
                <div class="security-notice">
                    <div class="security-title">
                        <span>🛡️</span>
                        <span>Security Notice</span>
                    </div>
                    <ul class="security-list">
                        <li>This reset link expires in 1 hour for your security</li>
                        <li>If you didn't request this reset, please ignore this email</li>
                        <li>Never share your reset code with anyone</li>
                        <li>BounceSteps will never ask for your password via email</li>
                    </ul>
                </div>
                
                <div class="divider"></div>
                
                <!-- Alternative Link -->
                <div class="alternative-link">
                    <p><strong>Button not working?</strong> Copy and paste this link into your browser:</p>
                    <div class="link-text">${resetUrl}</div>
                </div>
                
                <div class="message">
                    If you didn't request a password reset, you can safely ignore this email. 
                    Your password will remain unchanged.
                </div>
                
                <div style="text-align: center; margin-top: 32px;">
                    <p style="color: #4b5563; margin-bottom: 8px;">Best regards,</p>
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
                    Need help? Contact our support team anytime
                </div>
                <div class="footer-copyright">
                    © 2024 BounceSteps. All rights reserved. | Powered by JEDA NETWORKS
                </div>
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
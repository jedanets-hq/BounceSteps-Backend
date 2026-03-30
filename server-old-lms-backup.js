const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

const app = express();

// JWT Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'must-lms-secret-key-change-in-production-2024';
const JWT_EXPIRES_IN = '24h';
const JWT_REFRESH_EXPIRES_IN = '7d';

// Track active sessions
const activeSessions = new Map(); // userId -> { userType, username, loginTime }

// Email configuration - Gmail SMTP for real email delivery
// IMPORTANT: Set these environment variables or update directly:
// - GMAIL_USER: Your Gmail address (e.g., mustlms@gmail.com)
// - GMAIL_APP_PASSWORD: Your 16-character Gmail App Password
// 
// TO SETUP GMAIL APP PASSWORD:
// 1. Enable 2-factor authentication: https://myaccount.google.com/security
// 2. Generate app password: https://myaccount.google.com/apppasswords
// 3. Select "Mail" and "Other (MUST LMS)"
// 4. Copy the 16-character password (format: xxxx xxxx xxxx xxxx)
// 5. Set environment variables or update EMAIL_CONFIG below

let CURRENT_ADMIN_EMAIL = process.env.GMAIL_USER || 'your-gmail@gmail.com';
const EMAIL_CONFIG = {
  host: 'smtp.gmail.com',  // Gmail SMTP server
  port: 587,
  secure: false,  // Use STARTTLS
  auth: {
    user: process.env.GMAIL_USER || 'your-gmail@gmail.com',  // Replace with your Gmail
    pass: process.env.GMAIL_APP_PASSWORD || 'your-16-char-app-password'  // Replace with your App Password
  }
};

// FALLBACK: If Gmail credentials not set, use Ethereal for testing
const FALLBACK_EMAIL_CONFIG = {
  host: 'smtp.ethereal.email',
  port: 587,
  secure: false,
  auth: {
    user: 'uj23hiueddhpna2y@ethereal.email',
    pass: 'bUBwMXt6UWqgK4Tetd'
  }
};

// Function to get admin email from database
const getAdminEmail = async () => {
  try {
    const result = await pool.query(
      'SELECT setting_value FROM admin_settings WHERE setting_key = $1',
      ['admin_email']
    );
    
    if (result.rows.length > 0) {
      CURRENT_ADMIN_EMAIL = result.rows[0].setting_value;
      EMAIL_CONFIG.auth.user = CURRENT_ADMIN_EMAIL;
    }
    return CURRENT_ADMIN_EMAIL;
  } catch (error) {
    console.error('Error getting admin email:', error);
    return 'uj23hiueddhpna2y@ethereal.email';
  }
};

// Create email transporter with Gmail or fallback to Ethereal
let emailTransporter = null;
let usingGmail = false;

try {
  // Check if Gmail credentials are properly configured
  const hasGmailCredentials = 
    EMAIL_CONFIG.auth.user !== 'your-gmail@gmail.com' && 
    EMAIL_CONFIG.auth.pass !== 'your-16-char-app-password';
  
  if (hasGmailCredentials) {
    // Try Gmail configuration
    emailTransporter = nodemailer.createTransport(EMAIL_CONFIG);
    usingGmail = true;
    console.log('✅ Gmail SMTP configured for:', EMAIL_CONFIG.auth.user);
    console.log('✅ Real emails will be sent to users\' Gmail accounts');
  } else {
    // Use Ethereal fallback for testing
    emailTransporter = nodemailer.createTransport(FALLBACK_EMAIL_CONFIG);
    console.log('⚠️  Using Ethereal test email (emails won\'t reach real Gmail)');
    console.log('📧 Test email account:', FALLBACK_EMAIL_CONFIG.auth.user);
    console.log('💡 To send real emails, configure Gmail credentials in server.js');
  }
} catch (error) {
  console.warn('⚠️ Email configuration error:', error.message);
  console.warn('Emails will be simulated.');
}

// Function to send real email
const sendResetCodeEmail = async (userEmail, userName, resetCode) => {
  // Get current admin email from database
  const adminEmail = await getAdminEmail();
  
  if (!emailTransporter) {
    console.log('📧 EMAIL SIMULATION (No transporter configured):');
    console.log(`📧 FROM: ${adminEmail}`);
    console.log(`📧 TO: ${userEmail}`);
    console.log(`📧 SUBJECT: Password Reset Code - MUST LMS`);
    console.log(`📧 CODE: ${resetCode}`);
    return { success: true, simulated: true };
  }

  try {
    // Update email config with current admin email
    EMAIL_CONFIG.auth.user = adminEmail;
    
    // Real email sending enabled with Gmail credentials
    console.log('📧 SENDING REAL EMAIL:');
    console.log(`📧 FROM: ${adminEmail}`);
    console.log(`📧 TO: ${userEmail}`);
    console.log(`📧 SUBJECT: Password Reset Code - MUST LMS`);
    
    // Create new transporter with updated config
    emailTransporter = nodemailer.createTransport(EMAIL_CONFIG);
    
    const mailOptions = {
      from: `"MUST LMS" <${adminEmail}>`,
      to: userEmail,
      subject: 'Password Reset Code - MUST LMS',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #1e40af;">MUST Learning Management System</h1>
          </div>
          
          <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h2 style="color: #334155; margin-top: 0;">Password Reset Request</h2>
            <p>Dear ${userName},</p>
            <p>You have requested a password reset for your MUST LMS account.</p>
            
            <div style="background: white; padding: 15px; border-radius: 6px; text-align: center; margin: 20px 0;">
              <p style="margin: 0; color: #64748b; font-size: 14px;">Your verification code is:</p>
              <h1 style="color: #1e40af; font-size: 32px; letter-spacing: 4px; margin: 10px 0;">${resetCode}</h1>
              <p style="margin: 0; color: #ef4444; font-size: 12px;">This code expires in 15 minutes</p>
            </div>
            
            <p><strong>Important:</strong></p>
            <ul>
              <li>Do not share this code with anyone</li>
              <li>If you did not request this reset, please ignore this email</li>
              <li>Contact IT Support if you need assistance: +255 25 295 7544</li>
            </ul>
          </div>
          
          <div style="text-align: center; color: #64748b; font-size: 12px;">
            <p>© 2026 Mbeya University of Science and Technology</p>
            <p>This is an automated message, please do not reply.</p>
          </div>
        </div>
      `
    };

    const info = await emailTransporter.sendMail(mailOptions);
    console.log('✅ Email sent successfully:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Email sending failed:', error);
    // Fallback to simulation if email fails
    console.log('📧 EMAIL FALLBACK SIMULATION:');
    console.log(`📧 TO: ${userEmail}`);
    console.log(`📧 CODE: ${resetCode}`);
    return { success: true, simulated: true, error: error.message };
  }
};

// Configure multer for memory storage (files stored in database, not filesystem)
// This allows files to persist in PostgreSQL database which scales with your plan
const storage = multer.memoryStorage();

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit for database storage
  }
});

console.log('📁 File storage configured: PostgreSQL Database (persistent)');
console.log('💡 Files are stored in database - upgrade database plan to increase storage');

// CORS Configuration for Production
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // List of allowed origins
    const allowedOrigins = [
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:5175',
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3002',
      // Add your Netlify domains here
      /\.netlify\.app$/,  // Allows all Netlify subdomains
      /\.onrender\.com$/  // Allows all Render domains
    ];
    
    // Check if origin is allowed
    const isAllowed = allowedOrigins.some(allowedOrigin => {
      if (typeof allowedOrigin === 'string') {
        return origin === allowedOrigin;
      }
      if (allowedOrigin instanceof RegExp) {
        return allowedOrigin.test(origin);
      }
      return false;
    });
    
    if (isAllowed) {
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      // SECURITY: Block unauthorized origins in production
      const isDevelopment = process.env.NODE_ENV !== 'production';
      if (isDevelopment) {
        console.log('⚠️  Development mode - allowing origin anyway');
        callback(null, true);
      } else {
        console.log('❌ Production mode - blocking unauthorized origin');
        callback(new Error('Not allowed by CORS'));
      }
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

// Middleware
app.use(cors(corsOptions));

// IMPORTANT: Multer file upload routes MUST be defined BEFORE express.json()
// This is because express.json() will try to parse the body, which conflicts with multipart/form-data

// Define file upload endpoint early (before express.json middleware)

// Announcement creation with file upload (MUST be before express.json()) - STORES IN DATABASE
app.post('/api/announcements', upload.single('file'), async (req, res) => {
  try {
    console.log('=== CREATE ANNOUNCEMENT DEBUG (DATABASE STORAGE) ===');
    console.log('Content-Type:', req.headers['content-type']);
    console.log('Request body:', req.body);
    console.log('Request file:', req.file ? { originalname: req.file.originalname, size: req.file.size } : 'No file');
    
    // Handle both multipart/form-data and JSON requests
    let title, content, target_type, target_value, created_by, created_by_id, created_by_type, file_url_from_body, file_name_from_body;
    
    if (req.body) {
      title = req.body.title;
      content = req.body.content;
      target_type = req.body.target_type;
      target_value = req.body.target_value;
      created_by = req.body.created_by;
      created_by_id = req.body.created_by_id;
      created_by_type = req.body.created_by_type;
      file_url_from_body = req.body.file_url;
      file_name_from_body = req.body.file_name;
    }
    
    // Validate required fields
    if (!title || !content) {
      return res.status(400).json({ 
        success: false, 
        error: 'Title and content are required' 
      });
    }
    
    let file_url = file_url_from_body || null;
    let file_name = file_name_from_body || null;
    
    // If file was uploaded, save to database
    if (req.file) {
      const uniqueFilename = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(req.file.originalname);
      
      // Convert created_by_id to integer or null
      const uploaderId = created_by_id && created_by_id !== '' ? parseInt(created_by_id, 10) : null;
      
      // Store file in database
      await pool.query(
        'INSERT INTO file_storage (file_name, original_name, file_data, file_mimetype, file_size, uploaded_by_id, uploaded_by_type) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [uniqueFilename, req.file.originalname, req.file.buffer, req.file.mimetype, req.file.size, uploaderId, created_by_type || 'admin']
      );
      
      file_url = `/content/${uniqueFilename}`;
      file_name = req.file.originalname;
      
      console.log('✅ File saved to database:');
      console.log('   - Original name:', req.file.originalname);
      console.log('   - Saved as:', uniqueFilename);
      console.log('   - Size:', req.file.size, 'bytes');
      console.log('   - File URL:', file_url);
    }
    
    // Convert created_by_id to integer or null for announcement insert
    const announcementCreatorId = created_by_id && created_by_id !== '' ? parseInt(created_by_id, 10) : null;
    
    // Insert into database
    const result = await pool.query(
      'INSERT INTO announcements (title, content, target_type, target_value, created_by, created_by_id, created_by_type, file_url, file_name) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
      [title, content, target_type || 'all', target_value || null, created_by || 'Admin', announcementCreatorId, created_by_type || 'admin', file_url, file_name]
    );
    
    console.log('✅ Announcement created successfully:', result.rows[0]);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('❌ Error creating announcement:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/assignment-submissions/upload', upload.single('file'), async (req, res) => {
  try {
    console.log('=== ASSIGNMENT FILE UPLOAD DEBUG (DATABASE STORAGE) ===');
    console.log('Request body keys:', Object.keys(req.body));
    console.log('Request file:', req.file ? { originalname: req.file.originalname, size: req.file.size } : 'No file');
    
    const uploadedFile = req.file;
    
    if (!uploadedFile) {
      console.error('❌ No file uploaded - req.file is undefined');
      console.error('This could mean:');
      console.error('1. File field name mismatch (should be "file")');
      console.error('2. File size exceeds limit (50MB)');
      console.error('3. CORS or network issue');
      return res.status(400).json({ 
        success: false, 
        error: 'No file uploaded. Please ensure file is less than 50MB and try again.' 
      });
    }
    
    // Validate file type
    if (!uploadedFile.mimetype.includes('pdf')) {
      console.error('❌ Invalid file type:', uploadedFile.mimetype);
      return res.status(400).json({ 
        success: false, 
        error: 'Only PDF files are allowed' 
      });
    }
    
    // Generate unique filename and store in database
    const uniqueFilename = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(uploadedFile.originalname);
    
    // Store file in database
    await pool.query(
      'INSERT INTO file_storage (file_name, original_name, file_data, file_mimetype, file_size, uploaded_by_type) VALUES ($1, $2, $3, $4, $5, $6)',
      [uniqueFilename, uploadedFile.originalname, uploadedFile.buffer, uploadedFile.mimetype, uploadedFile.size, 'student']
    );
    
    const fileUrl = `/content/${uniqueFilename}`;
    
    console.log('✅ Assignment file saved to database:');
    console.log('   - Original name:', uploadedFile.originalname);
    console.log('   - Saved as:', uniqueFilename);
    console.log('   - Size:', uploadedFile.size, 'bytes');
    console.log('   - File URL:', fileUrl);
    
    res.json({ 
      success: true, 
      file_path: fileUrl,
      file_name: uploadedFile.originalname,
      file_size: uploadedFile.size
    });
  } catch (error) {
    console.error('❌ Error uploading assignment file:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Discussion reply with file upload (MUST be before express.json()) - STORES IN DATABASE
app.post('/api/discussion-replies/upload', upload.single('file'), async (req, res) => {
  try {
    console.log('=== DISCUSSION REPLY WITH FILE UPLOAD ===');
    console.log('Request body:', req.body);
    console.log('Request file:', req.file ? { originalname: req.file.originalname, size: req.file.size, mimetype: req.file.mimetype } : 'No file');
    
    const { discussion_id, content, author, author_id, author_type } = req.body;
    
    // Validate - either content or file must be provided
    if (!content && !req.file) {
      return res.status(400).json({ 
        success: false, 
        error: 'Either content or file is required' 
      });
    }
    
    if (!discussion_id) {
      return res.status(400).json({ 
        success: false, 
        error: 'Discussion ID is required' 
      });
    }
    
    // Ensure discussion_replies table has file columns
    try {
      await pool.query(`ALTER TABLE discussion_replies ADD COLUMN IF NOT EXISTS file_url VARCHAR(500)`);
      await pool.query(`ALTER TABLE discussion_replies ADD COLUMN IF NOT EXISTS file_name VARCHAR(255)`);
      await pool.query(`ALTER TABLE discussion_replies ADD COLUMN IF NOT EXISTS file_type VARCHAR(50)`);
      await pool.query(`ALTER TABLE discussion_replies ADD COLUMN IF NOT EXISTS file_size INTEGER`);
    } catch (alterError) {
      console.log('Column check note:', alterError.message);
    }
    
    let file_url = null;
    let file_name = null;
    let file_type = null;
    let file_size = null;
    
    // If file was uploaded, save to database
    if (req.file) {
      const uniqueFilename = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(req.file.originalname);
      
      // Determine file type
      if (req.file.mimetype.startsWith('image/')) {
        file_type = 'image';
      } else if (req.file.mimetype.startsWith('audio/')) {
        file_type = 'audio';
      } else if (req.file.mimetype === 'application/pdf') {
        file_type = 'pdf';
      } else if (req.file.mimetype.includes('document') || req.file.mimetype.includes('word')) {
        file_type = 'document';
      } else {
        file_type = 'file';
      }
      
      // Store file in database
      await pool.query(
        'INSERT INTO file_storage (file_name, original_name, file_data, file_mimetype, file_size, uploaded_by_id, uploaded_by_type) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [uniqueFilename, req.file.originalname, req.file.buffer, req.file.mimetype, req.file.size, author_id || null, author_type || 'student']
      );
      
      file_url = `/content/${uniqueFilename}`;
      file_name = req.file.originalname;
      file_size = req.file.size;
      
      console.log('✅ Discussion reply file saved to database:');
      console.log('   - Original name:', req.file.originalname);
      console.log('   - Saved as:', uniqueFilename);
      console.log('   - Size:', req.file.size, 'bytes');
      console.log('   - Type:', file_type);
      console.log('   - File URL:', file_url);
    }
    
    // Insert reply with file info
    const replyResult = await pool.query(`
      INSERT INTO discussion_replies (discussion_id, content, author, author_id, author_type, file_url, file_name, file_type, file_size)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *
    `, [discussion_id, content || '', author, author_id, author_type || 'student', file_url, file_name, file_type, file_size]);
    
    // Update discussion reply count
    await pool.query(`
      UPDATE discussions 
      SET replies = replies + 1, updated_at = CURRENT_TIMESTAMP 
      WHERE id = $1
    `, [discussion_id]);
    
    console.log('✅ Discussion reply created with file:', replyResult.rows[0]);
    res.json({ success: true, data: replyResult.rows[0] });
  } catch (error) {
    console.error('❌ Error creating discussion reply with file:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Now apply express.json() for other routes
app.use(express.json());

// JSON endpoint for announcements without file (after express.json middleware)
app.post('/api/announcements/json', async (req, res) => {
  try {
    console.log('=== CREATE ANNOUNCEMENT JSON (NO FILE) ===');
    console.log('Request body:', req.body);
    
    const { title, content, target_type, target_value, created_by, created_by_id, created_by_type, file_url, file_name } = req.body;
    
    // Validate required fields
    if (!title || !content) {
      return res.status(400).json({ 
        success: false, 
        error: 'Title and content are required' 
      });
    }
    
    // Convert created_by_id to integer or null
    const announcementCreatorId = created_by_id && created_by_id !== '' && created_by_id !== null ? parseInt(created_by_id, 10) : null;
    
    // Insert into database
    const result = await pool.query(
      'INSERT INTO announcements (title, content, target_type, target_value, created_by, created_by_id, created_by_type, file_url, file_name) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
      [title, content, target_type || 'all', target_value || null, created_by || 'Admin', announcementCreatorId, created_by_type || 'admin', file_url || null, file_name || null]
    );
    
    console.log('✅ Announcement created successfully (JSON):', result.rows[0]);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('❌ Error creating announcement (JSON):', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Rate Limiting Configuration
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 login attempts per window
  message: { success: false, error: 'Too many login attempts. Please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: { success: false, error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply general rate limiting to all API routes
app.use('/api/', apiLimiter);

// JWT Authentication Middleware
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'No token provided' });
  }
  
  const token = authHeader.split(' ')[1];
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { userId, userType, username }
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, error: 'Token expired', expired: true });
    }
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }
};

// Optional auth middleware - doesn't fail if no token
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
    } catch (error) {
      // Token invalid but continue anyway
      req.user = null;
    }
  }
  next();
};

// Serve files from DATABASE (not filesystem) - files persist with database
// This endpoint serves files stored in file_storage table
app.get('/content/:filename', async (req, res) => {
  try {
    const filename = decodeURIComponent(req.params.filename);
    
    console.log('=== FILE REQUEST FROM DATABASE ===');
    console.log('Requested filename:', filename);
    
    // Try to get file from database
    const result = await pool.query(
      'SELECT file_data, file_mimetype, original_name FROM file_storage WHERE file_name = $1',
      [filename]
    );
    
    if (result.rows.length === 0) {
      console.error('❌ File not found in database:', filename);
      return res.status(404).json({ success: false, error: 'File not found' });
    }
    
    const file = result.rows[0];
    
    // Set proper headers
    res.setHeader('Content-Type', file.file_mimetype || 'application/octet-stream');
    if (file.file_mimetype === 'application/pdf') {
      res.setHeader('Content-Disposition', 'inline');
    } else {
      res.setHeader('Content-Disposition', `inline; filename="${file.original_name}"`);
    }
    
    console.log('✅ Serving file from database:', filename);
    res.send(file.file_data);
  } catch (error) {
    console.error('Error serving file from database:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Also serve via /uploads for backward compatibility
app.get('/uploads/:filename', async (req, res) => {
  try {
    const filename = decodeURIComponent(req.params.filename);
    
    const result = await pool.query(
      'SELECT file_data, file_mimetype, original_name FROM file_storage WHERE file_name = $1',
      [filename]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }
    
    const file = result.rows[0];
    res.setHeader('Content-Type', file.file_mimetype || 'application/octet-stream');
    res.setHeader('Content-Disposition', 'inline');
    res.send(file.file_data);
  } catch (error) {
    console.error('Error serving file:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// File download endpoint with proper URL decoding - from DATABASE
app.get('/api/files/:filename', async (req, res) => {
  try {
    const filename = decodeURIComponent(req.params.filename);
    
    console.log('=== FILE DOWNLOAD REQUEST FROM DATABASE ===');
    console.log('Requested filename:', filename);
    
    const result = await pool.query(
      'SELECT file_data, file_mimetype, original_name FROM file_storage WHERE file_name = $1',
      [filename]
    );
    
    if (result.rows.length === 0) {
      console.error('❌ File not found in database:', filename);
      return res.status(404).json({ success: false, error: 'File not found' });
    }
    
    const file = result.rows[0];
    
    res.setHeader('Content-Type', file.file_mimetype || 'application/octet-stream');
    res.setHeader('Content-Disposition', 'inline');
    
    console.log('✅ Serving file from database:', filename);
    res.send(file.file_data);
  } catch (error) {
    console.error('Error serving file:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PostgreSQL connection - Use environment variables for production
const poolConfig = process.env.DATABASE_URL 
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    }
  : {
      user: process.env.DB_USER || 'postgres',
      host: process.env.DB_HOST || 'localhost',
      database: process.env.DB_NAME || 'LMS_MUST_DB_ORG',
      password: process.env.DB_PASSWORD || '@Jctnftr01',
      port: process.env.DB_PORT || 5432,
    };

const pool = new Pool(poolConfig);

// Test database connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('Error connecting to database:', err);
  } else {
    console.log('Connected to PostgreSQL database: LMS_MUST_DB_ORG');
    release();
  }
});

// Initialize database tables
const initializeDatabase = async () => {
  try {
    console.log('Initializing database tables...');
    
    // Create lecturers table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS lecturers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        employee_id VARCHAR(100) UNIQUE NOT NULL,
        specialization VARCHAR(255),
        email VARCHAR(255) UNIQUE NOT NULL,
        phone VARCHAR(20),
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add is_active column for lecturers (must self-register to activate)
    try {
      await pool.query(`
        ALTER TABLE lecturers 
        ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT false
      `);
      console.log('is_active column added/verified in lecturers table');
    } catch (error) {
      console.log('is_active column may already exist:', error.message);
    }

    // Fix password field size if it's too small (varchar(10) -> varchar(255))
    try {
      await pool.query(`
        ALTER TABLE lecturers 
        ALTER COLUMN password TYPE VARCHAR(255)
      `);
      console.log('✅ Password field in lecturers table resized to VARCHAR(255)');
    } catch (error) {
      console.log('Password field resize may not be needed:', error.message);
    }

    // Add is_locked column for account locking
    try {
      await pool.query(`
        ALTER TABLE lecturers 
        ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT false
      `);
      console.log('is_locked column added/verified in lecturers table');
    } catch (error) {
      console.log('is_locked column may already exist:', error.message);
    }

    // Add locked_at column to track when account was locked
    try {
      await pool.query(`
        ALTER TABLE lecturers 
        ADD COLUMN IF NOT EXISTS locked_at TIMESTAMP
      `);
      console.log('locked_at column added/verified in lecturers table');
    } catch (error) {
      console.log('locked_at column may already exist:', error.message);
    }

    // Create colleges table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS colleges (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        short_name VARCHAR(50) NOT NULL,
        description TEXT,
        established VARCHAR(4),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create departments table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS departments (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        college_id INTEGER REFERENCES colleges(id),
        description TEXT,
        head_of_department VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create courses table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS courses (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        code VARCHAR(50) UNIQUE NOT NULL,
        department_id INTEGER REFERENCES departments(id),
        credits INTEGER DEFAULT 0,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Update existing courses table if needed
    try {
      await pool.query(`ALTER TABLE courses ADD COLUMN IF NOT EXISTS department_id INTEGER REFERENCES departments(id)`);
      await pool.query(`ALTER TABLE courses ADD COLUMN IF NOT EXISTS credits INTEGER DEFAULT 0`);
      await pool.query(`ALTER TABLE courses ADD COLUMN IF NOT EXISTS duration INTEGER DEFAULT 4`);
      await pool.query(`ALTER TABLE courses ADD COLUMN IF NOT EXISTS academic_level VARCHAR(20) DEFAULT 'bachelor'`);
      await pool.query(`ALTER TABLE courses ADD COLUMN IF NOT EXISTS year_of_study INTEGER DEFAULT 1`);
      console.log('✅ Courses table updated with duration, academic_level, and year_of_study columns');
    } catch (error) {
      console.log('Table alteration completed or not needed');
    }

    // Update existing departments with realistic HOD names
    try {
      const deptResult = await pool.query('SELECT * FROM departments WHERE head_of_department IS NULL OR head_of_department = \'\'');
      if (deptResult.rows.length > 0) {
        console.log('✅ Updating departments with realistic HOD names...');
        
        const departmentNames = {
          'computer': 'Dr. John Mwalimu',
          'information': 'Dr. Grace Kimaro',
          'engineering': 'Dr. Peter Moshi',
          'business': 'Dr. Mary Lyimo',
          'education': 'Dr. James Mwanza',
          'science': 'Dr. Sarah Mbwana',
          'arts': 'Dr. Robert Kihiyo',
          'law': 'Dr. Elizabeth Mwakasege',
          'medicine': 'Dr. David Mwangi',
          'agriculture': 'Dr. Joyce Mwenda'
        };
        
        for (const dept of deptResult.rows) {
          const deptType = Object.keys(departmentNames).find(type => 
            dept.name.toLowerCase().includes(type)
          );
          const hodName = departmentNames[deptType] || `Dr. ${dept.name.split(' ')[0]} Head`;
          
          await pool.query(
            'UPDATE departments SET head_of_department = $1 WHERE id = $2',
            [hodName, dept.id]
          );
        }
        console.log(`✅ Updated ${deptResult.rows.length} departments with HOD names`);
      }
    } catch (error) {
      console.log('HOD update completed or not needed');
    }

    // Create programs table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS programs (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        course_id INTEGER REFERENCES courses(id),
        lecturer_id INTEGER REFERENCES lecturers(id),
        credits INTEGER DEFAULT 0,
        total_semesters INTEGER DEFAULT 1,
        duration INTEGER DEFAULT 1,
        lecturer_name VARCHAR(255),
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Update existing programs table if needed
    try {
      await pool.query(`ALTER TABLE programs ADD COLUMN IF NOT EXISTS duration INTEGER DEFAULT 1`);
      await pool.query(`ALTER TABLE programs ADD COLUMN IF NOT EXISTS lecturer_name VARCHAR(255)`);
      await pool.query(`ALTER TABLE programs ALTER COLUMN credits SET DEFAULT 0`);
      await pool.query(`ALTER TABLE programs ALTER COLUMN total_semesters SET DEFAULT 1`);
      await pool.query(`ALTER TABLE programs ADD COLUMN IF NOT EXISTS semester INTEGER`);
    } catch (error) {
      console.log('Programs table alteration completed or not needed');
    }

    // Create students table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS students (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        registration_number VARCHAR(100) UNIQUE NOT NULL,
        academic_year VARCHAR(20) NOT NULL,
        course_id INTEGER REFERENCES courses(id),
        current_semester INTEGER NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        phone VARCHAR(20),
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add year_of_study column if it doesn't exist (for data separation by year)
    try {
      await pool.query(`
        ALTER TABLE students 
        ADD COLUMN IF NOT EXISTS year_of_study INTEGER DEFAULT 1
      `);
      console.log('year_of_study column added/verified in students table');
    } catch (error) {
      console.log('year_of_study column may already exist:', error.message);
    }

    // Add academic_level column if it doesn't exist (for level-based filtering)
    try {
      await pool.query(`
        ALTER TABLE students 
        ADD COLUMN IF NOT EXISTS academic_level VARCHAR(50) DEFAULT 'bachelor'
      `);
      console.log('academic_level column added/verified in students table');
    } catch (error) {
      console.log('academic_level column may already exist:', error.message);
    }

    // Add is_active column for account activation (students must self-register to activate)
    try {
      await pool.query(`
        ALTER TABLE students 
        ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT false
      `);
      console.log('is_active column added/verified in students table');
    } catch (error) {
      console.log('is_active column may already exist:', error.message);
    }

    // Fix password field size if it's too small (varchar(10) -> varchar(255))
    try {
      await pool.query(`
        ALTER TABLE students 
        ALTER COLUMN password TYPE VARCHAR(255)
      `);
      console.log('✅ Password field in students table resized to VARCHAR(255)');
    } catch (error) {
      console.log('Password field resize may not be needed:', error.message);
    }

    // Add is_locked column for account locking
    try {
      await pool.query(`
        ALTER TABLE students 
        ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT false
      `);
      console.log('is_locked column added/verified in students table');
    } catch (error) {
      console.log('is_locked column may already exist:', error.message);
    }

    // Add locked_at column to track when account was locked
    try {
      await pool.query(`
        ALTER TABLE students 
        ADD COLUMN IF NOT EXISTS locked_at TIMESTAMP
      `);
      console.log('locked_at column added/verified in students table');
    } catch (error) {
      console.log('locked_at column may already exist:', error.message);
    }

    // Add CR (Class Representative) columns
    try {
      await pool.query(`
        ALTER TABLE students 
        ADD COLUMN IF NOT EXISTS is_cr BOOLEAN DEFAULT false
      `);
      console.log('is_cr column added/verified in students table');
    } catch (error) {
      console.log('is_cr column may already exist:', error.message);
    }

    try {
      await pool.query(`
        ALTER TABLE students 
        ADD COLUMN IF NOT EXISTS cr_activated_at TIMESTAMP
      `);
      console.log('cr_activated_at column added/verified in students table');
    } catch (error) {
      console.log('cr_activated_at column may already exist:', error.message);
    }

    try {
      await pool.query(`
        ALTER TABLE students 
        ADD COLUMN IF NOT EXISTS cr_activated_by VARCHAR(255)
      `);
      console.log('cr_activated_by column added/verified in students table');
    } catch (error) {
      console.log('cr_activated_by column may already exist:', error.message);
    }

    // Create academic_periods table for global academic year & semester settings
    await pool.query(`
      CREATE TABLE IF NOT EXISTS academic_periods (
        id SERIAL PRIMARY KEY,
        academic_year VARCHAR(20) NOT NULL,
        semester INTEGER NOT NULL,
        is_active BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Ensure only one active period logically enforced by updates (no unique constraint errors on old data)

    // Create passwords table for password management
    await pool.query(`
      CREATE TABLE IF NOT EXISTS password_records (
        id SERIAL PRIMARY KEY,
        user_type VARCHAR(20) NOT NULL,
        user_id INTEGER NOT NULL,
        username VARCHAR(100) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_type, user_id)
      )
    `);
    
    // Add UNIQUE constraint if it doesn't exist (for existing databases)
    try {
      await pool.query(`
        ALTER TABLE password_records 
        ADD CONSTRAINT password_records_user_type_user_id_key 
        UNIQUE (user_type, user_id)
      `);
      console.log('✅ UNIQUE constraint added to password_records table');
    } catch (error) {
      // Constraint may already exist
      console.log('UNIQUE constraint may already exist on password_records:', error.message);
    }

    // Create content table for file uploads (with file_data for database storage)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS content (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        program_name VARCHAR(255) NOT NULL,
        content_type VARCHAR(50) NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        file_size VARCHAR(50),
        file_url VARCHAR(500),
        file_data BYTEA,
        file_mimetype VARCHAR(100),
        lecturer_id INTEGER,
        lecturer_name VARCHAR(255),
        upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(20) DEFAULT 'published'
      )
    `);

    // Add file_data column if it doesn't exist (for existing databases)
    try {
      await pool.query(`ALTER TABLE content ADD COLUMN IF NOT EXISTS file_data BYTEA`);
      await pool.query(`ALTER TABLE content ADD COLUMN IF NOT EXISTS file_mimetype VARCHAR(100)`);
      console.log('✅ file_data and file_mimetype columns added/verified in content table');
    } catch (error) {
      console.log('file_data column may already exist:', error.message);
    }

    // Create file_storage table for all uploaded files (centralized storage)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS file_storage (
        id SERIAL PRIMARY KEY,
        file_name VARCHAR(255) NOT NULL,
        original_name VARCHAR(255) NOT NULL,
        file_data BYTEA NOT NULL,
        file_mimetype VARCHAR(100) NOT NULL,
        file_size INTEGER,
        uploaded_by_id INTEGER,
        uploaded_by_type VARCHAR(50),
        upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ file_storage table created/verified for persistent file storage');

    // Drop and recreate discussions table to ensure correct structure
    await pool.query(`DROP TABLE IF EXISTS discussions CASCADE`);
    await pool.query(`DROP TABLE IF EXISTS discussion_replies CASCADE`);
    
    // Create discussions table
    await pool.query(`
      CREATE TABLE discussions (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        category VARCHAR(50) NOT NULL,
        program VARCHAR(255) NOT NULL,
        author VARCHAR(255) NOT NULL,
        author_id INTEGER,
        author_type VARCHAR(20) DEFAULT 'student',
        group_name VARCHAR(255),
        group_leader VARCHAR(255),
        group_members TEXT,
        priority VARCHAR(20) DEFAULT 'normal',
        status VARCHAR(20) DEFAULT 'active',
        replies INTEGER DEFAULT 0,
        likes INTEGER DEFAULT 0,
        views INTEGER DEFAULT 0,
        is_pinned BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create discussion_replies table with file support
    await pool.query(`
      CREATE TABLE discussion_replies (
        id SERIAL PRIMARY KEY,
        discussion_id INTEGER NOT NULL,
        content TEXT,
        author VARCHAR(255) NOT NULL,
        author_id INTEGER,
        author_type VARCHAR(20) DEFAULT 'student',
        file_url VARCHAR(500),
        file_name VARCHAR(255),
        file_type VARCHAR(50),
        file_size INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (discussion_id) REFERENCES discussions(id) ON DELETE CASCADE
      )
    `);

    // Add file columns to existing discussion_replies table
    try {
      await pool.query(`ALTER TABLE discussion_replies ADD COLUMN IF NOT EXISTS file_url VARCHAR(500)`);
      await pool.query(`ALTER TABLE discussion_replies ADD COLUMN IF NOT EXISTS file_name VARCHAR(255)`);
      await pool.query(`ALTER TABLE discussion_replies ADD COLUMN IF NOT EXISTS file_type VARCHAR(50)`);
      await pool.query(`ALTER TABLE discussion_replies ADD COLUMN IF NOT EXISTS file_size INTEGER`);
      await pool.query(`ALTER TABLE discussion_replies ALTER COLUMN content DROP NOT NULL`);
      console.log('✅ File columns added to discussion_replies table');
    } catch (error) {
      console.log('Discussion replies file columns may already exist:', error.message);
    }


    // Create study_group_notifications table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS study_group_notifications (
        id SERIAL PRIMARY KEY,
        discussion_id INTEGER NOT NULL REFERENCES discussions(id) ON DELETE CASCADE,
        student_reg_no VARCHAR(100) NOT NULL,
        student_name VARCHAR(255) NOT NULL,
        group_name VARCHAR(255) NOT NULL,
        group_leader VARCHAR(255) NOT NULL,
        program VARCHAR(255) NOT NULL,
        notification_type VARCHAR(50) DEFAULT 'group_invitation',
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create assignments table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS assignments (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        program_id INTEGER,
        program_name VARCHAR(255) NOT NULL,
        deadline TIMESTAMP NOT NULL,
        submission_type VARCHAR(20) DEFAULT 'text',
        max_points INTEGER DEFAULT 100,
        lecturer_id INTEGER,
        lecturer_name VARCHAR(255),
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add program_id column to existing assignments table if it doesn't exist
    try {
      await pool.query(`ALTER TABLE assignments ADD COLUMN IF NOT EXISTS program_id INTEGER`);
      console.log('✅ Ensured program_id column exists in assignments table');
    } catch (error) {
      console.log('Assignment table migration completed or not needed');
    }

    // Create assignment_submissions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS assignment_submissions (
        id SERIAL PRIMARY KEY,
        assignment_id INTEGER REFERENCES assignments(id) ON DELETE CASCADE,
        student_id INTEGER,
        student_name VARCHAR(255),
        student_registration VARCHAR(100),
        student_program VARCHAR(255),
        submission_type VARCHAR(20),
        text_content TEXT,
        file_path VARCHAR(500),
        file_name VARCHAR(255),
        submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        points_awarded INTEGER DEFAULT 0,
        feedback TEXT,
        graded_at TIMESTAMP
      )
    `);

    console.log('Database tables initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
  }
};

// Database will be initialized when server starts

// API Routes

// Authentication endpoint for student and lecturer login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password, userType } = req.body;
    
    console.log('=== LOGIN ATTEMPT ===');
    console.log('Username:', username);
    console.log('User Type:', userType);
    
    if (!username || !password || !userType) {
      return res.status(400).json({ 
        success: false, 
        error: 'Username, password, and user type are required' 
      });
    }
    
    let user = null;
    let query = '';
    let params = [];
    
    if (userType === 'student') {
      // Try to find student by registration number, email, or name
      query = `
        SELECT * FROM students 
        WHERE registration_number = $1 
           OR email = $1 
           OR LOWER(name) = LOWER($1)
      `;
      params = [username];
      
      const result = await pool.query(query, params);
      
      if (result.rows.length > 0) {
        const student = result.rows[0];
        
        // Check if account is locked
        if (student.is_locked === true) {
          console.log('❌ Login attempt on locked account:', username);
          return res.status(403).json({ 
            success: false, 
            error: 'Account is locked. Please contact IT administrator to unlock your account.',
            isLocked: true
          });
        }
        
        // Check if account is active
        if (student.is_active === false) {
          return res.status(403).json({ 
            success: false, 
            error: 'Account not activated. Please complete self-registration first.',
            needsActivation: true
          });
        }
        
        // Verify password
        if (student.password === password) {
          user = {
            id: student.id,
            name: student.name,
            registration_number: student.registration_number,
            email: student.email,
            course_id: student.course_id,
            academic_year: student.academic_year,
            current_semester: student.current_semester,
            type: 'student'
          };
          
          console.log('Student login successful:', user.name);
        } else {
          console.log('Password mismatch for student:', username);
        }
      } else {
        console.log('Student not found:', username);
      }
      
    } else if (userType === 'lecturer') {
      // Try to find lecturer by employee_id, email, or name
      query = `
        SELECT * FROM lecturers 
        WHERE employee_id = $1 
           OR email = $1 
           OR LOWER(name) = LOWER($1)
      `;
      params = [username];
      
      const result = await pool.query(query, params);
      
      if (result.rows.length > 0) {
        const lecturer = result.rows[0];
        
        // Check if account is locked
        if (lecturer.is_locked === true) {
          console.log('❌ Login attempt on locked account:', username);
          return res.status(403).json({ 
            success: false, 
            error: 'Account is locked. Please contact IT administrator to unlock your account.',
            isLocked: true
          });
        }
        
        // Check if account is active
        if (lecturer.is_active === false) {
          return res.status(403).json({ 
            success: false, 
            error: 'Account not activated. Please complete self-registration first.',
            needsActivation: true
          });
        }
        
        // Verify password
        if (lecturer.password === password) {
          user = {
            id: lecturer.id,
            name: lecturer.name,
            employee_id: lecturer.employee_id,
            email: lecturer.email,
            specialization: lecturer.specialization,
            phone: lecturer.phone,
            type: 'lecturer'
          };
          
          console.log('Lecturer login successful:', user.name);
        } else {
          console.log('Password mismatch for lecturer:', username);
        }
      } else {
        console.log('Lecturer not found:', username);
      }
    } else {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid user type. Must be "student" or "lecturer"' 
      });
    }
    
    if (user) {
      res.json({ 
        success: true, 
        data: user,
        message: `Welcome ${user.name}!`
      });
    } else {
      res.status(401).json({ 
        success: false, 
        error: 'Invalid username or password' 
      });
    }
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error during login. Please try again.' 
    });
  }
});

// Student self-registration endpoint
app.post('/api/auth/student-register', async (req, res) => {
  try {
    const { 
      registrationNumber, 
      password, 
      confirmPassword, 
      email 
    } = req.body;

    console.log('=== STUDENT SELF-REGISTRATION ===');
    console.log('Registration Number:', registrationNumber);
    console.log('Email:', email);

    // Validate required fields
    if (!registrationNumber || !password || !confirmPassword || !email) {
      return res.status(400).json({ 
        success: false, 
        error: 'All fields are required' 
      });
    }

    // Validate password match
    if (password !== confirmPassword) {
      return res.status(400).json({ 
        success: false, 
        error: 'Passwords do not match' 
      });
    }

    // Check if registration number exists in database (pre-registered by admin)
    const existingStudent = await pool.query(
      'SELECT * FROM students WHERE registration_number = $1',
      [registrationNumber]
    );

    if (existingStudent.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Registration number not found. Please contact admin to register you first.' 
      });
    }

    const student = existingStudent.rows[0];

    // Check if already activated
    if (student.is_active === true) {
      return res.status(400).json({ 
        success: false, 
        error: 'This account has already been activated. Please login instead.' 
      });
    }

    // Update student record with new information and activate account
    const updateResult = await pool.query(
      `UPDATE students 
       SET email = $1, 
           password = $2, 
           is_active = true, 
           updated_at = CURRENT_TIMESTAMP 
       WHERE registration_number = $3 
       RETURNING *`,
      [email, password, registrationNumber]
    );

    // Try to update password records (non-critical - don't fail if it errors)
    try {
      await pool.query(
        `INSERT INTO password_records (user_type, user_id, username, password_hash) 
         VALUES ('student', $1, $2, $3)
         ON CONFLICT (user_type, user_id) 
         DO UPDATE SET password_hash = $3, updated_at = CURRENT_TIMESTAMP`,
        [updateResult.rows[0].id, registrationNumber, password]
      );
    } catch (pwdRecordError) {
      console.warn('⚠️ Password record update failed (non-critical):', pwdRecordError.message);
    }

    console.log('✅ Student self-registration successful:', updateResult.rows[0].name);

    res.json({ 
      success: true, 
      message: 'Registration successful! You can now login with your credentials.',
      data: {
        id: updateResult.rows[0].id,
        name: updateResult.rows[0].name,
        registration_number: updateResult.rows[0].registration_number,
        email: updateResult.rows[0].email
      }
    });

  } catch (error) {
    console.error('❌ Student self-registration error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error during registration. Please try again.' 
    });
  }
});

// Lecturer self-registration endpoint
app.post('/api/auth/lecturer-register', async (req, res) => {
  try {
    const { 
      employeeId, 
      password, 
      confirmPassword 
    } = req.body;

    console.log('=== LECTURER SELF-REGISTRATION ===');
    console.log('Employee ID:', employeeId);

    // Validate required fields
    if (!employeeId || !password || !confirmPassword) {
      return res.status(400).json({ 
        success: false, 
        error: 'All fields are required' 
      });
    }

    // Validate password match
    if (password !== confirmPassword) {
      return res.status(400).json({ 
        success: false, 
        error: 'Passwords do not match' 
      });
    }

    // Validate password strength
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
    if (!passwordRegex.test(password)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, and one number' 
      });
    }

    // Check if employee ID exists in database (pre-registered by admin)
    const existingLecturer = await pool.query(
      'SELECT * FROM lecturers WHERE employee_id = $1',
      [employeeId]
    );

    if (existingLecturer.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Employee ID not found. Please contact admin to register you first.' 
      });
    }

    const lecturer = existingLecturer.rows[0];

    // Check if already activated
    if (lecturer.is_active === true) {
      return res.status(400).json({ 
        success: false, 
        error: 'This account has already been activated. Please login instead.' 
      });
    }

    // Update lecturer record with new password and activate account
    const updateResult = await pool.query(
      `UPDATE lecturers 
       SET password = $1, 
           is_active = true, 
           updated_at = CURRENT_TIMESTAMP 
       WHERE employee_id = $2 
       RETURNING *`,
      [password, employeeId]
    );

    // Try to update password records (non-critical - don't fail if it errors)
    try {
      await pool.query(
        `INSERT INTO password_records (user_type, user_id, username, password_hash) 
         VALUES ('lecturer', $1, $2, $3)
         ON CONFLICT (user_type, user_id) 
         DO UPDATE SET password_hash = $3, updated_at = CURRENT_TIMESTAMP`,
        [updateResult.rows[0].id, employeeId, password]
      );
    } catch (pwdRecordError) {
      console.warn('⚠️ Password record update failed (non-critical):', pwdRecordError.message);
    }

    console.log('✅ Lecturer self-registration successful:', updateResult.rows[0].name);

    res.json({ 
      success: true, 
      message: 'Registration successful! You can now login with your credentials.',
      data: {
        id: updateResult.rows[0].id,
        name: updateResult.rows[0].name,
        employee_id: updateResult.rows[0].employee_id,
        email: updateResult.rows[0].email
      }
    });

  } catch (error) {
    console.error('❌ Lecturer self-registration error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error during registration. Please try again.' 
    });
  }
});

// Lecturer routes
app.post('/api/lecturers', async (req, res) => {
  try {
    const { name, employeeId, specialization, email, phone, password } = req.body;
    
    // Check if email already exists
    const existingEmail = await pool.query(
      'SELECT id FROM lecturers WHERE email = $1',
      [email]
    );
    
    if (existingEmail.rows.length > 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email already exists. Please use a different email address.' 
      });
    }
    
    // Check if employee ID already exists
    const existingEmployeeId = await pool.query(
      'SELECT id FROM lecturers WHERE employee_id = $1',
      [employeeId]
    );
    
    if (existingEmployeeId.rows.length > 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Employee ID already exists. Please use a different employee ID.' 
      });
    }
    
    const result = await pool.query(
      `INSERT INTO lecturers (name, employee_id, specialization, email, phone, password) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name, employeeId, specialization, email, phone, password]
    );

    // Also save to password records
    await pool.query(
      `INSERT INTO password_records (user_type, user_id, username, password_hash) 
       VALUES ('lecturer', $1, $2, $3)`,
      [result.rows[0].id, employeeId, password]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error creating lecturer:', error);
    
    // Handle specific database errors
    if (error.code === '23505') {
      if (error.constraint === 'lecturers_email_key') {
        return res.status(400).json({ 
          success: false, 
          error: 'Email already exists. Please use a different email address.' 
        });
      } else if (error.constraint === 'lecturers_employee_id_key') {
        return res.status(400).json({ 
          success: false, 
          error: 'Employee ID already exists. Please use a different employee ID.' 
        });
      }
    }
    
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get lecturers with proper filtering based on user type
app.get('/api/lecturers', optionalAuth, async (req, res) => {
  try {
    const { lecturer_id, user_type, username } = req.query;
    const userFromToken = req.user; // From JWT if provided
    
    console.log('=== FETCHING LECTURERS ===');
    console.log('Query params:', { lecturer_id, user_type, username });
    console.log('User from token:', userFromToken);
    
    // Determine user type from token or query
    const effectiveUserType = userFromToken?.userType || user_type;
    const effectiveUserId = userFromToken?.userId || lecturer_id;
    
    // If username is provided, find specific lecturer by username/employee_id
    if (username) {
      console.log('=== SEARCHING FOR LECTURER ===');
      console.log('Username/Employee ID:', username);
      
      // First try direct field match
      let result = await pool.query(
        'SELECT id, name, employee_id, specialization, email, phone, created_at FROM lecturers WHERE employee_id = $1 OR email = $1 OR name = $1',
        [username]
      );
      console.log(`Found ${result.rows.length} lecturer(s) by direct match: ${username}`);
      
      // If not found, try password_records lookup
      if (result.rows.length === 0) {
        console.log('Lecturer not found by direct match, checking password_records...');
        const passwordResult = await pool.query(
          'SELECT user_id FROM password_records WHERE username = $1 AND user_type = $2',
          [username, 'lecturer']
        );
        
        if (passwordResult.rows.length > 0) {
          console.log('Found lecturer via password_records, user_id:', passwordResult.rows[0].user_id);
          result = await pool.query(
            'SELECT id, name, employee_id, specialization, email, phone, created_at FROM lecturers WHERE id = $1',
            [passwordResult.rows[0].user_id]
          );
          console.log(`Found ${result.rows.length} lecturer(s) via password_records`);
        }
      }
      
      if (result.rows.length > 0) {
        console.log('Lecturer found:', result.rows[0]);
      } else {
        console.log('=== LECTURER NOT FOUND - DEBUGGING ===');
        
        // Check total lecturers in database
        const totalLecturers = await pool.query('SELECT COUNT(*) FROM lecturers');
        console.log('Total lecturers in database:', totalLecturers.rows[0].count);
        
        // Show sample lecturer employee_ids
        const sampleLecturers = await pool.query('SELECT employee_id, name FROM lecturers LIMIT 5');
        console.log('Sample lecturer employee_ids:', sampleLecturers.rows);
      }
      
      return res.json({ success: true, data: result.rows });
    }
    
    // For specific lecturer - only their info
    if (effectiveUserType === 'lecturer' && effectiveUserId) {
      const result = await pool.query(
        'SELECT id, name, employee_id, specialization, email, phone, created_at FROM lecturers WHERE id = $1',
        [effectiveUserId]
      );
      console.log(`Found lecturer info for ID ${effectiveUserId}`);
      return res.json({ success: true, data: result.rows });
    }
    
    // For admin - all lecturers
    if (effectiveUserType === 'admin') {
      const result = await pool.query(
        'SELECT id, name, employee_id, specialization, email, phone, created_at, updated_at FROM lecturers ORDER BY created_at DESC'
      );
      console.log(`Found ${result.rows.length} lecturers (admin view)`);
      return res.json({ success: true, data: result.rows });
    }
    
    // For students or unauthenticated - can see basic lecturer info (names only for program display)
    // This is safe as it only exposes public information needed for course catalogs
    const result = await pool.query(
      'SELECT id, name, employee_id, specialization FROM lecturers ORDER BY name ASC'
    );
    console.log(`Found ${result.rows.length} lecturers (public view - basic info only)`);
    return res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching lecturers:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get current lecturer by username (EFFICIENT - no need to fetch all lecturers)
app.get('/api/lecturers/me', async (req, res) => {
  try {
    const { username } = req.query;
    
    console.log('=== GET CURRENT LECTURER ===');
    console.log('Username:', username);
    
    if (!username) {
      return res.status(400).json({ success: false, error: 'Username is required' });
    }
    
    // SECURITY: Exclude password from response
    const result = await pool.query(
      'SELECT id, name, employee_id, specialization, email, phone, created_at, updated_at FROM lecturers WHERE employee_id = $1 OR email = $1 OR name = $1',
      [username]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Lecturer not found' });
    }
    
    console.log('Lecturer found:', result.rows[0].name);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error fetching current lecturer:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update lecturer
app.put('/api/lecturers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, employeeId, specialization, email, phone, password } = req.body;
    
    console.log('=== UPDATING LECTURER ===');
    console.log('Lecturer ID:', id);
    console.log('Update Data:', { name, employeeId, specialization, email, phone, hasPassword: !!password });
    
    // Build update query dynamically based on provided fields
    const updates = [];
    const values = [];
    let paramCount = 1;
    
    if (name) {
      updates.push(`name = $${paramCount++}`);
      values.push(name);
    }
    if (employeeId) {
      updates.push(`employee_id = $${paramCount++}`);
      values.push(employeeId);
    }
    if (specialization) {
      updates.push(`specialization = $${paramCount++}`);
      values.push(specialization);
    }
    if (email) {
      updates.push(`email = $${paramCount++}`);
      values.push(email);
    }
    if (phone) {
      updates.push(`phone = $${paramCount++}`);
      values.push(phone);
    }
    if (password) {
      updates.push(`password = $${paramCount++}`);
      values.push(password);
    }
    
    // Always update the updated_at timestamp
    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    
    // Add the ID as the last parameter
    values.push(id);
    
    if (updates.length === 1) { // Only updated_at
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }
    
    const query = `UPDATE lecturers SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`;
    
    console.log('Update Query:', query);
    console.log('Update Values:', values);
    
    const result = await pool.query(query, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Lecturer not found' });
    }
    
    // Update password records if password was changed
    if (password) {
      try {
        await pool.query(
          `INSERT INTO password_records (user_type, user_id, username, password_hash) 
           VALUES ('lecturer', $1, $2, $3)
           ON CONFLICT (user_type, user_id) 
           DO UPDATE SET password_hash = $3, updated_at = CURRENT_TIMESTAMP`,
          [id, employeeId || result.rows[0].employee_id, password]
        );
      } catch (pwdError) {
        console.warn('⚠️ Password record update failed (non-critical):', pwdError.message);
      }
    }
    
    console.log('✅ Lecturer updated successfully:', result.rows[0].name);
    res.json({ success: true, message: 'Lecturer updated successfully', data: result.rows[0] });
  } catch (error) {
    console.error('❌ Error updating lecturer:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete lecturer
app.delete('/api/lecturers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Remove active session if exists
    activeSessions.delete(parseInt(id));
    
    // First delete from password_records
    await pool.query('DELETE FROM password_records WHERE user_type = $1 AND user_id = $2', ['lecturer', id]);
    
    // Update programs to remove lecturer assignment
    await pool.query('UPDATE programs SET lecturer_id = NULL, lecturer_name = NULL WHERE lecturer_id = $1', [id]);
    
    // Then delete the lecturer
    const result = await pool.query('DELETE FROM lecturers WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Lecturer not found' });
    }
    
    res.json({ success: true, message: 'Lecturer deleted successfully', data: result.rows[0] });
  } catch (error) {
    console.error('Error deleting lecturer:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Student routes
app.post('/api/students', async (req, res) => {
  try {
    const { name, registrationNumber, academicYear, courseId, currentSemester, email, phone, password, yearOfStudy, academicLevel } = req.body;
    
    const result = await pool.query(
      `INSERT INTO students (name, registration_number, academic_year, course_id, current_semester, email, phone, password, year_of_study, academic_level) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [name, registrationNumber, academicYear, courseId, currentSemester, email, phone, password, yearOfStudy || 1, academicLevel || 'bachelor']
    );

    // Also save to password records
    await pool.query(
      `INSERT INTO password_records (user_type, user_id, username, password_hash) 
       VALUES ('student', $1, $2, $3)`,
      [result.rows[0].id, registrationNumber, password]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error creating student:', error);

    // Handle common database errors with clearer messages
    if (error.code === '23505') {
      // Unique constraint violation (e.g. duplicate registration number or email)
      return res.status(400).json({
        success: false,
        error: 'Student with this registration number or email already exists'
      });
    }

    if (error.code === '23502') {
      // NOT NULL constraint violation
      return res.status(400).json({
        success: false,
        error: 'Missing required student fields. Please make sure name, registration number, academic year, course, semester, email and password are filled.'
      });
    }

    res.status(500).json({ success: false, error: error.message });
  }
});

// Get active academic period (for global year/semester settings)
app.get('/api/academic-periods/active', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM academic_periods WHERE is_active = true ORDER BY created_at DESC LIMIT 1`
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No active academic period found'
      });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error fetching active academic period:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Set active academic period (update global academic year & semester)
app.post('/api/academic-periods/active', async (req, res) => {
  const { academicYear, academic_year, semester } = req.body;
  const year = academicYear || academic_year;
  const sem = parseInt(semester, 10);

  if (!year || isNaN(sem)) {
    return res.status(400).json({ success: false, error: 'academicYear and semester are required' });
  }

  try {
    await pool.query('BEGIN');
    
    // Check if academic period already exists
    const existingResult = await pool.query(
      `SELECT * FROM academic_periods WHERE academic_year = $1 AND semester = $2`,
      [year, sem]
    );
    
    let periodRecord;
    
    if (existingResult.rows.length > 0) {
      // Period exists, just update its is_active status
      periodRecord = existingResult.rows[0];
    } else {
      // Period doesn't exist, create it
      const insertResult = await pool.query(
        `INSERT INTO academic_periods (academic_year, semester, is_active) VALUES ($1, $2, false) RETURNING *`,
        [year, sem]
      );
      periodRecord = insertResult.rows[0];
    }
    
    // Deactivate any existing active period
    await pool.query(`UPDATE academic_periods SET is_active = false WHERE is_active = true`);
    
    // Activate the selected period
    const updateResult = await pool.query(
      `UPDATE academic_periods SET is_active = true WHERE academic_year = $1 AND semester = $2 RETURNING *`,
      [year, sem]
    );

    await pool.query('COMMIT');
    
    console.log(`✅ Academic period activated: ${year} - Semester ${sem}`);
    return res.json({ success: true, data: updateResult.rows[0] });
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('Error setting active academic period:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Get students with proper filtering based on user type
app.get('/api/students', optionalAuth, async (req, res) => {
  try {
    const { lecturer_id, user_type, year_of_study, academic_level } = req.query;
    const userFromToken = req.user; // From JWT if provided
    
    console.log('=== FETCHING STUDENTS ===');
    console.log('Query params:', { lecturer_id, user_type, year_of_study, academic_level });
    console.log('User from token:', userFromToken);
    
    // Determine user type from token or query
    const effectiveUserType = userFromToken?.userType || user_type;
    const effectiveUserId = userFromToken?.userId || lecturer_id;
    
    // Build filter conditions for year and level
    let yearFilter = '';
    let levelFilter = '';
    const filterParams = [];
    
    if (year_of_study) {
      yearFilter = ` AND s.year_of_study = $${filterParams.length + 1}`;
      filterParams.push(parseInt(year_of_study));
    }
    
    if (academic_level) {
      levelFilter = ` AND s.academic_level = $${filterParams.length + 1}`;
      filterParams.push(academic_level);
    }
    
    // For lecturers - only their students (students in their programs)
    if (effectiveUserType === 'lecturer' && effectiveUserId) {
      // First get lecturer info to match by both ID and name/employee_id
      const lecturerResult = await pool.query(
        'SELECT id, employee_id, name FROM lecturers WHERE id = $1',
        [effectiveUserId]
      );
      
      if (lecturerResult.rows.length === 0) {
        console.log('Lecturer not found with ID:', effectiveUserId);
        return res.json({ success: true, data: [] });
      }
      
      const lecturer = lecturerResult.rows[0];
      console.log('Fetching students for lecturer:', lecturer);
      
      // Get students from programs matching lecturer by ID OR name/employee_id
      const baseParams = [lecturer.id, lecturer.employee_id, lecturer.name, `%${lecturer.employee_id}%`, `%${lecturer.name}%`];
      const allParams = [...baseParams, ...filterParams];
      
      const result = await pool.query(`
        SELECT DISTINCT s.id, s.name, s.registration_number, s.academic_year, 
               s.course_id, s.current_semester, s.email, s.phone, s.created_at,
               s.year_of_study, s.academic_level,
               c.name as course_name
        FROM students s
        LEFT JOIN courses c ON s.course_id = c.id
        WHERE s.course_id IN (
          SELECT DISTINCT course_id FROM programs 
          WHERE lecturer_id = $1 
             OR lecturer_name = $2 
             OR lecturer_name = $3
             OR lecturer_name ILIKE $4
             OR lecturer_name ILIKE $5
        )
        ${yearFilter.replace(/\$\d+/g, (match) => {
          const num = parseInt(match.substring(1));
          return `$${baseParams.length + num}`;
        })}
        ${levelFilter.replace(/\$\d+/g, (match) => {
          const num = parseInt(match.substring(1));
          return `$${baseParams.length + filterParams.length - (academic_level ? 1 : 0) + num}`;
        })}
        ORDER BY s.year_of_study ASC, s.created_at DESC
      `, allParams);
      
      console.log(`Found ${result.rows.length} students for lecturer ${lecturer.name} (ID: ${lecturer.id})`);
      return res.json({ success: true, data: result.rows });
    }
    
    // For admin - all students with optional filtering
    if (effectiveUserType === 'admin') {
      const result = await pool.query(`
        SELECT s.id, s.name, s.registration_number, s.academic_year, s.course_id, 
               s.current_semester, s.email, s.phone, s.created_at, s.updated_at,
               s.year_of_study, s.academic_level,
               c.name as course_name 
        FROM students s 
        LEFT JOIN courses c ON s.course_id = c.id 
        WHERE 1=1
        ${yearFilter}
        ${levelFilter}
        ORDER BY s.year_of_study ASC, s.created_at DESC
      `, filterParams);
      console.log(`Found ${result.rows.length} students (admin view)`);
      return res.json({ success: true, data: result.rows });
    }
    
    // For students or no authorization - return empty array (not 403)
    // This prevents errors in frontend when checking short-term program eligibility
    console.log('Unauthorized or student trying to access students list - returning empty array');
    res.json({ success: true, data: [] });
  } catch (error) {
    console.error('Error fetching students:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get students by registration numbers (for study group notifications)
app.post('/api/students/by-registration', async (req, res) => {
  try {
    const { registrationNumbers } = req.body;
    
    if (!registrationNumbers || !Array.isArray(registrationNumbers)) {
      return res.status(400).json({ success: false, error: 'Registration numbers array is required' });
    }
    
    const placeholders = registrationNumbers.map((_, index) => `$${index + 1}`).join(',');
    const result = await pool.query(`
      SELECT s.*, c.name as course_name 
      FROM students s 
      LEFT JOIN courses c ON s.course_id = c.id 
      WHERE s.registration_number = ANY($1)
    `, [registrationNumbers]);
    
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching students by registration:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get current student by username (EFFICIENT - no need to fetch all students)
app.get('/api/students/me', async (req, res) => {
  try {
    const { username } = req.query;
    
    console.log('=== GET CURRENT STUDENT ===');
    console.log('Username:', username);
    
    if (!username) {
      return res.status(400).json({ success: false, error: 'Username is required' });
    }
    
    // SECURITY: Exclude password from response
    // FIXED: Include year_of_study for short-term program targeting
    // FIXED: Include is_cr, cr_activated_at, cr_activated_by for CR status display
    const result = await pool.query(`
      SELECT s.id, s.name, s.registration_number, s.academic_year, s.course_id, 
             s.current_semester, s.email, s.phone, s.created_at, s.updated_at,
             s.year_of_study, s.is_cr, s.cr_activated_at, s.cr_activated_by,
             c.name as course_name, d.name as department_name, col.name as college_name
      FROM students s 
      LEFT JOIN courses c ON s.course_id = c.id
      LEFT JOIN departments d ON c.department_id = d.id
      LEFT JOIN colleges col ON d.college_id = col.id
      WHERE s.registration_number = $1 OR s.email = $1 OR s.name = $1
    `, [username]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }
    
    console.log('Student found:', result.rows[0].name, '| Is CR:', result.rows[0].is_cr);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error fetching current student:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get student's enrolled programs (regular + short-term)
app.get('/api/students/:id/programs', async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('=== FETCHING STUDENT PROGRAMS (REGULAR + SHORT-TERM) ===');
    console.log('Student ID:', id);
    
    // First get student info with college, department, course details
    const studentResult = await pool.query(`
      SELECT s.*, 
             c.name as course_name,
             d.name as department_name,
             col.name as college_name
      FROM students s
      LEFT JOIN courses c ON s.course_id = c.id
      LEFT JOIN departments d ON c.department_id = d.id
      LEFT JOIN colleges col ON d.college_id = col.id
      WHERE s.id = $1
    `, [id]);
    
    if (studentResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }
    
    const student = studentResult.rows[0];
    
    // Get regular programs for student's course
    const programsResult = await pool.query(`
      SELECT p.*, c.name as course_name, 'regular' as program_type
      FROM programs p 
      LEFT JOIN courses c ON p.course_id = c.id 
      WHERE p.course_id = $1
    `, [student.course_id]);
    
    const regularPrograms = programsResult.rows;
    const regularProgramNames = regularPrograms.map(p => p.name);
    
    console.log('Regular programs found:', regularPrograms.length);
    
    // Get short-term programs based on targeting
    const shortTermResult = await pool.query(
      'SELECT * FROM short_term_programs WHERE end_date > NOW() ORDER BY created_at DESC'
    );
    
    // Filter short-term programs based on targeting
    const studentShortTermPrograms = shortTermResult.rows.filter(program => {
      // Check targeting
      // CRITICAL: If target_type is null, undefined, or 'all', ALL students should see it
      if (!program.target_type || program.target_type === 'all' || program.target_type === '') return true;
      if (program.target_type === 'college' && program.target_value === student.college_name) return true;
      if (program.target_type === 'department' && program.target_value === student.department_name) return true;
      if (program.target_type === 'course' && program.target_value === student.course_name) return true;
      if (program.target_type === 'program') {
        return regularProgramNames.some(p => 
          p === program.target_value ||
          p?.toLowerCase().includes(program.target_value?.toLowerCase()) ||
          program.target_value?.toLowerCase().includes(p?.toLowerCase())
        );
      }
      return false;
    }).map(p => ({
      id: `short-${p.id}`,
      name: p.title,
      course_name: student.course_name,
      program_type: 'short-term',
      description: p.description,
      start_date: p.start_date,
      end_date: p.end_date
    }));
    
    console.log('Short-term programs found:', studentShortTermPrograms.length);
    
    // Combine regular and short-term programs
    const allPrograms = [...regularPrograms, ...studentShortTermPrograms];
    
    console.log('Total programs (regular + short-term):', allPrograms.length);
    res.json({ success: true, data: allPrograms });
  } catch (error) {
    console.error('Error fetching student programs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update student
app.put('/api/students/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, registration_number, registrationNumber, academic_year, academicYear, course_id, courseId, current_semester, currentSemester, email, phone, password, year_of_study, yearOfStudy, academic_level, academicLevel } = req.body;
    
    console.log('=== UPDATING STUDENT ===');
    console.log('Student ID:', id);
    console.log('Update Data:', req.body);
    
    // Handle both camelCase and snake_case field names
    const regNumber = registration_number || registrationNumber;
    const acadYear = academic_year || academicYear;
    const courseIdValue = course_id || courseId;
    const semester = current_semester || currentSemester;
    const yearStudy = year_of_study || yearOfStudy;
    const acadLevel = academic_level || academicLevel;
    
    // Build update query dynamically based on provided fields
    const updates = [];
    const values = [];
    let paramCount = 1;
    
    if (name) {
      updates.push(`name = $${paramCount++}`);
      values.push(name);
    }
    if (regNumber) {
      updates.push(`registration_number = $${paramCount++}`);
      values.push(regNumber);
    }
    if (acadYear) {
      updates.push(`academic_year = $${paramCount++}`);
      values.push(acadYear);
    }
    if (courseIdValue) {
      updates.push(`course_id = $${paramCount++}`);
      values.push(courseIdValue);
    }
    if (semester) {
      updates.push(`current_semester = $${paramCount++}`);
      values.push(semester);
    }
    if (email) {
      updates.push(`email = $${paramCount++}`);
      values.push(email);
    }
    if (phone) {
      updates.push(`phone = $${paramCount++}`);
      values.push(phone);
    }
    if (password) {
      updates.push(`password = $${paramCount++}`);
      values.push(password);
    }
    if (yearStudy) {
      updates.push(`year_of_study = $${paramCount++}`);
      values.push(yearStudy);
    }
    if (acadLevel) {
      updates.push(`academic_level = $${paramCount++}`);
      values.push(acadLevel);
    }
    
    // Always update the updated_at timestamp
    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    
    // Add the ID as the last parameter
    values.push(id);
    
    if (updates.length === 1) { // Only updated_at
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }
    
    const query = `UPDATE students SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`;
    
    console.log('Update Query:', query);
    console.log('Update Values:', values);
    
    const result = await pool.query(query, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }
    
    // Update password records if password was changed
    if (password) {
      try {
        await pool.query(
          `INSERT INTO password_records (user_type, user_id, username, password_hash) 
           VALUES ('student', $1, $2, $3)
           ON CONFLICT (user_type, user_id) 
           DO UPDATE SET password_hash = $3, updated_at = CURRENT_TIMESTAMP`,
          [id, regNumber || result.rows[0].registration_number, password]
        );
      } catch (pwdError) {
        console.warn('⚠️ Password record update failed (non-critical):', pwdError.message);
      }
    }
    
    console.log('✅ Student updated successfully:', result.rows[0].name);
    res.json({ success: true, message: 'Student updated successfully', data: result.rows[0] });
  } catch (error) {
    console.error('❌ Error updating student:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete student
app.delete('/api/students/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Remove active session if exists
    activeSessions.delete(parseInt(id));
    
    // First delete from password_records
    await pool.query('DELETE FROM password_records WHERE user_type = $1 AND user_id = $2', ['student', id]);
    
    // Then delete the student
    const result = await pool.query('DELETE FROM students WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }
    
    res.json({ success: true, message: 'Student deleted successfully', data: result.rows[0] });
  } catch (error) {
    console.error('Error deleting student:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== CLASS REPRESENTATIVE (CR) MANAGEMENT ====================

// Get all CRs
app.get('/api/class-representatives', async (req, res) => {
  try {
    console.log('=== FETCHING ALL CLASS REPRESENTATIVES ===');
    
    // First ensure students table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'students'
      )
    `);
    
    if (!tableCheck.rows[0].exists) {
      console.log('⚠️ Students table does not exist, creating...');
      // Create students table if it doesn't exist
      await pool.query(`
        CREATE TABLE IF NOT EXISTS students (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          registration_number VARCHAR(100) UNIQUE NOT NULL,
          email VARCHAR(255),
          phone VARCHAR(20),
          course_id INTEGER,
          academic_year VARCHAR(20),
          current_semester INTEGER DEFAULT 1,
          year_of_study INTEGER DEFAULT 1,
          academic_level VARCHAR(50) DEFAULT 'bachelor',
          is_active BOOLEAN DEFAULT true,
          is_cr BOOLEAN DEFAULT false,
          cr_activated_at TIMESTAMP,
          cr_activated_by VARCHAR(255),
          is_locked BOOLEAN DEFAULT false,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('✅ Students table created');
      return res.json({ success: true, data: [] });
    }
    
    // Ensure required CR columns exist
    try {
      await pool.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS is_cr BOOLEAN DEFAULT false`);
      await pool.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS cr_activated_at TIMESTAMP`);
      await pool.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS cr_activated_by VARCHAR(255)`);
      await pool.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS year_of_study INTEGER DEFAULT 1`);
      await pool.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS academic_level VARCHAR(50) DEFAULT 'bachelor'`);
      console.log('✅ CR columns verified/created');
    } catch (alterError) {
      console.log('Column check note:', alterError.message);
    }
    
    const result = await pool.query(`
      SELECT 
        s.id,
        s.name,
        s.registration_number,
        COALESCE(s.email, '') as email,
        COALESCE(s.phone, '') as phone,
        COALESCE(s.academic_year, '') as academic_year,
        COALESCE(s.current_semester, 1) as current_semester,
        COALESCE(s.year_of_study, 1) as year_of_study,
        COALESCE(s.academic_level, 'bachelor') as academic_level,
        COALESCE(s.is_cr, false) as is_cr,
        s.cr_activated_at,
        COALESCE(s.cr_activated_by, '') as cr_activated_by,
        COALESCE(c.name, 'No Course') as course_name,
        COALESCE(c.code, '') as course_code,
        c.id as course_id
      FROM students s
      LEFT JOIN courses c ON s.course_id = c.id
      WHERE COALESCE(s.is_cr, false) = true
      ORDER BY s.name ASC
    `);
    
    console.log('✅ Class Representatives found:', result.rows.length);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('❌ Error fetching class representatives:', error);
    console.error('Error stack:', error.stack);
    // Return empty array instead of error to prevent frontend crash
    res.json({ 
      success: true, 
      data: [],
      message: 'No class representatives found or database initializing'
    });
  }
});

// Get CRs by course
app.get('/api/class-representatives/by-course/:courseId', async (req, res) => {
  try {
    const { courseId } = req.params;
    
    const result = await pool.query(`
      SELECT 
        s.id,
        s.name,
        s.registration_number,
        s.email,
        s.phone,
        s.academic_year,
        s.current_semester,
        s.year_of_study,
        s.is_cr,
        s.cr_activated_at,
        c.name as course_name,
        c.code as course_code
      FROM students s
      LEFT JOIN courses c ON s.course_id = c.id
      WHERE s.is_cr = true AND s.course_id = $1
      ORDER BY s.year_of_study ASC, s.name ASC
    `, [courseId]);
    
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching CRs by course:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get CR by program (for lecturer portal)
app.get('/api/class-representatives/by-program/:programId', async (req, res) => {
  try {
    const { programId } = req.params;
    
    console.log('=== FETCHING CR FOR PROGRAM ===');
    console.log('Program ID:', programId);
    
    // Get program's course_id
    const programResult = await pool.query('SELECT course_id FROM programs WHERE id = $1', [programId]);
    
    if (programResult.rows.length === 0) {
      console.log('Program not found');
      return res.json({ success: true, data: null });
    }
    
    const courseId = programResult.rows[0].course_id;
    console.log('Course ID:', courseId);
    
    // Find CR for this course (simplified query without year_of_study subquery)
    const crResult = await pool.query(`
      SELECT 
        s.id,
        s.name,
        s.registration_number,
        s.email,
        s.phone,
        s.year_of_study,
        s.is_cr,
        s.cr_activated_at,
        c.name as course_name,
        c.code as course_code
      FROM students s
      LEFT JOIN courses c ON s.course_id = c.id
      WHERE s.course_id = $1 AND s.is_cr = true
      ORDER BY s.cr_activated_at DESC
      LIMIT 1
    `, [courseId]);
    
    if (crResult.rows.length === 0) {
      console.log('No CR found for this program');
      return res.json({ success: true, data: null });
    }
    
    console.log('CR found:', crResult.rows[0].name);
    res.json({ success: true, data: crResult.rows[0] });
  } catch (error) {
    console.error('Error fetching CR by program:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Search students for CR assignment (admin portal)
app.get('/api/students/search-for-cr', async (req, res) => {
  try {
    const { search } = req.query;
    
    if (!search || search.trim().length < 2) {
      return res.json({ success: true, data: [] });
    }
    
    const searchTerm = `%${search.trim()}%`;
    
    const result = await pool.query(`
      SELECT 
        s.id,
        s.name,
        s.registration_number,
        s.email,
        s.phone,
        s.academic_year,
        s.current_semester,
        s.year_of_study,
        s.academic_level,
        s.is_cr,
        c.name as course_name,
        c.code as course_code,
        c.id as course_id
      FROM students s
      LEFT JOIN courses c ON s.course_id = c.id
      WHERE (
        s.name ILIKE $1 
        OR s.registration_number ILIKE $1
      )
      AND s.is_active = true
      ORDER BY s.name ASC
      LIMIT 20
    `, [searchTerm]);
    
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error searching students for CR:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Activate student as CR
app.post('/api/class-representatives/activate', async (req, res) => {
  try {
    const { studentId, activatedBy } = req.body;
    
    if (!studentId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Student ID is required' 
      });
    }
    
    // Check if student exists
    const studentCheck = await pool.query(
      'SELECT * FROM students WHERE id = $1',
      [studentId]
    );
    
    if (studentCheck.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Student not found' 
      });
    }
    
    const student = studentCheck.rows[0];
    
    // Check if already a CR
    if (student.is_cr) {
      return res.status(400).json({ 
        success: false, 
        error: 'Student is already a Class Representative' 
      });
    }
    
    // Activate as CR
    const result = await pool.query(`
      UPDATE students 
      SET 
        is_cr = true,
        cr_activated_at = CURRENT_TIMESTAMP,
        cr_activated_by = $2,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `, [studentId, activatedBy || 'Admin']);
    
    console.log(`✅ Student ${student.name} (${student.registration_number}) activated as CR`);
    
    res.json({ 
      success: true, 
      message: `${student.name} has been activated as Class Representative`,
      data: result.rows[0] 
    });
  } catch (error) {
    console.error('Error activating CR:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Deactivate CR
app.post('/api/class-representatives/deactivate', async (req, res) => {
  try {
    const { studentId } = req.body;
    
    if (!studentId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Student ID is required' 
      });
    }
    
    // Check if student exists and is a CR
    const studentCheck = await pool.query(
      'SELECT * FROM students WHERE id = $1',
      [studentId]
    );
    
    if (studentCheck.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Student not found' 
      });
    }
    
    const student = studentCheck.rows[0];
    
    if (!student.is_cr) {
      return res.status(400).json({ 
        success: false, 
        error: 'Student is not a Class Representative' 
      });
    }
    
    // Deactivate CR
    const result = await pool.query(`
      UPDATE students 
      SET 
        is_cr = false,
        cr_activated_at = NULL,
        cr_activated_by = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `, [studentId]);
    
    console.log(`✅ CR status removed from ${student.name} (${student.registration_number})`);
    
    res.json({ 
      success: true, 
      message: `CR status removed from ${student.name}`,
      data: result.rows[0] 
    });
  } catch (error) {
    console.error('Error deactivating CR:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Check if student is CR (for discussion validation)
app.get('/api/students/:id/is-cr', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'SELECT is_cr FROM students WHERE id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Student not found' 
      });
    }
    
    res.json({ 
      success: true, 
      is_cr: result.rows[0].is_cr || false 
    });
  } catch (error) {
    console.error('Error checking CR status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Check if student is CR by username (for discussion validation)
app.get('/api/students/check-cr-by-username', async (req, res) => {
  try {
    const { username } = req.query;
    
    if (!username) {
      return res.status(400).json({ 
        success: false, 
        error: 'Username is required' 
      });
    }
    
    // Search by registration_number OR name OR email to handle all login scenarios
    const result = await pool.query(
      'SELECT id, is_cr, name, registration_number, course_id FROM students WHERE registration_number = $1 OR name = $1 OR email = $1',
      [username]
    );
    
    if (result.rows.length === 0) {
      return res.json({ 
        success: true, 
        is_cr: false,
        message: 'Student not found'
      });
    }
    
    res.json({ 
      success: true, 
      is_cr: result.rows[0].is_cr || false,
      student: result.rows[0]
    });
  } catch (error) {
    console.error('Error checking CR status by username:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== END CR MANAGEMENT ====================


// Course routes
app.post('/api/colleges', async (req, res) => {
  try {
    const { name, shortName, description, established } = req.body;
    const result = await pool.query(
      `INSERT INTO colleges (name, short_name, description, established) 
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, shortName, description, established]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error creating college:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/colleges', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM colleges ORDER BY created_at DESC');
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching colleges:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/departments', async (req, res) => {
  try {
    const { name, collegeId, description, headOfDepartment } = req.body;
    
    // Generate realistic HOD name if not provided
    let hodName = headOfDepartment;
    if (!hodName || hodName.trim() === '') {
      const departmentNames = {
        'computer': 'Dr. John Mwalimu',
        'information': 'Dr. Grace Kimaro',
        'engineering': 'Dr. Peter Moshi',
        'business': 'Dr. Mary Lyimo',
        'education': 'Dr. James Mwanza',
        'science': 'Dr. Sarah Mbwana',
        'arts': 'Dr. Robert Kihiyo',
        'law': 'Dr. Elizabeth Mwakasege',
        'medicine': 'Dr. David Mwangi',
        'agriculture': 'Dr. Joyce Mwenda'
      };
      
      // Find matching department type
      const deptType = Object.keys(departmentNames).find(type => 
        name.toLowerCase().includes(type)
      );
      
      hodName = departmentNames[deptType] || `Dr. ${name.split(' ')[0]} Head`;
    }
    
    const result = await pool.query(
      `INSERT INTO departments (name, college_id, description, head_of_department) 
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, collegeId, description, hodName]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error creating department:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/departments', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM departments ORDER BY created_at DESC');
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching departments:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/courses', async (req, res) => {
  try {
    const { name, code, departmentId, duration, academicLevel, yearOfStudy, description } = req.body;
    console.log('=== BACKEND COURSE CREATION ===');
    console.log('Received data:', req.body);
    
    const result = await pool.query(
      `INSERT INTO courses (name, code, department_id, duration, academic_level, year_of_study, description) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [name, code, departmentId, duration || 4, academicLevel || 'bachelor', yearOfStudy || 1, description]
    );
    
    console.log('Created course:', result.rows[0]);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error creating course:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/courses', async (req, res) => {
  try {
    const { academic_level, year_of_study } = req.query;
    
    let query = 'SELECT * FROM courses';
    let params = [];
    let conditions = [];
    
    // Add filters if provided
    if (academic_level) {
      conditions.push(`academic_level = $${params.length + 1}`);
      params.push(academic_level);
    }
    
    if (year_of_study) {
      conditions.push(`year_of_study = $${params.length + 1}`);
      params.push(parseInt(year_of_study));
    }
    
    // Build final query
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ' ORDER BY created_at DESC';
    
    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching courses:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/programs', async (req, res) => {
  try {
    const { name, courseId, lecturerName, credits, totalSemesters, duration, description, semester } = req.body;
    
    // Find lecturer by name or employee_id
    let lecturerId = null;
    if (lecturerName) {
      const lecturerResult = await pool.query(
        'SELECT id FROM lecturers WHERE name = $1 OR employee_id = $1',
        [lecturerName]
      );
      if (lecturerResult.rows.length > 0) {
        lecturerId = lecturerResult.rows[0].id;
      }
    }
    
    const result = await pool.query(
      `INSERT INTO programs (name, course_id, lecturer_id, credits, total_semesters, duration, lecturer_name, description, semester) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [name, courseId, lecturerId, credits || 0, totalSemesters || 1, duration || 1, lecturerName, description, semester || null]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error creating program:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get programs with proper filtering based on user type
app.get('/api/programs', optionalAuth, async (req, res) => {
  try {
    const { student_id, lecturer_id, user_type, lecturer_username } = req.query;
    const userFromToken = req.user; // From JWT if provided
    
    console.log('=== FETCHING PROGRAMS ===');
    console.log('Query params:', { student_id, lecturer_id, user_type, lecturer_username });
    console.log('User from token:', userFromToken);
    
    // Determine user type from token or query
    const effectiveUserType = userFromToken?.userType || user_type;
    const effectiveUserId = userFromToken?.userId || student_id || lecturer_id;
    
    // For students - only their course programs (regular + short-term)
    if (effectiveUserType === 'student' && effectiveUserId) {
      const studentResult = await pool.query(`
        SELECT s.*, 
               c.name as course_name,
               d.name as department_name,
               col.name as college_name
        FROM students s
        LEFT JOIN courses c ON s.course_id = c.id
        LEFT JOIN departments d ON c.department_id = d.id
        LEFT JOIN colleges col ON d.college_id = col.id
        WHERE s.id = $1
      `, [effectiveUserId]);
      
      if (studentResult.rows.length === 0) {
        console.log('Student not found');
        return res.json({ success: true, data: [] });
      }
      
      const student = studentResult.rows[0];
      
      // Get regular programs for student's course
      const regularProgramsResult = await pool.query(
        'SELECT *, \'regular\' as program_type FROM programs WHERE course_id = $1 ORDER BY created_at DESC',
        [student.course_id]
      );
      
      let allPrograms = regularProgramsResult.rows;
      const regularProgramNames = allPrograms.map(p => p.name);
      
      console.log(`Found ${allPrograms.length} regular programs for student`);
      
      // CRITICAL: Add short-term programs that student is eligible for
      try {
        const shortTermResult = await pool.query(
          'SELECT * FROM short_term_programs WHERE end_date > NOW() ORDER BY created_at DESC'
        );
        
        const eligibleShortTermPrograms = shortTermResult.rows.filter(program => {
          // Check targeting for short-term programs
          if (program.target_type === 'all') return true;
          if (program.target_type === 'college' && program.target_value === student.college_name) return true;
          if (program.target_type === 'department' && program.target_value === student.department_name) return true;
          if (program.target_type === 'course' && program.target_value === student.course_name) return true;
          if (program.target_type === 'year' && String(program.target_value) === String(student.year_of_study)) return true;
          if (program.target_type === 'program' && regularProgramNames.includes(program.target_value)) return true;
          return false;
        });
        
        // Convert short-term programs to same format as regular programs
        const formattedShortTermPrograms = eligibleShortTermPrograms.map(program => ({
          id: `short-${program.id}`,
          name: program.title,
          course_id: student.course_id,
          lecturer_id: program.lecturer_id,
          lecturer_name: program.lecturer_name,
          description: program.description,
          program_type: 'short-term',
          start_date: program.start_date,
          end_date: program.end_date
        }));
        
        allPrograms = [...allPrograms, ...formattedShortTermPrograms];
        console.log(`Added ${formattedShortTermPrograms.length} short-term programs for student`);
      } catch (shortTermError) {
        console.log('Error fetching short-term programs:', shortTermError.message);
      }
      
      return res.json({ success: true, data: allPrograms });
    }
    
    // For lecturers by username - find programs by lecturer username/employee_id
    // Check if request is from Progress Tracker (skip semester filtering)
    const skipSemesterFilter = req.query.skip_semester_filter === 'true';
    
    if (lecturer_username) {
      // First, get active academic period (only if not skipping semester filter)
      let activeSemester = null;
      
      if (!skipSemesterFilter) {
        const activePeriodResult = await pool.query(
          `SELECT * FROM academic_periods WHERE is_active = true ORDER BY created_at DESC LIMIT 1`
        );
        
        if (activePeriodResult.rows.length > 0) {
          activeSemester = activePeriodResult.rows[0].semester;
          console.log('Active semester from database:', activeSemester);
        }
      }
      
      // First, try to find lecturer by direct field matches
      let lecturerResult = await pool.query(
        'SELECT id, employee_id, name FROM lecturers WHERE employee_id = $1 OR email = $1 OR name = $1',
        [lecturer_username]
      );
      
      // If not found, try to find via password_records table using username
      if (lecturerResult.rows.length === 0) {
        console.log('Lecturer not found by direct match, checking password_records...');
        const passwordResult = await pool.query(
          'SELECT user_id FROM password_records WHERE username = $1 AND user_type = $2',
          [lecturer_username, 'lecturer']
        );
        
        if (passwordResult.rows.length > 0) {
          console.log('Found lecturer via password_records, user_id:', passwordResult.rows[0].user_id);
          lecturerResult = await pool.query(
            'SELECT id, employee_id, name FROM lecturers WHERE id = $1',
            [passwordResult.rows[0].user_id]
          );
        }
      }
      
      if (lecturerResult.rows.length === 0) {
        console.log('Lecturer not found by username:', lecturer_username);
        return res.json({ success: true, data: [] });
      }
      
      const lecturer = lecturerResult.rows[0];
      console.log('=== LECTURER DATA FOUND ===');
      console.log('Lecturer ID:', lecturer.id);
      console.log('Lecturer Employee ID:', lecturer.employee_id);
      console.log('Lecturer Name:', lecturer.name);
      console.log('Skip Semester Filter:', skipSemesterFilter);
      console.log('Active Semester Filter:', activeSemester);
      
      // Build query based on whether we're filtering by semester
      let result;
      if (skipSemesterFilter || activeSemester === null) {
        // No semester filtering - return all programs for this lecturer
        result = await pool.query(
          `SELECT * FROM programs 
           WHERE (lecturer_id = $1 
              OR lecturer_name = $2 
              OR lecturer_name = $3
              OR lecturer_name ILIKE $4
              OR lecturer_name ILIKE $5)
           ORDER BY created_at DESC`,
          [lecturer.id, lecturer.employee_id, lecturer.name, `%${lecturer.employee_id}%`, `%${lecturer.name}%`]
        );
        console.log(`Found ${result.rows.length} programs for lecturer username: ${lecturer_username} (no semester filter)`);
      } else {
        // Filter by active semester
        result = await pool.query(
          `SELECT * FROM programs 
           WHERE (lecturer_id = $1 
              OR lecturer_name = $2 
              OR lecturer_name = $3
              OR lecturer_name ILIKE $4
              OR lecturer_name ILIKE $5)
           AND (semester = $6 OR semester IS NULL)
           ORDER BY created_at DESC`,
          [lecturer.id, lecturer.employee_id, lecturer.name, `%${lecturer.employee_id}%`, `%${lecturer.name}%`, activeSemester]
        );
        console.log(`Found ${result.rows.length} programs for lecturer username: ${lecturer_username} in semester ${activeSemester}`);
      }
      
      return res.json({ success: true, data: result.rows });
    }
    
    // For lecturers - only their programs
    if (effectiveUserType === 'lecturer' && effectiveUserId) {
      const lecturerResult = await pool.query(
        'SELECT employee_id, name FROM lecturers WHERE id = $1',
        [effectiveUserId]
      );
      
      if (lecturerResult.rows.length === 0) {
        console.log('Lecturer not found');
        return res.json({ success: true, data: [] });
      }
      
      const lecturer = lecturerResult.rows[0];
      // More flexible query using ILIKE for partial matching
      const result = await pool.query(
        `SELECT * FROM programs 
         WHERE lecturer_id = $1 
            OR lecturer_name = $2 
            OR lecturer_name = $3
            OR lecturer_name ILIKE $4
            OR lecturer_name ILIKE $5
         ORDER BY created_at DESC`,
        [effectiveUserId, lecturer.employee_id, lecturer.name, `%${lecturer.employee_id}%`, `%${lecturer.name}%`]
      );
      console.log(`Found ${result.rows.length} programs for lecturer`);
      return res.json({ success: true, data: result.rows });
    }
    
    // For admin - all programs
    if (effectiveUserType === 'admin') {
      const result = await pool.query('SELECT * FROM programs ORDER BY created_at DESC');
      console.log(`Found ${result.rows.length} programs (admin view)`);
      return res.json({ success: true, data: result.rows });
    }
    
    // No user type specified but user_type=admin in query - return all programs
    if (user_type === 'admin') {
      const result = await pool.query('SELECT * FROM programs ORDER BY created_at DESC');
      console.log(`Found ${result.rows.length} programs (admin query param)`);
      return res.json({ success: true, data: result.rows });
    }
    
    // No user info - return empty for security
    console.log('No valid user info - returning empty');
    res.json({ success: true, data: [] });
  } catch (error) {
    console.error('Error fetching programs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Authentication route with JWT
app.post('/api/auth', loginLimiter, async (req, res) => {
  try {
    const { username, password, userType } = req.body;
    
    console.log('=== LOGIN ATTEMPT ===');
    console.log('Username:', username);
    console.log('User Type:', userType);
    
    const result = await pool.query(
      'SELECT * FROM password_records WHERE username = $1 AND password_hash = $2 AND user_type = $3',
      [username, password, userType]
    );
    
    if (result.rows.length > 0) {
      const passwordRecord = result.rows[0];
      
      // Check if user account is locked in the main user table
      let userIsLocked = false;
      
      if (userType === 'student') {
        const studentResult = await pool.query('SELECT is_locked FROM students WHERE id = $1', [passwordRecord.user_id]);
        if (studentResult.rows.length > 0 && studentResult.rows[0].is_locked === true) {
          userIsLocked = true;
        }
      } else if (userType === 'lecturer') {
        const lecturerResult = await pool.query('SELECT is_locked FROM lecturers WHERE id = $1', [passwordRecord.user_id]);
        if (lecturerResult.rows.length > 0 && lecturerResult.rows[0].is_locked === true) {
          userIsLocked = true;
        }
      }
      
      // Block login if account is locked
      if (userIsLocked) {
        console.log('❌ Login attempt on locked account:', username);
        return res.status(403).json({ 
          success: false, 
          error: 'Account is locked. Please contact IT administrator to unlock your account.',
          isLocked: true
        });
      }
      
      // Generate JWT access token
      const accessToken = jwt.sign(
        { 
          userId: passwordRecord.user_id, 
          userType: passwordRecord.user_type, 
          username: passwordRecord.username 
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );
      
      // Generate refresh token
      const refreshToken = jwt.sign(
        { 
          userId: passwordRecord.user_id, 
          userType: passwordRecord.user_type 
        },
        JWT_SECRET,
        { expiresIn: JWT_REFRESH_EXPIRES_IN }
      );
      
      // Track active session
      activeSessions.set(passwordRecord.user_id, {
        userType: passwordRecord.user_type,
        username: passwordRecord.username,
        loginTime: new Date(),
        refreshToken
      });
      
      console.log('✅ Login successful for:', username);
      
      // Return user data without password + tokens
      res.json({ 
        success: true, 
        data: {
          userId: passwordRecord.user_id,
          username: passwordRecord.username,
          userType: passwordRecord.user_type
        },
        accessToken,
        refreshToken,
        expiresIn: JWT_EXPIRES_IN
      });
    } else {
      console.log('❌ Invalid credentials for:', username);
      res.status(401).json({ success: false, error: 'Invalid credentials' });
    }
  } catch (error) {
    console.error('Error authenticating user:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Token refresh endpoint
app.post('/api/auth/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(401).json({ success: false, error: 'Refresh token required' });
    }
    
    try {
      const decoded = jwt.verify(refreshToken, JWT_SECRET);
      
      // Check if session exists
      const session = activeSessions.get(decoded.userId);
      if (!session || session.refreshToken !== refreshToken) {
        return res.status(401).json({ success: false, error: 'Invalid refresh token' });
      }
      
      // Generate new access token
      const accessToken = jwt.sign(
        { 
          userId: decoded.userId, 
          userType: decoded.userType, 
          username: session.username 
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );
      
      res.json({ 
        success: true, 
        accessToken,
        expiresIn: JWT_EXPIRES_IN
      });
    } catch (error) {
      return res.status(401).json({ success: false, error: 'Invalid or expired refresh token' });
    }
  } catch (error) {
    console.error('Error refreshing token:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Session validation endpoint
app.post('/api/validate-session', async (req, res) => {
  try {
    const { userId, userType } = req.body;
    
    // Check if session exists
    if (activeSessions.has(parseInt(userId))) {
      const session = activeSessions.get(parseInt(userId));
      if (session.userType === userType) {
        res.json({ success: true, valid: true });
      } else {
        res.json({ success: true, valid: false, reason: 'User type mismatch' });
      }
    } else {
      res.json({ success: true, valid: false, reason: 'Session not found or user deleted' });
    }
  } catch (error) {
    console.error('Error validating session:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Logout endpoint
app.post('/api/logout', async (req, res) => {
  try {
    const { userId } = req.body;
    
    // Remove session
    activeSessions.delete(parseInt(userId));
    
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('Error logging out:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET INDIVIDUAL ENDPOINTS FOR COURSE MANAGEMENT
// Get individual college by ID
app.get('/api/colleges/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM colleges WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'College not found' });
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error fetching college:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE ENDPOINTS FOR COURSE MANAGEMENT
app.delete('/api/colleges/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Delete in correct order to avoid foreign key constraints
    await pool.query('DELETE FROM students WHERE course_id IN (SELECT id FROM courses WHERE department_id IN (SELECT id FROM departments WHERE college_id = $1))', [id]);
    await pool.query('DELETE FROM programs WHERE course_id IN (SELECT id FROM courses WHERE department_id IN (SELECT id FROM departments WHERE college_id = $1))', [id]);
    await pool.query('DELETE FROM courses WHERE department_id IN (SELECT id FROM departments WHERE college_id = $1)', [id]);
    await pool.query('DELETE FROM departments WHERE college_id = $1', [id]);
    const result = await pool.query('DELETE FROM colleges WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'College not found' });
    }
    res.json({ success: true, message: 'College deleted successfully' });
  } catch (error) {
    console.error('Error deleting college:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get individual department by ID
app.get('/api/departments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM departments WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Department not found' });
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error fetching department:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/departments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Delete in correct order to avoid foreign key constraints
    await pool.query('DELETE FROM students WHERE course_id IN (SELECT id FROM courses WHERE department_id = $1)', [id]);
    await pool.query('DELETE FROM programs WHERE course_id IN (SELECT id FROM courses WHERE department_id = $1)', [id]);
    await pool.query('DELETE FROM courses WHERE department_id = $1', [id]);
    const result = await pool.query('DELETE FROM departments WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Department not found' });
    }
    res.json({ success: true, message: 'Department deleted successfully' });
  } catch (error) {
    console.error('Error deleting department:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get individual course by ID
app.get('/api/courses/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM courses WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Course not found' });
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error fetching course:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/courses/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Delete in correct order to avoid foreign key constraints
    await pool.query('DELETE FROM students WHERE course_id = $1', [id]);
    await pool.query('DELETE FROM programs WHERE course_id = $1', [id]);
    const result = await pool.query('DELETE FROM courses WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Course not found' });
    }
    res.json({ success: true, message: 'Course deleted successfully' });
  } catch (error) {
    console.error('Error deleting course:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/programs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM programs WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Program not found' });
    }
    res.json({ success: true, message: 'Program deleted successfully' });
  } catch (error) {
    console.error('Error deleting program:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// UPDATE ENDPOINTS FOR COURSE MANAGEMENT
app.put('/api/colleges/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, shortName, established, description } = req.body;
    const result = await pool.query(
      'UPDATE colleges SET name = $1, short_name = $2, established = $3, description = $4 WHERE id = $5 RETURNING *',
      [name, shortName, established, description, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'College not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error updating college:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/departments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, collegeId, headOfDepartment, description } = req.body;
    const result = await pool.query(
      'UPDATE departments SET name = $1, college_id = $2, head_of_department = $3, description = $4 WHERE id = $5 RETURNING *',
      [name, collegeId, headOfDepartment, description, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Department not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error updating department:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/courses/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, departmentId, duration, academicLevel, yearOfStudy, description } = req.body;
    console.log('=== BACKEND COURSE UPDATE ===');
    console.log('Updating course ID:', id);
    console.log('Update data:', req.body);
    
    const result = await pool.query(
      'UPDATE courses SET name = $1, code = $2, department_id = $3, duration = $4, academic_level = $5, year_of_study = $6, description = $7 WHERE id = $8 RETURNING *',
      [name, code, departmentId, duration, academicLevel, yearOfStudy || 1, description, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Course not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error updating course:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/programs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, courseId, lecturerName, credits, totalSemesters, duration, description, semester } = req.body;
    
    // Find lecturer by name or employee_id
    let lecturerId = null;
    if (lecturerName) {
      const lecturerResult = await pool.query(
        'SELECT id FROM lecturers WHERE name = $1 OR employee_id = $1',
        [lecturerName]
      );
      if (lecturerResult.rows.length > 0) {
        lecturerId = lecturerResult.rows[0].id;
      }
    }
    
    const result = await pool.query(
      'UPDATE programs SET name = $1, course_id = $2, lecturer_id = $3, credits = $4, total_semesters = $5, duration = $6, lecturer_name = $7, description = $8, semester = $9 WHERE id = $10 RETURNING *',
      [name, courseId, lecturerId, credits, totalSemesters, duration, lecturerName, description, semester || null, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Program not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error updating program:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// CONTENT MANAGEMENT ENDPOINTS

// Create content table if not exists
app.post('/api/content/init', async (req, res) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS content (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        program_name VARCHAR(255) NOT NULL,
        content_type VARCHAR(50) NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        file_size VARCHAR(50),
        file_url TEXT,
        lecturer_id INTEGER,
        lecturer_name VARCHAR(255),
        upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(50) DEFAULT 'published'
      )
    `);
    console.log('Content table initialized successfully');
    res.json({ success: true, message: 'Content table initialized' });
  } catch (error) {
    console.error('Error initializing content table:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Test endpoint to check content table
app.get('/api/content/test', async (req, res) => {
  try {
    // Check if table exists
    const tableExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'content'
      );
    `);
    
    // Get table structure
    const tableStructure = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'content'
      ORDER BY ordinal_position;
    `);
    
    // Get content count
    const contentCount = await pool.query('SELECT COUNT(*) FROM content');
    
    res.json({ 
      success: true, 
      tableExists: tableExists.rows[0].exists,
      tableStructure: tableStructure.rows,
      contentCount: contentCount.rows[0].count
    });
  } catch (error) {
    console.error('Error testing content table:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Upload content endpoint with actual file - STORES IN DATABASE
app.post('/api/content/upload', upload.single('file'), async (req, res) => {
  try {
    const { title, description, program, type, lecturer_id, lecturer_name, file_size } = req.body;
    const uploadedFile = req.file;
    
    console.log('=== BACKEND UPLOAD DEBUG (DATABASE STORAGE) ===');
    console.log('Received data:', req.body);
    console.log('Uploaded file:', uploadedFile ? { 
      originalname: uploadedFile.originalname,
      mimetype: uploadedFile.mimetype,
      size: uploadedFile.size 
    } : 'No file');
    
    if (!uploadedFile) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }
    
    // Generate unique filename
    const uniqueFilename = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(uploadedFile.originalname);
    
    // Store file in database
    const fileResult = await pool.query(
      'INSERT INTO file_storage (file_name, original_name, file_data, file_mimetype, file_size, uploaded_by_id, uploaded_by_type) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, file_name',
      [uniqueFilename, uploadedFile.originalname, uploadedFile.buffer, uploadedFile.mimetype, uploadedFile.size, lecturer_id, 'lecturer']
    );
    
    // File URL points to our database-backed endpoint
    const fileUrl = `/content/${uniqueFilename}`;
    
    // Store content metadata
    const result = await pool.query(
      'INSERT INTO content (title, description, program_name, content_type, file_name, file_size, file_url, file_mimetype, lecturer_id, lecturer_name) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *',
      [title, description, program, type, uniqueFilename, file_size || uploadedFile.size, fileUrl, uploadedFile.mimetype, lecturer_id, lecturer_name]
    );
    
    console.log('✅ File saved to database with ID:', fileResult.rows[0].id);
    console.log('✅ Content saved to database:', result.rows[0]);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error uploading content:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all content with student-specific program filtering
app.get('/api/content', async (req, res) => {
  try {
    const { student_id, student_username } = req.query;
    
    console.log('=== FETCHING CONTENT ===');
    console.log('Student ID:', student_id);
    console.log('Student Username:', student_username);
    
    // If no student info provided, return all content (for admin/lecturer view)
    if (!student_id && !student_username) {
      const result = await pool.query('SELECT * FROM content ORDER BY upload_date DESC');
      console.log('Content found (no filter):', result.rows.length);
      return res.json({ success: true, data: result.rows });
    }
    
    // Get student information
    let studentInfo = null;
    if (student_id) {
      const studentResult = await pool.query(`
        SELECT s.*, c.name as course_name
        FROM students s
        LEFT JOIN courses c ON s.course_id = c.id
        WHERE s.id = $1
      `, [student_id]);
      
      if (studentResult.rows.length > 0) {
        studentInfo = studentResult.rows[0];
      }
    } else if (student_username) {
      const studentResult = await pool.query(`
        SELECT s.*, c.name as course_name
        FROM students s
        LEFT JOIN courses c ON s.course_id = c.id
        WHERE s.registration_number = $1 OR s.email = $1 OR s.name = $1
      `, [student_username]);
      
      if (studentResult.rows.length > 0) {
        studentInfo = studentResult.rows[0];
      }
    }
    
    if (!studentInfo) {
      console.log('Student not found, returning empty array');
      return res.json({ success: true, data: [] });
    }
    
    console.log('Student Info:', studentInfo);
    
    // Get student's regular programs
    const programsResult = await pool.query(
      'SELECT name FROM programs WHERE course_id = $1',
      [studentInfo.course_id]
    );
    let studentPrograms = programsResult.rows.map(p => p.name);
    
    console.log('Student Regular Programs:', studentPrograms);
    
    // CRITICAL: Add short-term programs that student is eligible for
    try {
      // FIXED: Remove end_date filter to match live-classes endpoint behavior
      const shortTermResult = await pool.query(
        'SELECT * FROM short_term_programs ORDER BY created_at DESC'
      );
      
      const eligibleShortTermPrograms = shortTermResult.rows.filter(program => {
        // Check targeting for short-term programs
        // CRITICAL: If target_type is null, undefined, or 'all', ALL students should see it
        if (!program.target_type || program.target_type === 'all' || program.target_type === '') {
          console.log(`✅ Short-term program "${program.title}" - All students (target_type: ${program.target_type})`);
          return true;
        }
        if (program.target_type === 'college' && program.target_value === studentInfo.college_name) return true;
        if (program.target_type === 'department' && program.target_value === studentInfo.department_name) return true;
        if (program.target_type === 'course' && program.target_value === studentInfo.course_name) return true;
        if (program.target_type === 'year' && program.target_value === studentInfo.year_of_study) return true;
        if (program.target_type === 'program' && studentPrograms.includes(program.target_value)) return true;
        return false;
      });
      
      // Add short-term program titles to student programs list
      const shortTermProgramNames = eligibleShortTermPrograms.map(p => p.title);
      studentPrograms = [...studentPrograms, ...shortTermProgramNames];
      console.log('✅ Added short-term programs to content filtering:', shortTermProgramNames);
      console.log('   Total programs (Regular + Short-Term):', studentPrograms.length);
    } catch (error) {
      console.log('⚠️ No short-term programs or error:', error.message);
    }
    
    console.log('Student All Programs for Content:', studentPrograms);
    
    // Fetch all content
    const contentResult = await pool.query('SELECT * FROM content ORDER BY upload_date DESC');
    
    // Filter content based on student's programs
    const filteredContent = contentResult.rows.filter(content => {
      // Check if content program matches any of student's programs
      const programMatch = studentPrograms.some(program => {
        if (!program || !content.program_name) return false;
        
        const programLower = program.toLowerCase().trim();
        const contentProgramLower = content.program_name.toLowerCase().trim();
        
        // Exact match
        if (programLower === contentProgramLower) {
          console.log(`✅ Content "${content.title}" - Exact program match: ${content.program_name}`);
          return true;
        }
        
        // Contains match
        if (programLower.includes(contentProgramLower) || contentProgramLower.includes(programLower)) {
          console.log(`✅ Content "${content.title}" - Partial program match: ${content.program_name}`);
          return true;
        }
        
        // Word-based matching
        const programWords = programLower.split(/\s+/);
        const contentWords = contentProgramLower.split(/\s+/);
        const commonWords = programWords.filter(word => 
          word.length > 3 && contentWords.includes(word)
        );
        
        if (commonWords.length >= 2) {
          console.log(`✅ Content "${content.title}" - Word match: ${content.program_name}`);
          return true;
        }
        
        return false;
      });
      
      if (!programMatch) {
        console.log(`❌ Content "${content.title}" - No program match: ${content.program_name}`);
      }
      
      return programMatch;
    });
    
    console.log(`Filtered ${filteredContent.length} content items for student`);
    res.json({ success: true, data: filteredContent });
  } catch (error) {
    console.error('Error fetching content:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get content by lecturer
app.get('/api/content/lecturer/:lecturerId', async (req, res) => {
  try {
    const { lecturerId } = req.params;
    const result = await pool.query('SELECT * FROM content WHERE lecturer_id = $1 ORDER BY upload_date DESC', [lecturerId]);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching lecturer content:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get content for specific student based on their program
app.get('/api/content/student/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    console.log(`=== FETCHING CONTENT FOR STUDENT ${studentId} ===`);
    
    // First get student's program information
    const studentResult = await pool.query('SELECT * FROM students WHERE id = $1', [studentId]);
    if (studentResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }
    
    const student = studentResult.rows[0];
    console.log('Student info:', student);
    
    // Get programs for this student's course
    const programsResult = await pool.query('SELECT * FROM programs WHERE course_id = $1', [student.course_id]);
    console.log('Student programs:', programsResult.rows);
    
    if (programsResult.rows.length === 0) {
      return res.json({ success: true, data: [] });
    }
    
    // Get content for student's programs, excluding deleted ones
    const programNames = programsResult.rows.map(p => p.name);
    const placeholders = programNames.map((_, index) => `$${index + 1}`).join(',');
    
    const contentResult = await pool.query(
      `SELECT c.* FROM content c 
       LEFT JOIN student_content_deletions scd ON c.id = scd.content_id AND scd.student_id = $${programNames.length + 1}
       WHERE c.program_name IN (${placeholders}) AND scd.id IS NULL 
       ORDER BY c.upload_date DESC`,
      [...programNames, studentId]
    );
    
    console.log(`Content found for student ${studentId}:`, contentResult.rows.length);
    res.json({ success: true, data: contentResult.rows });
  } catch (error) {
    console.error('Error fetching student content:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create student_content_deletions table for tracking individual deletions
app.post('/api/content/init-deletions', async (req, res) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS student_content_deletions (
        id SERIAL PRIMARY KEY,
        student_id INTEGER NOT NULL,
        content_id INTEGER NOT NULL,
        deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(student_id, content_id)
      )
    `);
    console.log('Student content deletions table initialized');
    res.json({ success: true, message: 'Deletions table initialized' });
  } catch (error) {
    console.error('Error initializing deletions table:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Student delete content (only for themselves)
app.delete('/api/content/:contentId/student/:studentId', async (req, res) => {
  try {
    const { contentId, studentId } = req.params;
    console.log(`=== STUDENT ${studentId} DELETING CONTENT ${contentId} ===`);
    
    // Add to deletions table (content remains for other students)
    await pool.query(
      'INSERT INTO student_content_deletions (student_id, content_id) VALUES ($1, $2) ON CONFLICT (student_id, content_id) DO NOTHING',
      [studentId, contentId]
    );
    
    console.log(`Content ${contentId} marked as deleted for student ${studentId}`);
    res.json({ success: true, message: 'Content deleted for student' });
  } catch (error) {
    console.error('Error deleting content for student:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete content (admin/lecturer only - removes completely)
app.delete('/api/content/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM content WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Content not found' });
    }
    res.json({ success: true, message: 'Content deleted successfully' });
  } catch (error) {
    console.error('Error deleting content:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ASSIGNMENTS ENDPOINTS
// Create assignments table if not exists
app.post('/api/assignments/init', async (req, res) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS assignments (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        program_name VARCHAR(255) NOT NULL,
        lecturer_id INTEGER,
        lecturer_name VARCHAR(255),
        due_date DATE,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    res.json({ success: true, message: 'Assignments table initialized' });
  } catch (error) {
    console.error('Error initializing assignments table:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all assignments with student-specific program filtering
app.get('/api/assignments', async (req, res) => {
  try {
    const { student_id, student_username } = req.query;
    
    console.log('=== FETCHING ASSIGNMENTS ===');
    console.log('Student ID:', student_id);
    console.log('Student Username:', student_username);
    
    // If no student info provided, return all assignments (for admin/lecturer view)
    if (!student_id && !student_username) {
      const result = await pool.query('SELECT * FROM assignments ORDER BY created_at DESC');
      console.log('Assignments found (no filter):', result.rows.length);
      return res.json({ success: true, data: result.rows });
    }
    
    // Get student information with college and department
    let studentInfo = null;
    if (student_id) {
      const studentResult = await pool.query(`
        SELECT s.*, 
               c.name as course_name,
               d.name as department_name,
               col.name as college_name
        FROM students s
        LEFT JOIN courses c ON s.course_id = c.id
        LEFT JOIN departments d ON c.department_id = d.id
        LEFT JOIN colleges col ON d.college_id = col.id
        WHERE s.id = $1
      `, [student_id]);
      
      if (studentResult.rows.length > 0) {
        studentInfo = studentResult.rows[0];
      }
    } else if (student_username) {
      const studentResult = await pool.query(`
        SELECT s.*, 
               c.name as course_name,
               d.name as department_name,
               col.name as college_name
        FROM students s
        LEFT JOIN courses c ON s.course_id = c.id
        LEFT JOIN departments d ON c.department_id = d.id
        LEFT JOIN colleges col ON d.college_id = col.id
        WHERE s.registration_number = $1 OR s.email = $1 OR s.name = $1 OR LOWER(s.registration_number) = LOWER($1)
      `, [student_username]);
      
      if (studentResult.rows.length > 0) {
        studentInfo = studentResult.rows[0];
      }
    }
    
    if (!studentInfo) {
      console.log('❌ Student not found, returning empty array');
      return res.json({ success: true, data: [] });
    }
    
    console.log('✅ Student Info Found:', {
      id: studentInfo.id,
      name: studentInfo.name,
      course_id: studentInfo.course_id,
      course_name: studentInfo.course_name,
      department_name: studentInfo.department_name,
      college_name: studentInfo.college_name
    });
    
    // FIXED: If student has course_id but no department_name/college_name, try direct lookup
    if (studentInfo.course_id && (!studentInfo.department_name || !studentInfo.college_name)) {
      console.log('⚠️ Student missing department/college info, attempting direct lookup...');
      try {
        const courseInfoResult = await pool.query(`
          SELECT c.name as course_name, 
                 d.name as department_name,
                 col.name as college_name
          FROM courses c
          LEFT JOIN departments d ON c.department_id = d.id
          LEFT JOIN colleges col ON d.college_id = col.id
          WHERE c.id = $1
        `, [studentInfo.course_id]);
        
        if (courseInfoResult.rows.length > 0) {
          const courseInfo = courseInfoResult.rows[0];
          if (!studentInfo.course_name && courseInfo.course_name) studentInfo.course_name = courseInfo.course_name;
          if (!studentInfo.department_name && courseInfo.department_name) studentInfo.department_name = courseInfo.department_name;
          if (!studentInfo.college_name && courseInfo.college_name) studentInfo.college_name = courseInfo.college_name;
          console.log('   ✅ Found via direct lookup - dept:', studentInfo.department_name, ', college:', studentInfo.college_name);
        }
      } catch (lookupErr) {
        console.log('Direct lookup failed:', lookupErr.message);
      }
    }
    
    // Get student's REGULAR programs ONLY (not short-term)
    const programsResult = await pool.query(
      'SELECT id, name FROM programs WHERE course_id = $1',
      [studentInfo.course_id]
    );
    const studentRegularPrograms = programsResult.rows;
    const studentRegularProgramIds = studentRegularPrograms.map(p => p.id);
    const studentRegularProgramNames = studentRegularPrograms.map(p => p.name);
    
    console.log('✅ Student Regular Programs:', studentRegularProgramNames);
    
    // Get ALL short-term programs for filtering
    let shortTermResult = { rows: [] };
    let eligibleShortTermProgramNames = [];
    let enrolledShortTermPrograms = [];
    
    try {
      shortTermResult = await pool.query('SELECT * FROM short_term_programs ORDER BY created_at DESC');
      console.log('Total Short-Term Programs in DB:', shortTermResult.rows.length);
      
      // Check if student is enrolled in any short-term programs
      try {
        const enrollmentResult = await pool.query(
          `SELECT stp.title FROM short_term_enrollments ste
           JOIN short_term_programs stp ON ste.program_id = stp.id
           WHERE ste.student_id = $1`,
          [studentInfo.id]
        );
        enrolledShortTermPrograms = enrollmentResult.rows.map(r => r.title);
        console.log('Enrolled Short-Term Programs:', enrolledShortTermPrograms);
      } catch (enrollError) {
        console.log('No short_term_enrollments table:', enrollError.message);
      }
      
      // Filter short-term programs based on targeting (like live-classes endpoint)
      const eligibleShortTermPrograms = shortTermResult.rows.filter(program => {
        console.log(`\n--- Checking Short-Term Program: "${program.title}" ---`);
        console.log('   Target Type:', program.target_type);
        console.log('   Target Value:', program.target_value);
        
        // Check if student is directly enrolled
        if (enrolledShortTermPrograms.includes(program.title)) {
          console.log('   ✅ MATCH: Student directly enrolled');
          return true;
        }
        
        // All students targeting
        if (!program.target_type || program.target_type === 'all' || program.target_type === '' || program.target_type === null) {
          console.log('   ✅ MATCH: All students (target_type:', program.target_type, ')');
          return true;
        }
        
        // College targeting - with partial match
        if (program.target_type === 'college') {
          if (studentInfo.college_name && (
            program.target_value === studentInfo.college_name ||
            program.target_value?.toLowerCase() === studentInfo.college_name?.toLowerCase() ||
            studentInfo.college_name.toLowerCase().includes(program.target_value?.toLowerCase()) ||
            program.target_value?.toLowerCase().includes(studentInfo.college_name?.toLowerCase())
          )) {
            console.log('   ✅ MATCH: College targeting');
            return true;
          }
        }
        
        // Department targeting - with partial match
        if (program.target_type === 'department') {
          if (studentInfo.department_name && (
            program.target_value === studentInfo.department_name ||
            program.target_value?.toLowerCase() === studentInfo.department_name?.toLowerCase() ||
            studentInfo.department_name.toLowerCase().includes(program.target_value?.toLowerCase()) ||
            program.target_value?.toLowerCase().includes(studentInfo.department_name?.toLowerCase())
          )) {
            console.log('   ✅ MATCH: Department targeting');
            return true;
          }
        }
        
        // Course targeting - with partial match
        if (program.target_type === 'course') {
          if (studentInfo.course_name && (
            program.target_value === studentInfo.course_name ||
            program.target_value?.toLowerCase() === studentInfo.course_name?.toLowerCase() ||
            studentInfo.course_name.toLowerCase().includes(program.target_value?.toLowerCase()) ||
            program.target_value?.toLowerCase().includes(studentInfo.course_name?.toLowerCase())
          )) {
            console.log('   ✅ MATCH: Course targeting');
            return true;
          }
        }
        
        // Year targeting
        if (program.target_type === 'year') {
          if (String(program.target_value) === String(studentInfo.year_of_study)) {
            console.log('   ✅ MATCH: Year targeting');
            return true;
          }
        }
        
        // Program targeting - match by course name or regular programs
        if (program.target_type === 'program') {
          // Check course name
          if (studentInfo.course_name && (
            program.target_value === studentInfo.course_name ||
            program.target_value?.toLowerCase() === studentInfo.course_name?.toLowerCase() ||
            studentInfo.course_name.toLowerCase().includes(program.target_value?.toLowerCase()) ||
            program.target_value?.toLowerCase().includes(studentInfo.course_name?.toLowerCase())
          )) {
            console.log('   ✅ MATCH: Program targeting (course name)');
            return true;
          }
          // Check regular programs
          const programMatch = studentRegularProgramNames.some(p => 
            p === program.target_value ||
            p?.toLowerCase().includes(program.target_value?.toLowerCase()) ||
            program.target_value?.toLowerCase().includes(p?.toLowerCase())
          );
          if (programMatch) {
            console.log('   ✅ MATCH: Program targeting (regular program)');
            return true;
          }
        }
        
        console.log('   ❌ NO MATCH');
        return false;
      });
      
      eligibleShortTermProgramNames = eligibleShortTermPrograms.map(p => p.title);
      console.log('✅ Eligible Short-Term Programs:', eligibleShortTermProgramNames);
    } catch (error) {
      console.log('⚠️ No short-term programs table or error:', error.message);
    }
    
    // Combine all student program names (regular + short-term)
    const allStudentProgramNames = [...new Set([...studentRegularProgramNames, ...eligibleShortTermProgramNames, ...enrolledShortTermPrograms])];
    console.log('All Student Programs (Names):', allStudentProgramNames);
    
    // Fetch ALL assignments
    const allAssignmentsResult = await pool.query('SELECT * FROM assignments ORDER BY created_at DESC');
    console.log('Total Assignments in DB:', allAssignmentsResult.rows.length);
    
    // Filter assignments using NAME-BASED matching (like live-classes endpoint)
    // This avoids the ID collision problem between regular and short-term programs
    const filteredAssignments = allAssignmentsResult.rows.filter(assignment => {
      const assignmentProgramLower = assignment.program_name?.toLowerCase().trim() || '';
      
      // Method 1: Direct program name match
      const directMatch = allStudentProgramNames.some(program => {
        if (!program) return false;
        const programLower = program.toLowerCase().trim();
        
        // Exact match
        if (programLower === assignmentProgramLower) return true;
        
        // Contains match (either direction)
        if (programLower.includes(assignmentProgramLower) || assignmentProgramLower.includes(programLower)) return true;
        
        // Word-based matching for multi-word titles
        const programWords = programLower.split(/\s+/).filter(w => w.length > 2);
        const assignmentWords = assignmentProgramLower.split(/\s+/).filter(w => w.length > 2);
        const commonWords = programWords.filter(word => assignmentWords.includes(word));
        if (commonWords.length >= 1 && commonWords.length >= Math.min(programWords.length, assignmentWords.length) * 0.5) return true;
        
        return false;
      });
      
      if (directMatch) {
        console.log(`✅ Assignment "${assignment.title}" - Direct program match: ${assignment.program_name}`);
        return true;
      }
      
      // Method 2: Check if assignment is for a short-term program and student qualifies via targeting
      const shortTermProgram = shortTermResult.rows.find(stp => {
        const stpTitleLower = stp.title?.toLowerCase().trim() || '';
        
        // Exact match
        if (stpTitleLower === assignmentProgramLower) return true;
        
        // Contains match
        if (stpTitleLower.includes(assignmentProgramLower) || assignmentProgramLower.includes(stpTitleLower)) return true;
        
        // Word-based matching
        const stpWords = stpTitleLower.split(/\s+/).filter(w => w.length > 2);
        const assignmentWords = assignmentProgramLower.split(/\s+/).filter(w => w.length > 2);
        const commonWords = stpWords.filter(word => assignmentWords.includes(word));
        if (commonWords.length >= 1 && commonWords.length >= Math.min(stpWords.length, assignmentWords.length) * 0.5) return true;
        
        return false;
      });
      
      if (shortTermProgram) {
        console.log(`\n--- Checking Short-Term Assignment: "${assignment.title}" for program "${shortTermProgram.title}" ---`);
        
        // Check if student qualifies for this short-term program
        let qualifies = false;
        
        // All students targeting
        if (!shortTermProgram.target_type || shortTermProgram.target_type === 'all' || shortTermProgram.target_type === '' || shortTermProgram.target_type === null) {
          console.log('   ✅ Short-term program targets ALL students');
          qualifies = true;
        }
        // Direct enrollment
        else if (enrolledShortTermPrograms.includes(shortTermProgram.title)) {
          console.log('   ✅ Student directly enrolled');
          qualifies = true;
        }
        // College targeting
        else if (shortTermProgram.target_type === 'college') {
          if (studentInfo.college_name && (
            shortTermProgram.target_value === studentInfo.college_name ||
            shortTermProgram.target_value?.toLowerCase() === studentInfo.college_name?.toLowerCase() ||
            studentInfo.college_name.toLowerCase().includes(shortTermProgram.target_value?.toLowerCase()) ||
            shortTermProgram.target_value?.toLowerCase().includes(studentInfo.college_name?.toLowerCase())
          )) {
            console.log('   ✅ Student college matches');
            qualifies = true;
          }
        }
        // Department targeting
        else if (shortTermProgram.target_type === 'department') {
          if (studentInfo.department_name && (
            shortTermProgram.target_value === studentInfo.department_name ||
            shortTermProgram.target_value?.toLowerCase() === studentInfo.department_name?.toLowerCase() ||
            studentInfo.department_name.toLowerCase().includes(shortTermProgram.target_value?.toLowerCase()) ||
            shortTermProgram.target_value?.toLowerCase().includes(studentInfo.department_name?.toLowerCase())
          )) {
            console.log('   ✅ Student department matches');
            qualifies = true;
          }
        }
        // Course targeting
        else if (shortTermProgram.target_type === 'course') {
          if (studentInfo.course_name && (
            shortTermProgram.target_value === studentInfo.course_name ||
            shortTermProgram.target_value?.toLowerCase() === studentInfo.course_name?.toLowerCase() ||
            studentInfo.course_name.toLowerCase().includes(shortTermProgram.target_value?.toLowerCase()) ||
            shortTermProgram.target_value?.toLowerCase().includes(studentInfo.course_name?.toLowerCase())
          )) {
            console.log('   ✅ Student course matches');
            qualifies = true;
          }
        }
        // Year targeting
        else if (shortTermProgram.target_type === 'year') {
          if (String(shortTermProgram.target_value) === String(studentInfo.year_of_study)) {
            console.log('   ✅ Student year matches');
            qualifies = true;
          }
        }
        // Program targeting
        else if (shortTermProgram.target_type === 'program') {
          if (studentInfo.course_name && (
            shortTermProgram.target_value === studentInfo.course_name ||
            shortTermProgram.target_value?.toLowerCase() === studentInfo.course_name?.toLowerCase() ||
            studentInfo.course_name.toLowerCase().includes(shortTermProgram.target_value?.toLowerCase()) ||
            shortTermProgram.target_value?.toLowerCase().includes(studentInfo.course_name?.toLowerCase())
          )) {
            console.log('   ✅ Student course matches (program type)');
            qualifies = true;
          } else {
            const programTargetMatch = studentRegularProgramNames.some(p => 
              p === shortTermProgram.target_value ||
              p?.toLowerCase().includes(shortTermProgram.target_value?.toLowerCase()) ||
              shortTermProgram.target_value?.toLowerCase().includes(p?.toLowerCase())
            );
            if (programTargetMatch) {
              console.log('   ✅ Student program matches');
              qualifies = true;
            }
          }
        }
        
        if (qualifies) {
          console.log(`✅ Assignment "${assignment.title}" - Short-term program targeting match`);
          return true;
        }
      }
      
      return false;
    });
    
    console.log('\n=== ASSIGNMENT FILTERING RESULT ===');
    console.log(`Total Assignments Found: ${filteredAssignments.length}`);
    
    if (filteredAssignments.length > 0) {
      console.log('Matched Assignments:');
      filteredAssignments.forEach(a => {
        console.log(`   - "${a.title}" (program: ${a.program_name})`);
      });
    }
    
    res.json({ success: true, data: filteredAssignments });
  } catch (error) {
    console.error('❌ Error fetching assignments:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// CLEAR ALL DATA ENDPOINTS - kama ulivyoeleza
app.delete('/api/clear-all-data', async (req, res) => {
  try {
    console.log('Clearing all data from database...');
    
    // Delete all data from all tables - correct order to avoid foreign key constraints
    await pool.query('DELETE FROM assignments');
    await pool.query('DELETE FROM content');
    await pool.query('DELETE FROM students');
    await pool.query('DELETE FROM programs');
    await pool.query('DELETE FROM courses');
    await pool.query('DELETE FROM departments');
    await pool.query('DELETE FROM colleges');
    await pool.query('DELETE FROM lecturers');
    
    // Reset sequences
    await pool.query('ALTER SEQUENCE students_id_seq RESTART WITH 1');
    await pool.query('ALTER SEQUENCE lecturers_id_seq RESTART WITH 1');
    await pool.query('ALTER SEQUENCE programs_id_seq RESTART WITH 1');
    await pool.query('ALTER SEQUENCE courses_id_seq RESTART WITH 1');
    await pool.query('ALTER SEQUENCE departments_id_seq RESTART WITH 1');
    await pool.query('ALTER SEQUENCE colleges_id_seq RESTART WITH 1');
    
    console.log('All data cleared successfully');
    res.json({ success: true, message: 'All data cleared successfully' });
  } catch (error) {
    console.error('Error clearing data:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ASSESSMENT MANAGEMENT ENDPOINTS

// Initialize assessments table
app.post('/api/assessments/init', async (req, res) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS assessments (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        program_name VARCHAR(255) NOT NULL,
        lecturer_id INTEGER,
        lecturer_name VARCHAR(255),
        duration INTEGER DEFAULT 60,
        start_date TIMESTAMP,
        end_date TIMESTAMP,
        scheduled_date DATE,
        scheduled_time TIME,
        auto_grade BOOLEAN DEFAULT true,
        grading_format VARCHAR(20) DEFAULT 'percentage',
        total_questions INTEGER DEFAULT 0,
        total_points INTEGER DEFAULT 0,
        status VARCHAR(50) DEFAULT 'draft',
        questions JSONB DEFAULT '[]',
        results_published_to_students BOOLEAN DEFAULT false,
        results_published_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS assessment_submissions (
        id SERIAL PRIMARY KEY,
        assessment_id INTEGER REFERENCES assessments(id) ON DELETE CASCADE,
        student_id INTEGER,
        student_name VARCHAR(255),
        student_registration VARCHAR(100),
        student_program VARCHAR(255),
        answers JSONB DEFAULT '{}',
        score INTEGER DEFAULT 0,
        percentage INTEGER DEFAULT 0,
        status VARCHAR(50) DEFAULT 'submitted',
        auto_graded_score INTEGER,
        manual_graded_score INTEGER,
        manual_scores JSONB DEFAULT '{}',
        feedback JSONB DEFAULT '{}',
        graded_at TIMESTAMP,
        published_to_students BOOLEAN DEFAULT false,
        published_at TIMESTAMP,
        submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add missing columns if they don't exist
    try {
      await pool.query(`
        ALTER TABLE assessment_submissions 
        ADD COLUMN IF NOT EXISTS published_to_students BOOLEAN DEFAULT false
      `);
      await pool.query(`
        ALTER TABLE assessment_submissions 
        ADD COLUMN IF NOT EXISTS published_at TIMESTAMP
      `);
      
      // Add missing column to assessments table
      await pool.query(`
        ALTER TABLE assessments 
        ADD COLUMN IF NOT EXISTS results_published_to_students BOOLEAN DEFAULT false
      `);
      await pool.query(`
        ALTER TABLE assessments 
        ADD COLUMN IF NOT EXISTS results_published_at TIMESTAMP
      `);
      
      // Add missing columns to assessment_submissions table for manual grading
      await pool.query(`
        ALTER TABLE assessment_submissions 
        ADD COLUMN IF NOT EXISTS manual_scores JSONB DEFAULT '{}'
      `);
      await pool.query(`
        ALTER TABLE assessment_submissions 
        ADD COLUMN IF NOT EXISTS feedback JSONB DEFAULT '{}'
      `);
      await pool.query(`
        ALTER TABLE assessment_submissions 
        ADD COLUMN IF NOT EXISTS graded_at TIMESTAMP
      `);
    } catch (error) {
      console.log('Columns already exist or error adding:', error.message);
    }

    console.log('Assessment tables initialized successfully');
    res.json({ success: true, message: 'Assessment tables initialized' });
  } catch (error) {
    console.error('Error initializing assessment tables:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create new assessment
app.post('/api/assessments', async (req, res) => {
  try {
    const {
      title, description, program_name, lecturer_id, lecturer_name,
      duration, start_date, end_date, scheduled_date, scheduled_time,
      auto_grade, grading_format, questions, status
    } = req.body;

    console.log('=== ASSESSMENT CREATION DEBUG ===');
    console.log('Assessment Data:', req.body);

    const total_questions = questions ? questions.length : 0;
    const total_points = questions ? questions.reduce((sum, q) => sum + (q.points || 0), 0) : 0;

    const result = await pool.query(
      `INSERT INTO assessments (
        title, description, program_name, lecturer_id, lecturer_name,
        duration, start_date, end_date, scheduled_date, scheduled_time,
        auto_grade, grading_format, total_questions, total_points,
        questions, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) 
      RETURNING *`,
      [
        title, description, program_name, lecturer_id, lecturer_name,
        duration, start_date, end_date, scheduled_date, scheduled_time,
        auto_grade, grading_format, total_questions, total_points,
        JSON.stringify(questions || []), status || 'draft'
      ]
    );

    console.log('Assessment created:', result.rows[0]);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error creating assessment:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all assessments with student-specific program filtering
app.get('/api/assessments', async (req, res) => {
  try {
    const { lecturer_id, lecturer_name, program_name, status, student_id, student_username } = req.query;
    
    console.log('=== FETCHING ASSESSMENTS ===');
    console.log('Student ID:', student_id);
    console.log('Student Username:', student_username);
    console.log('Lecturer ID:', lecturer_id);
    console.log('Status:', status);
    
    let query = 'SELECT * FROM assessments';
    let params = [];
    let conditions = [];

    if (lecturer_id) {
      conditions.push(`lecturer_id = $${params.length + 1}`);
      params.push(lecturer_id);
    }

    if (lecturer_name) {
      conditions.push(`lecturer_name = $${params.length + 1}`);
      params.push(lecturer_name);
    }

    if (program_name) {
      conditions.push(`program_name = $${params.length + 1}`);
      params.push(program_name);
    }

    if (status) {
      conditions.push(`status = $${params.length + 1}`);
      params.push(status);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);
    
    console.log('Query:', query);
    console.log('Params:', params);
    console.log('Found assessments:', result.rows.length);
    
    // If student info provided, filter by student's programs
    let filteredAssessments = result.rows;
    
    if (student_id || student_username) {
      // Get student information with college and department
      let studentInfo = null;
      if (student_id) {
        const studentResult = await pool.query(`
          SELECT s.*, 
                 c.name as course_name,
                 d.name as department_name,
                 col.name as college_name
          FROM students s
          LEFT JOIN courses c ON s.course_id = c.id
          LEFT JOIN departments d ON c.department_id = d.id
          LEFT JOIN colleges col ON d.college_id = col.id
          WHERE s.id = $1
        `, [student_id]);
        
        if (studentResult.rows.length > 0) {
          studentInfo = studentResult.rows[0];
        }
      } else if (student_username) {
        const studentResult = await pool.query(`
          SELECT s.*, 
                 c.name as course_name,
                 d.name as department_name,
                 col.name as college_name
          FROM students s
          LEFT JOIN courses c ON s.course_id = c.id
          LEFT JOIN departments d ON c.department_id = d.id
          LEFT JOIN colleges col ON d.college_id = col.id
          WHERE s.registration_number = $1 OR s.email = $1 OR s.name = $1 OR LOWER(s.registration_number) = LOWER($1)
        `, [student_username]);
        
        if (studentResult.rows.length > 0) {
          studentInfo = studentResult.rows[0];
        }
      }
      
      if (studentInfo) {
        console.log('Student Info:', {
          id: studentInfo.id,
          name: studentInfo.name,
          course_name: studentInfo.course_name,
          department_name: studentInfo.department_name,
          college_name: studentInfo.college_name
        });
        
        // FIXED: If student has course_id but no department_name/college_name, try direct lookup
        if (studentInfo.course_id && (!studentInfo.department_name || !studentInfo.college_name)) {
          console.log('⚠️ Student missing department/college info, attempting direct lookup...');
          try {
            const courseInfoResult = await pool.query(`
              SELECT c.name as course_name, 
                     d.name as department_name,
                     col.name as college_name
              FROM courses c
              LEFT JOIN departments d ON c.department_id = d.id
              LEFT JOIN colleges col ON d.college_id = col.id
              WHERE c.id = $1
            `, [studentInfo.course_id]);
            
            if (courseInfoResult.rows.length > 0) {
              const courseInfo = courseInfoResult.rows[0];
              if (!studentInfo.course_name && courseInfo.course_name) studentInfo.course_name = courseInfo.course_name;
              if (!studentInfo.department_name && courseInfo.department_name) studentInfo.department_name = courseInfo.department_name;
              if (!studentInfo.college_name && courseInfo.college_name) studentInfo.college_name = courseInfo.college_name;
              console.log('   ✅ Found via direct lookup - dept:', studentInfo.department_name, ', college:', studentInfo.college_name);
            }
          } catch (lookupErr) {
            console.log('Direct lookup failed:', lookupErr.message);
          }
        }
        
        // Get student's REGULAR programs ONLY
        const programsResult = await pool.query(
          'SELECT name FROM programs WHERE course_id = $1',
          [studentInfo.course_id]
        );
        const studentRegularPrograms = programsResult.rows.map(p => p.name);
        
        console.log('Student Regular Programs:', studentRegularPrograms);
        
        // Get ALL short-term programs for filtering
        let shortTermResult = { rows: [] };
        let eligibleShortTermProgramNames = [];
        let enrolledShortTermPrograms = [];
        
        try {
          shortTermResult = await pool.query('SELECT * FROM short_term_programs ORDER BY created_at DESC');
          console.log('Total Short-Term Programs in DB:', shortTermResult.rows.length);
          
          // Check if student is enrolled in any short-term programs
          try {
            const enrollmentResult = await pool.query(
              `SELECT stp.title FROM short_term_enrollments ste
               JOIN short_term_programs stp ON ste.program_id = stp.id
               WHERE ste.student_id = $1`,
              [studentInfo.id]
            );
            enrolledShortTermPrograms = enrollmentResult.rows.map(r => r.title);
            console.log('Enrolled Short-Term Programs:', enrolledShortTermPrograms);
          } catch (enrollError) {
            console.log('No short_term_enrollments table:', enrollError.message);
          }
          
          // Filter short-term programs based on targeting
          const eligibleShortTermPrograms = shortTermResult.rows.filter(program => {
            // Check if student is directly enrolled
            if (enrolledShortTermPrograms.includes(program.title)) return true;
            
            // All students targeting
            if (!program.target_type || program.target_type === 'all' || program.target_type === '' || program.target_type === null) return true;
            
            // College targeting - with partial match
            if (program.target_type === 'college') {
              if (studentInfo.college_name && (
                program.target_value === studentInfo.college_name ||
                program.target_value?.toLowerCase() === studentInfo.college_name?.toLowerCase() ||
                studentInfo.college_name.toLowerCase().includes(program.target_value?.toLowerCase()) ||
                program.target_value?.toLowerCase().includes(studentInfo.college_name?.toLowerCase())
              )) return true;
            }
            
            // Department targeting - with partial match
            if (program.target_type === 'department') {
              if (studentInfo.department_name && (
                program.target_value === studentInfo.department_name ||
                program.target_value?.toLowerCase() === studentInfo.department_name?.toLowerCase() ||
                studentInfo.department_name.toLowerCase().includes(program.target_value?.toLowerCase()) ||
                program.target_value?.toLowerCase().includes(studentInfo.department_name?.toLowerCase())
              )) return true;
            }
            
            // Course targeting - with partial match
            if (program.target_type === 'course') {
              if (studentInfo.course_name && (
                program.target_value === studentInfo.course_name ||
                program.target_value?.toLowerCase() === studentInfo.course_name?.toLowerCase() ||
                studentInfo.course_name.toLowerCase().includes(program.target_value?.toLowerCase()) ||
                program.target_value?.toLowerCase().includes(studentInfo.course_name?.toLowerCase())
              )) return true;
            }
            
            // Year targeting
            if (program.target_type === 'year') {
              if (String(program.target_value) === String(studentInfo.year_of_study)) return true;
            }
            
            // Program targeting
            if (program.target_type === 'program') {
              if (studentInfo.course_name && (
                program.target_value === studentInfo.course_name ||
                program.target_value?.toLowerCase() === studentInfo.course_name?.toLowerCase() ||
                studentInfo.course_name.toLowerCase().includes(program.target_value?.toLowerCase()) ||
                program.target_value?.toLowerCase().includes(studentInfo.course_name?.toLowerCase())
              )) return true;
              const programMatch = studentRegularPrograms.some(p => 
                p === program.target_value ||
                p?.toLowerCase().includes(program.target_value?.toLowerCase()) ||
                program.target_value?.toLowerCase().includes(p?.toLowerCase())
              );
              if (programMatch) return true;
            }
            
            return false;
          });
          
          eligibleShortTermProgramNames = eligibleShortTermPrograms.map(p => p.title);
          console.log('✅ Eligible Short-Term Programs:', eligibleShortTermProgramNames);
        } catch (error) {
          console.log('⚠️ No short-term programs table or error:', error.message);
        }
        
        // Combine all student program names
        const allStudentProgramNames = [...new Set([...studentRegularPrograms, ...eligibleShortTermProgramNames, ...enrolledShortTermPrograms])];
        console.log('All Student Programs (Names):', allStudentProgramNames);
        
        // Filter assessments using NAME-BASED matching (like live-classes endpoint)
        filteredAssessments = result.rows.filter(assessment => {
          const assessmentProgramLower = assessment.program_name?.toLowerCase().trim() || '';
          
          // Method 1: Direct program name match
          const directMatch = allStudentProgramNames.some(program => {
            if (!program) return false;
            const programLower = program.toLowerCase().trim();
            
            // Exact match
            if (programLower === assessmentProgramLower) return true;
            
            // Contains match
            if (programLower.includes(assessmentProgramLower) || assessmentProgramLower.includes(programLower)) return true;
            
            // Word-based matching
            const programWords = programLower.split(/\s+/).filter(w => w.length > 2);
            const assessmentWords = assessmentProgramLower.split(/\s+/).filter(w => w.length > 2);
            const commonWords = programWords.filter(word => assessmentWords.includes(word));
            if (commonWords.length >= 1 && commonWords.length >= Math.min(programWords.length, assessmentWords.length) * 0.5) return true;
            
            return false;
          });
          
          if (directMatch) {
            console.log(`✅ Assessment "${assessment.title}" - Direct program match: ${assessment.program_name}`);
            return true;
          }
          
          // Method 2: Check if assessment is for a short-term program and student qualifies via targeting
          const shortTermProgram = shortTermResult.rows.find(stp => {
            const stpTitleLower = stp.title?.toLowerCase().trim() || '';
            if (stpTitleLower === assessmentProgramLower) return true;
            if (stpTitleLower.includes(assessmentProgramLower) || assessmentProgramLower.includes(stpTitleLower)) return true;
            const stpWords = stpTitleLower.split(/\s+/).filter(w => w.length > 2);
            const assessmentWords = assessmentProgramLower.split(/\s+/).filter(w => w.length > 2);
            const commonWords = stpWords.filter(word => assessmentWords.includes(word));
            if (commonWords.length >= 1 && commonWords.length >= Math.min(stpWords.length, assessmentWords.length) * 0.5) return true;
            return false;
          });
          
          if (shortTermProgram) {
            let qualifies = false;
            
            // All students targeting
            if (!shortTermProgram.target_type || shortTermProgram.target_type === 'all' || shortTermProgram.target_type === '' || shortTermProgram.target_type === null) {
              qualifies = true;
            }
            // Direct enrollment
            else if (enrolledShortTermPrograms.includes(shortTermProgram.title)) {
              qualifies = true;
            }
            // College targeting
            else if (shortTermProgram.target_type === 'college') {
              if (studentInfo.college_name && (
                shortTermProgram.target_value === studentInfo.college_name ||
                shortTermProgram.target_value?.toLowerCase() === studentInfo.college_name?.toLowerCase() ||
                studentInfo.college_name.toLowerCase().includes(shortTermProgram.target_value?.toLowerCase()) ||
                shortTermProgram.target_value?.toLowerCase().includes(studentInfo.college_name?.toLowerCase())
              )) qualifies = true;
            }
            // Department targeting
            else if (shortTermProgram.target_type === 'department') {
              if (studentInfo.department_name && (
                shortTermProgram.target_value === studentInfo.department_name ||
                shortTermProgram.target_value?.toLowerCase() === studentInfo.department_name?.toLowerCase() ||
                studentInfo.department_name.toLowerCase().includes(shortTermProgram.target_value?.toLowerCase()) ||
                shortTermProgram.target_value?.toLowerCase().includes(studentInfo.department_name?.toLowerCase())
              )) qualifies = true;
            }
            // Course/Courses targeting - CRITICAL FIX: Handle both 'course' and 'courses' (plural)
            else if (shortTermProgram.target_type === 'course' || shortTermProgram.target_type === 'courses') {
              if (studentInfo.course_name && (
                shortTermProgram.target_value === studentInfo.course_name ||
                shortTermProgram.target_value?.toLowerCase() === studentInfo.course_name?.toLowerCase() ||
                studentInfo.course_name.toLowerCase().includes(shortTermProgram.target_value?.toLowerCase()) ||
                shortTermProgram.target_value?.toLowerCase().includes(studentInfo.course_name?.toLowerCase())
              )) qualifies = true;
              // CRITICAL FIX: Handle comma-separated course list
              if (!qualifies && studentInfo.course_name && shortTermProgram.target_value) {
                const targetCourses = shortTermProgram.target_value.toLowerCase().split(',').map(c => c.trim()).filter(c => c.length > 0);
                const courseLower = studentInfo.course_name.toLowerCase().trim();
                for (const targetCourse of targetCourses) {
                  if (targetCourse === courseLower || targetCourse.includes(courseLower) || courseLower.includes(targetCourse)) {
                    qualifies = true;
                    break;
                  }
                }
              }
            }
            // Year targeting
            else if (shortTermProgram.target_type === 'year') {
              if (String(shortTermProgram.target_value) === String(studentInfo.year_of_study)) qualifies = true;
            }
            // Program targeting
            else if (shortTermProgram.target_type === 'program') {
              if (studentInfo.course_name && (
                shortTermProgram.target_value === studentInfo.course_name ||
                shortTermProgram.target_value?.toLowerCase() === studentInfo.course_name?.toLowerCase() ||
                studentInfo.course_name.toLowerCase().includes(shortTermProgram.target_value?.toLowerCase()) ||
                shortTermProgram.target_value?.toLowerCase().includes(studentInfo.course_name?.toLowerCase())
              )) qualifies = true;
              else {
                const programTargetMatch = studentRegularPrograms.some(p => 
                  p === shortTermProgram.target_value ||
                  p?.toLowerCase().includes(shortTermProgram.target_value?.toLowerCase()) ||
                  shortTermProgram.target_value?.toLowerCase().includes(p?.toLowerCase())
                );
                if (programTargetMatch) qualifies = true;
              }
            }
            
            if (qualifies) {
              console.log(`✅ Assessment "${assessment.title}" - Short-term program targeting match`);
              return true;
            }
          }
          
          return false;
        });
        
        console.log(`Filtered ${filteredAssessments.length} assessments for student`);
      }
    }

    // AUTO-EXPIRE ASSESSMENTS BASED ON REAL TIME
    const now = new Date();
    const updatedAssessments = [];
    
    for (const assessment of filteredAssessments) {
      let updatedAssessment = { ...assessment };
      
      // Check if scheduled assessment has expired
      if (assessment.start_date && assessment.start_time && assessment.duration) {
        const startDateTime = new Date(`${assessment.start_date}T${assessment.start_time}`);
        const endDateTime = new Date(startDateTime.getTime() + (assessment.duration * 60 * 1000));
        
        console.log(`=== AUTO-EXPIRE CHECK: ${assessment.title} ===`);
        console.log('Current time:', now.toISOString());
        console.log('Assessment start:', startDateTime.toISOString());
        console.log('Assessment end:', endDateTime.toISOString());
        console.log('Current status:', assessment.status);
        
        // Auto-expire if time has passed and not already completed
        if (now > endDateTime && assessment.status !== 'completed' && assessment.status !== 'expired') {
          console.log(`AUTO-EXPIRING: ${assessment.title}`);
          
          // Update status to expired in database
          await pool.query(
            'UPDATE assessments SET status = $1 WHERE id = $2',
            ['expired', assessment.id]
          );
          
          updatedAssessment.status = 'expired';
        }
        // Auto-activate if time has started and status is published
        else if (now >= startDateTime && now <= endDateTime && assessment.status === 'published') {
          console.log(`AUTO-ACTIVATING: ${assessment.title}`);
          
          // Update status to active in database
          await pool.query(
            'UPDATE assessments SET status = $1 WHERE id = $2',
            ['active', assessment.id]
          );
          
          updatedAssessment.status = 'active';
        }
      }
      
      updatedAssessments.push(updatedAssessment);
    }

    res.json({ success: true, data: updatedAssessments });
  } catch (error) {
    console.error('Error fetching assessments:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get assessment by ID
app.get('/api/assessments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query('SELECT * FROM assessments WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Assessment not found' });
    }

    // Get submissions for this assessment
    const submissionsResult = await pool.query(
      'SELECT * FROM assessment_submissions WHERE assessment_id = $1 ORDER BY submitted_at DESC',
      [id]
    );

    const assessment = result.rows[0];
    assessment.submissions = submissionsResult.rows;

    res.json({ success: true, data: assessment });
  } catch (error) {
    console.error('Error fetching assessment:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update assessment
app.put('/api/assessments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title, description, program_name, duration, start_date, end_date,
      scheduled_date, scheduled_time, auto_grade, grading_format,
      questions, status
    } = req.body;

    const total_questions = questions ? questions.length : 0;
    const total_points = questions ? questions.reduce((sum, q) => sum + (q.points || 0), 0) : 0;

    const result = await pool.query(
      `UPDATE assessments SET 
        title = $1, description = $2, program_name = $3, duration = $4,
        start_date = $5, end_date = $6, scheduled_date = $7, scheduled_time = $8,
        auto_grade = $9, grading_format = $10, total_questions = $11, total_points = $12,
        questions = $13, status = $14, updated_at = CURRENT_TIMESTAMP
      WHERE id = $15 RETURNING *`,
      [
        title, description, program_name, duration, start_date, end_date,
        scheduled_date, scheduled_time, auto_grade, grading_format,
        total_questions, total_points, JSON.stringify(questions || []), status, id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Assessment not found' });
    }

    console.log('Assessment updated:', result.rows[0]);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error updating assessment:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete assessment
app.delete('/api/assessments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query('DELETE FROM assessments WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Assessment not found' });
    }

    console.log('Assessment deleted:', result.rows[0]);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error deleting assessment:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// REMOVED DUPLICATE - Using improved endpoint below

// Submit assessment (student)
app.post('/api/assessments/:id/submit', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      student_id, student_name, student_registration, student_program, answers,
      auto_submitted, reason
    } = req.body;

    console.log('=== ASSESSMENT SUBMISSION DEBUG ===');
    console.log('Assessment ID:', id);
    console.log('Student Data:', { student_id, student_name, student_registration, student_program });
    console.log('Answers:', answers);
    console.log('Auto submitted:', auto_submitted, 'Reason:', reason);

    // Get assessment details
    const assessmentResult = await pool.query('SELECT * FROM assessments WHERE id = $1', [id]);
    
    if (assessmentResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Assessment not found' });
    }

    const assessment = assessmentResult.rows[0];
    const questions = assessment.questions || [];

    // Calculate score if auto-grading is enabled
    let score = 0;
    let percentage = 0;
    
    if (assessment.auto_grade && questions.length > 0) {
      questions.forEach((question, index) => {
        const studentAnswer = answers[question.id];
        let isCorrect = false;

        if (question.type === 'multiple-choice') {
          isCorrect = studentAnswer === question.correctAnswer;
        } else if (question.type === 'true-false') {
          isCorrect = studentAnswer === question.correctAnswer;
        }
        // Short answer questions require manual grading

        if (isCorrect) {
          score += question.points || 0;
        }
      });

      percentage = assessment.total_points > 0 ? Math.round((score / assessment.total_points) * 100) : 0;
    }

    // Insert submission
    const submissionResult = await pool.query(
      `INSERT INTO assessment_submissions (
        assessment_id, student_id, student_name, student_registration, student_program,
        answers, score, percentage, auto_graded_score, status, submitted_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP) 
      RETURNING *`,
      [
        id, student_id, student_name, student_registration, student_program,
        JSON.stringify(answers), score, percentage, score, 'submitted'
      ]
    );

    console.log('Assessment submission saved:', submissionResult.rows[0]);
    
    // Return success without showing score to student
    res.json({ 
      success: true, 
      message: 'Assessment submitted successfully',
      submission_id: submissionResult.rows[0].id,
      submitted_at: submissionResult.rows[0].submitted_at
    });
  } catch (error) {
    console.error('Error submitting assessment:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// REMOVED: Duplicate GET endpoint - already exists at line 2153
// REMOVED: Duplicate PUT endpoint - already exists at line 2180

// Get student assessments (available assessments for student to take)
app.get('/api/student-assessments', async (req, res) => {
  try {
    const { student_id, student_program } = req.query;

    console.log('=== STUDENT ASSESSMENTS DEBUG ===');
    console.log('Student ID:', student_id);
    console.log('Student Program:', student_program);

    if (!student_id) {
      return res.json({ success: true, data: [] });
    }

    // Get student's programs first to filter assessments
    const studentResult = await pool.query(
      'SELECT course_id FROM students WHERE id = $1',
      [student_id]
    );
    
    if (studentResult.rows.length === 0) {
      console.log('Student not found');
      return res.json({ success: true, data: [] });
    }
    
    const studentInfo = studentResult.rows[0];
    
    // Get all regular programs for student's course
    const programsResult = await pool.query(
      'SELECT name FROM programs WHERE course_id = $1',
      [studentInfo.course_id]
    );
    
    let programNames = programsResult.rows.map(p => p.name);
    console.log('Student Regular Programs:', programNames);
    
    // CRITICAL: Add short-term programs that student is eligible for
    try {
      // Get full student info for targeting - INCLUDING college and department
      const fullStudentResult = await pool.query(`
        SELECT s.*, 
               c.name as course_name,
               d.name as department_name,
               col.name as college_name
        FROM students s
        LEFT JOIN courses c ON s.course_id = c.id
        LEFT JOIN departments d ON c.department_id = d.id
        LEFT JOIN colleges col ON d.college_id = col.id
        WHERE s.id = $1
      `, [student_id]);
      
      if (fullStudentResult.rows.length > 0) {
        const fullStudentInfo = fullStudentResult.rows[0];
        
        console.log('=== STUDENT FULL INFO FOR SHORT-TERM TARGETING ===');
        console.log('Student ID:', fullStudentInfo.id);
        console.log('Student Name:', fullStudentInfo.name);
        console.log('Course Name:', fullStudentInfo.course_name);
        console.log('Department Name:', fullStudentInfo.department_name);
        console.log('College Name:', fullStudentInfo.college_name);
        console.log('Year of Study:', fullStudentInfo.year_of_study);
        
        const shortTermResult = await pool.query(
          'SELECT * FROM short_term_programs WHERE end_date > NOW()'
        );
        
        console.log('=== SHORT-TERM PROGRAMS AVAILABLE ===');
        console.log('Total Short-Term Programs:', shortTermResult.rows.length);
        
        const eligibleShortTermPrograms = shortTermResult.rows.filter(program => {
          console.log(`\n--- Checking Short-Term Program: "${program.title}" ---`);
          console.log('   Target Type:', program.target_type);
          console.log('   Target Value:', program.target_value);
          
        // Check targeting for short-term programs
          // CRITICAL FIX: If target_type is null, undefined, or 'all', ALL students should see it
          if (!program.target_type || program.target_type === 'all' || program.target_type === '' || program.target_type === null) {
            console.log('   ✅ MATCH: All students (target_type:', program.target_type, ')');
            return true;
          }
          
          // College targeting - with case-insensitive and partial match
          if (program.target_type === 'college') {
            if (fullStudentInfo.college_name && program.target_value === fullStudentInfo.college_name) {
              console.log('   ✅ MATCH: College targeting');
              return true;
            }
            if (fullStudentInfo.college_name && program.target_value?.toLowerCase() === fullStudentInfo.college_name?.toLowerCase()) {
              console.log('   ✅ MATCH: College targeting (case-insensitive)');
              return true;
            }
            // CRITICAL FIX: Add partial match for college names
            if (fullStudentInfo.college_name && program.target_value && (
              fullStudentInfo.college_name.toLowerCase().includes(program.target_value.toLowerCase()) ||
              program.target_value.toLowerCase().includes(fullStudentInfo.college_name.toLowerCase())
            )) {
              console.log('   ✅ MATCH: College targeting (partial match)');
              return true;
            }
          }
          
          // Department targeting - with case-insensitive and partial match
          if (program.target_type === 'department') {
            if (fullStudentInfo.department_name && program.target_value === fullStudentInfo.department_name) {
              console.log('   ✅ MATCH: Department targeting');
              return true;
            }
            if (fullStudentInfo.department_name && program.target_value?.toLowerCase() === fullStudentInfo.department_name?.toLowerCase()) {
              console.log('   ✅ MATCH: Department targeting (case-insensitive)');
              return true;
            }
            // CRITICAL FIX: Add partial match for department names
            if (fullStudentInfo.department_name && program.target_value && (
              fullStudentInfo.department_name.toLowerCase().includes(program.target_value.toLowerCase()) ||
              program.target_value.toLowerCase().includes(fullStudentInfo.department_name.toLowerCase())
            )) {
              console.log('   ✅ MATCH: Department targeting (partial match)');
              return true;
            }
          }
          
          // Course/Courses targeting - with case-insensitive and partial match
          // CRITICAL FIX: Handle both 'course' and 'courses' (plural) target types
          if (program.target_type === 'course' || program.target_type === 'courses') {
            if (fullStudentInfo.course_name && program.target_value === fullStudentInfo.course_name) {
              console.log('   ✅ MATCH: Course targeting');
              return true;
            }
            if (fullStudentInfo.course_name && program.target_value?.toLowerCase() === fullStudentInfo.course_name?.toLowerCase()) {
              console.log('   ✅ MATCH: Course targeting (case-insensitive)');
              return true;
            }
            if (fullStudentInfo.course_name && (
              fullStudentInfo.course_name.toLowerCase().includes(program.target_value?.toLowerCase()) ||
              program.target_value?.toLowerCase().includes(fullStudentInfo.course_name?.toLowerCase())
            )) {
              console.log('   ✅ MATCH: Course targeting (partial match)');
              return true;
            }
            // CRITICAL FIX: Handle comma-separated course list
            if (fullStudentInfo.course_name && program.target_value) {
              const targetCourses = program.target_value.toLowerCase().split(',').map(c => c.trim()).filter(c => c.length > 0);
              const courseLower = fullStudentInfo.course_name.toLowerCase().trim();
              for (const targetCourse of targetCourses) {
                if (targetCourse === courseLower || targetCourse.includes(courseLower) || courseLower.includes(targetCourse)) {
                  console.log('   ✅ MATCH: Course targeting (comma-separated list)');
                  return true;
                }
              }
            }
          }
          
          // Year targeting with proper type conversion
          if (program.target_type === 'year') {
            const targetYear = String(program.target_value);
            const studentYear = String(fullStudentInfo.year_of_study);
            if (targetYear === studentYear) {
              console.log('   ✅ MATCH: Year targeting');
              return true;
            }
          }
          
          // Program targeting
          if (program.target_type === 'program' && programNames.includes(program.target_value)) {
            console.log('   ✅ MATCH: Program targeting');
            return true;
          }
          
          console.log('   ❌ NO MATCH');
          return false;
        });
        
        // Add short-term program titles to student programs list
        const shortTermProgramNames = eligibleShortTermPrograms.map(p => p.title);
        programNames = [...programNames, ...shortTermProgramNames];
        console.log('✅ Added short-term programs to assessments:', shortTermProgramNames);
        console.log('   Total programs (Regular + Short-Term):', programNames.length);
      }
    } catch (error) {
      console.log('⚠️ No short-term programs or error:', error.message);
    }
    
    console.log('Student All Programs for Assessments:', programNames);

    // Get published assessments for student's programs only
    // Use LOWER() for case-insensitive matching and TRIM() for whitespace handling
    const programNamesLower = programNames.map(p => p?.toLowerCase().trim()).filter(p => p);
    
    let query = `
      SELECT a.*, 
        CASE WHEN s.id IS NOT NULL THEN true ELSE false END as submitted,
        s.score, s.percentage, s.submitted_at
      FROM assessments a
      LEFT JOIN assessment_submissions s ON a.id = s.assessment_id AND s.student_id = $1
      WHERE a.status = 'published'
        AND LOWER(TRIM(a.program_name)) = ANY($2)
    `;
    
    let params = [student_id, programNamesLower];

    // Further filter by specific program if provided
    if (student_program) {
      query += ' AND a.program_name = $3';
      params.push(student_program);
    }

    query += ' ORDER BY a.created_at DESC';

    console.log('Query:', query);
    console.log('Params:', params);

    const result = await pool.query(query, params);
    
    console.log('Found available assessments for student:', result.rows.length);
    console.log('Assessments:', result.rows);
    
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching student assessments:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get submitted assessments for student (for assignments section)
app.get('/api/student-submitted-assessments', async (req, res) => {
  try {
    const { student_id } = req.query;

    console.log('=== STUDENT SUBMITTED ASSESSMENTS DEBUG ===');
    console.log('Student ID:', student_id);

    const query = `
      SELECT a.*, s.score, s.percentage, s.submitted_at, s.status as submission_status
      FROM assessments a
      INNER JOIN assessment_submissions s ON a.id = s.assessment_id
      WHERE s.student_id = $1
      ORDER BY s.submitted_at DESC
    `;
    
    const result = await pool.query(query, [student_id]);
    
    console.log('Found submitted assessments:', result.rows.length);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching submitted assessments:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUBLISH RESULTS TO STUDENTS - DONE BUTTON
app.post('/api/submit-results-to-students/:assessmentId', async (req, res) => {
  try {
    const { assessmentId } = req.params;

    console.log('=== PUBLISHING RESULTS TO STUDENTS ===');
    console.log('Assessment ID:', assessmentId);

    // Update assessment status to completed and mark results as published
    const assessmentUpdate = await pool.query(
      'UPDATE assessments SET status = $1, results_published_to_students = $2, results_published_at = $3 WHERE id = $4 RETURNING *',
      ['completed', true, new Date(), assessmentId]
    );

    if (assessmentUpdate.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Assessment not found' });
    }

    // Update all submissions to mark as published to students
    const submissionsUpdate = await pool.query(
      'UPDATE assessment_submissions SET published_to_students = $1, published_at = $2 WHERE assessment_id = $3 RETURNING *',
      [true, new Date(), assessmentId]
    );

    console.log('Assessment updated:', assessmentUpdate.rows[0]);
    console.log('Submissions published:', submissionsUpdate.rows.length);

    // Create assignment entries for students (results in Assignment section)
    for (const submission of submissionsUpdate.rows) {
      try {
        await pool.query(`
          INSERT INTO assignments (
            title, 
            description, 
            program_name, 
            lecturer_id, 
            lecturer_name, 
            status,
            created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
          `Assessment Result: ${assessmentUpdate.rows[0].title}`,
          `Your assessment score: ${submission.percentage}% (${submission.score}/${assessmentUpdate.rows[0].total_points} points)`,
          submission.student_program,
          assessmentUpdate.rows[0].lecturer_id,
          assessmentUpdate.rows[0].lecturer_name,
          'completed',
          new Date()
        ]);
      } catch (error) {
        console.log('Error creating assignment entry:', error.message);
      }
    }

    res.json({ 
      success: true, 
      message: 'Results published to students successfully',
      data: {
        assessment: assessmentUpdate.rows[0],
        submissions: submissionsUpdate.rows
      }
    });
  } catch (error) {
    console.error('Error publishing results to students:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Manual grading endpoint
app.post('/api/manual-grade-submission', async (req, res) => {
  try {
    const { 
      submission_id, 
      manual_scores, 
      feedback, 
      total_score, 
      percentage, 
      status 
    } = req.body;

    console.log('=== MANUAL GRADING DEBUG ===');
    console.log('Request Body:', req.body);
    console.log('Submission ID:', submission_id);
    console.log('Manual Scores:', manual_scores);
    console.log('Total Score:', total_score);
    console.log('Percentage:', percentage);
    console.log('Status:', status);

    // Update submission with manual grades
    const result = await pool.query(
      `UPDATE assessment_submissions 
       SET score = $1, percentage = $2, status = $3, manual_scores = $4, feedback = $5, graded_at = NOW()
       WHERE id = $6 
       RETURNING *`,
      [total_score, percentage, status, JSON.stringify(manual_scores), JSON.stringify(feedback), submission_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Submission not found' });
    }

    console.log('Manual grading saved:', result.rows[0]);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error saving manual grades:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Auto-grade all submissions for an assessment
app.post('/api/auto-grade-all/:assessment_id', async (req, res) => {
  try {
    const { assessment_id } = req.params;

    console.log('=== AUTO GRADE ALL DEBUG ===');
    console.log('Assessment ID:', assessment_id);

    // Get assessment details
    const assessmentResult = await pool.query('SELECT * FROM assessments WHERE id = $1', [assessment_id]);
    if (assessmentResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Assessment not found' });
    }

    const assessment = assessmentResult.rows[0];
    const questions = assessment.questions || [];

    // Get all ungraded submissions for this assessment
    const submissionsResult = await pool.query(
      'SELECT * FROM assessment_submissions WHERE assessment_id = $1 AND status = $2',
      [assessment_id, 'submitted']
    );

    console.log('Found submissions to auto-grade:', submissionsResult.rows.length);

    const gradedSubmissions = [];

    for (const submission of submissionsResult.rows) {
      let autoGradedScore = 0;
      let totalPoints = 0;

      questions.forEach(question => {
        totalPoints += question.points;
        const studentAnswer = submission.answers[question.id];

        if (question.type === 'multiple-choice' && studentAnswer !== undefined) {
          if (studentAnswer === question.correctAnswer) {
            autoGradedScore += question.points;
          }
        } else if (question.type === 'true-false' && studentAnswer !== undefined) {
          if (studentAnswer === question.correctAnswer) {
            autoGradedScore += question.points;
          }
        }
        // Short answer questions remain ungraded (0 points)
      });

      const percentage = totalPoints > 0 ? Math.round((autoGradedScore / totalPoints) * 100) : 0;

      // Update submission with auto-graded score
      const updateResult = await pool.query(
        `UPDATE assessment_submissions 
         SET score = $1, percentage = $2, status = $3, auto_graded_score = $4, graded_at = NOW()
         WHERE id = $5 
         RETURNING *`,
        [autoGradedScore, percentage, 'auto-graded', autoGradedScore, submission.id]
      );

      gradedSubmissions.push(updateResult.rows[0]);
    }

    console.log('Auto-graded submissions:', gradedSubmissions.length);
    res.json({ success: true, data: gradedSubmissions });
  } catch (error) {
    console.error('Error auto-grading submissions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get graded assessments for student (for Assignment page)
app.get('/api/student-graded-assessments', async (req, res) => {
  try {
    const { student_id } = req.query;

    console.log('=== STUDENT GRADED ASSESSMENTS DEBUG ===');
    console.log('Student ID:', student_id);

    const query = `
      SELECT 
        a.id,
        a.title,
        a.program_name,
        a.description,
        a.duration,
        a.total_points,
        a.lecturer_name,
        s.score,
        s.percentage,
        s.submitted_at,
        s.graded_at,
        s.status,
        s.feedback
      FROM assessments a
      INNER JOIN assessment_submissions s ON a.id = s.assessment_id
      WHERE s.student_id = $1 
        AND s.status IN ('auto-graded', 'manually-graded')
      ORDER BY s.graded_at DESC
    `;
    
    const result = await pool.query(query, [student_id]);
    
    console.log('Found graded assessments:', result.rows.length);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching graded assessments:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Submit results to students (DONE button)
app.post('/api/submit-results-to-students', async (req, res) => {
  try {
    const { assessment_id } = req.body;

    console.log('=== SUBMIT RESULTS TO STUDENTS ===');
    console.log('Assessment ID:', assessment_id);

    // Get all graded submissions for this assessment
    const submissionsResult = await pool.query(
      'SELECT * FROM assessment_submissions WHERE assessment_id = $1 AND status IN ($2, $3)',
      [assessment_id, 'auto-graded', 'manually-graded']
    );

    if (submissionsResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'No graded submissions found' });
    }

    console.log('Found graded submissions:', submissionsResult.rows.length);

    // Update assessment to mark results as published
    const assessmentUpdate = await pool.query(
      'UPDATE assessments SET results_published_to_students = true, results_published_at = NOW() WHERE id = $1 RETURNING *',
      [assessment_id]
    );

    // Update all graded submissions to indicate they've been published to students
    const submissionsUpdate = await pool.query(
      'UPDATE assessment_submissions SET published_to_students = true, published_at = NOW() WHERE assessment_id = $1 AND status IN ($2, $3) RETURNING *',
      [assessment_id, 'auto-graded', 'manually-graded']
    );

    console.log('Updated submissions:', submissionsUpdate.rows.length);
    console.log('Assessment updated:', assessmentUpdate.rows[0]);

    res.json({ 
      success: true, 
      message: `Results published to ${submissionsUpdate.rows.length} students`,
      data: {
        assessment: assessmentUpdate.rows[0],
        submissions: submissionsUpdate.rows
      }
    });
  } catch (error) {
    console.error('Error submitting results to students:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get assessment submissions for lecturer
app.get('/api/assessment-submissions', async (req, res) => {
  try {
    const { assessment_id, student_id } = req.query;
    
    console.log('=== GET ASSESSMENT SUBMISSIONS DEBUG ===');
    console.log('Assessment ID filter:', assessment_id);
    console.log('Student ID filter:', student_id);
    
    // SECURITY: If student_id provided, only return that student's submissions
    if (student_id) {
      let query = 'SELECT * FROM assessment_submissions WHERE student_id = $1 ORDER BY submitted_at DESC';
      let params = [student_id];
      
      if (assessment_id) {
        query = 'SELECT * FROM assessment_submissions WHERE assessment_id = $1 AND student_id = $2 ORDER BY submitted_at DESC';
        params = [assessment_id, student_id];
      }
      
      const result = await pool.query(query, params);
      console.log('Found submissions for student:', result.rows.length);
      return res.json({ success: true, data: result.rows });
    }
    
    // For lecturer/admin view: require assessment_id to prevent returning all submissions
    if (!assessment_id) {
      console.log('No assessment_id or student_id provided, returning empty array');
      return res.json({ success: true, data: [] });
    }
    
    const query = 'SELECT * FROM assessment_submissions WHERE assessment_id = $1 ORDER BY submitted_at DESC';
    const result = await pool.query(query, [assessment_id]);
    
    console.log('Found submissions:', result.rows.length);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching assessment submissions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Individual auto-grade endpoint for specific submission
app.post('/api/assessment-submissions/:id/auto-grade', async (req, res) => {
  try {
    const submissionId = req.params.id;
    
    console.log('=== INDIVIDUAL AUTO-GRADE REQUEST ===');
    console.log('Submission ID:', submissionId);
    
    // Get submission details
    const submissionResult = await pool.query(
      'SELECT * FROM assessment_submissions WHERE id = $1',
      [submissionId]
    );
    
    if (submissionResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Submission not found' });
    }
    
    const submission = submissionResult.rows[0];
    
    // Get assessment details
    const assessmentResult = await pool.query(
      'SELECT * FROM assessments WHERE id = $1',
      [submission.assessment_id]
    );
    
    if (assessmentResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Assessment not found' });
    }
    
    const assessment = assessmentResult.rows[0];
    const questions = assessment.questions || [];
    const answers = submission.answers || {};
    
    // INDIVIDUAL AUTO-GRADING LOGIC
    let autoGradedScore = 0;
    let manualQuestionPoints = 0;
    let autoGradableQuestions = 0;
    let manualQuestions = 0;
    
    questions.forEach(question => {
      const studentAnswer = answers[question.id];
      
      if (question.type === 'multiple-choice') {
        autoGradableQuestions++;
        if (studentAnswer === question.correctAnswer) {
          autoGradedScore += question.points;
        }
      } 
      else if (question.type === 'true-false') {
        autoGradableQuestions++;
        const correctAnswer = String(question.correctAnswer).toLowerCase() === 'true';
        const studentAnswerBool = String(studentAnswer).toLowerCase() === 'true';
        if (correctAnswer === studentAnswerBool) {
          autoGradedScore += question.points;
        }
      }
      else if (question.type === 'short-answer' || question.type === 'fill-in-blank') {
        manualQuestions++;
        manualQuestionPoints += question.points;
      }
    });
    
    // Calculate final scores and status
    let finalScore = autoGradedScore;
    let finalPercentage = assessment.total_points > 0 ? Math.round((autoGradedScore / assessment.total_points) * 100) : 0;
    let submissionStatus = manualQuestions > 0 ? 'partially-graded' : 'auto-graded';
    
    // Update submission in database
    const updateResult = await pool.query(
      `UPDATE assessment_submissions 
       SET score = $1, percentage = $2, status = $3, auto_graded_score = $4, graded_at = CURRENT_TIMESTAMP
       WHERE id = $5 RETURNING *`,
      [finalScore, finalPercentage, submissionStatus, autoGradedScore, submissionId]
    );
    
    console.log('Individual auto-grade completed:', {
      submissionId,
      autoGradedScore,
      manualQuestionPoints,
      finalScore,
      finalPercentage,
      status: submissionStatus
    });
    
    res.json({ 
      success: true, 
      data: updateResult.rows[0],
      autoGradedScore,
      manualQuestionPoints,
      percentage: finalPercentage,
      status: submissionStatus
    });
    
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get comprehensive student progress for lecturer view
app.get('/api/student-progress/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    
    console.log('=== FETCHING STUDENT PROGRESS ===');
    console.log('Student ID:', studentId);
    
    // Get student basic info
    const studentResult = await pool.query(
      'SELECT * FROM students WHERE id = $1',
      [studentId]
    );
    
    if (studentResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }
    
    const student = studentResult.rows[0];
    
    // Get student's program/course info
    const programResult = await pool.query(
      'SELECT * FROM programs WHERE course_id = $1',
      [student.course_id]
    );
    
    // Get assessment submissions with details
    const assessmentsQuery = `
      SELECT 
        a.id,
        a.title,
        a.program_name,
        a.total_points,
        a.created_at as assessment_created_at,
        s.score,
        s.percentage,
        s.status,
        s.submitted_at,
        s.graded_at,
        s.published_to_students
      FROM assessments a
      INNER JOIN assessment_submissions s ON a.id = s.assessment_id
      WHERE s.student_id = $1
      ORDER BY s.submitted_at DESC
    `;
    
    const assessmentsResult = await pool.query(assessmentsQuery, [studentId]);
    
    // Get assignment submissions (if any)
    const assignmentsQuery = `
      SELECT 
        a.id,
        a.title,
        a.description,
        a.program_name,
        a.deadline,
        a.max_points,
        a.status,
        a.created_at,
        s.id as submission_id,
        s.submission_type,
        s.submitted_at,
        s.grade,
        s.feedback
      FROM assignments a
      LEFT JOIN assignment_submissions s ON a.id = s.assignment_id AND s.student_id = $1
      WHERE a.program_name = $2 OR a.lecturer_id IN (
        SELECT lecturer_id FROM programs WHERE course_id = $3
      )
      ORDER BY a.created_at DESC
    `;
    
    const assignmentsResult = await pool.query(
      assignmentsQuery, 
      [studentId, student.program_name || '', student.course_id]
    );
    
    // Calculate statistics
    const totalAssessments = assessmentsResult.rows.length;
    const completedAssessments = assessmentsResult.rows.filter(a => a.status === 'auto-graded' || a.status === 'manually-graded').length;
    const averageScore = totalAssessments > 0 
      ? Math.round(assessmentsResult.rows.reduce((sum, a) => sum + (a.percentage || 0), 0) / totalAssessments)
      : 0;
    
    const totalAssignments = assignmentsResult.rows.length;
    const submittedAssignments = assignmentsResult.rows.filter(a => a.submission_id).length;
    
    // Get content/materials accessed (if tracking exists)
    const contentQuery = `
      SELECT COUNT(*) as total_materials
      FROM content
      WHERE program_name = $1
    `;
    
    const contentResult = await pool.query(contentQuery, [student.program_name || '']);
    
    const progressData = {
      student: {
        id: student.id,
        name: student.name,
        email: student.email,
        registration_number: student.registration_number,
        program_name: student.program_name,
        academic_year: student.academic_year,
        current_semester: student.current_semester
      },
      program: programResult.rows[0] || null,
      statistics: {
        totalAssessments,
        completedAssessments,
        averageScore,
        totalAssignments,
        submittedAssignments,
        assignmentCompletionRate: totalAssignments > 0 
          ? Math.round((submittedAssignments / totalAssignments) * 100) 
          : 0,
        totalMaterials: contentResult.rows[0]?.total_materials || 0
      },
      assessments: assessmentsResult.rows,
      assignments: assignmentsResult.rows
    };
    
    console.log('Student progress data compiled:', {
      studentId,
      totalAssessments,
      totalAssignments,
      averageScore
    });
    
    res.json({ success: true, data: progressData });
    
  } catch (error) {
    console.error('Error fetching student progress:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// LECTURER DONE - PUBLISH RESULTS TO ASSESSMENT RESULTS
app.post('/api/submit-results-to-students/:assessmentId', async (req, res) => {
  try {
    const assessmentId = req.params.assessmentId;
    console.log('=== LECTURER DONE - PUBLISHING RESULTS ===');
    console.log('Assessment ID:', assessmentId);
    
    // Update all submissions to published_to_students = true
    const updateResult = await pool.query(
      `UPDATE assessment_submissions 
       SET published_to_students = true, published_at = CURRENT_TIMESTAMP
       WHERE assessment_id = $1 
       RETURNING *`,
      [assessmentId]
    );
    
    // Update assessment status to completed
    const assessmentUpdate = await pool.query(
      `UPDATE assessments 
       SET status = 'completed', results_published_at = CURRENT_TIMESTAMP
       WHERE id = $1 
       RETURNING *`,
      [assessmentId]
    );
    
    console.log('Results published for:', updateResult.rows.length, 'submissions');
    console.log('Assessment marked as completed');
    
    res.json({ 
      success: true, 
      message: `Results published to ${updateResult.rows.length} students`,
      data: {
        assessment: assessmentUpdate.rows[0],
        submissions: updateResult.rows
      }
    });
    
  } catch (error) {
    console.error('Error publishing results to students:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Submit assessment endpoint with REAL FLEXIBLE AUTO-GRADING
app.post('/api/assessment-submissions', async (req, res) => {
  try {
    const { 
      assessment_id, 
      student_id, 
      student_name, 
      student_registration, 
      student_program,
      answers
    } = req.body;

    console.log('=== ASSESSMENT SUBMISSION DEBUG ===');
    console.log('Assessment ID:', assessment_id);
    console.log('Student ID:', student_id);
    console.log('Student Answers:', answers);

    // Check if student already submitted
    const existingSubmission = await pool.query(
      'SELECT id FROM assessment_submissions WHERE assessment_id = $1 AND student_id = $2',
      [assessment_id, student_id]
    );

    if (existingSubmission.rows.length > 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Assessment already submitted' 
      });
    }

    // Get assessment details to check auto_grade setting
    const assessmentResult = await pool.query('SELECT * FROM assessments WHERE id = $1', [assessment_id]);
    if (assessmentResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Assessment not found' });
    }

    const assessment = assessmentResult.rows[0];
    const questions = assessment.questions || [];
    
    console.log('=== GRADING LOGIC DEBUG ===');
    console.log('Assessment auto_grade setting:', assessment.auto_grade);
    console.log('Total questions:', questions.length);
    let finalScore = 0;
    let finalPercentage = 0;
    let submissionStatus = 'submitted';

        // REAL FLEXIBLE GRADING LOGIC - MIXED QUESTION HANDLING
        console.log('=== SUBMISSION PROCESSING FOR LECTURER REVIEW ===');
        
        if (assessment.auto_grade === true) {
          console.log('=== AUTO-GRADE MODE: ON - MIXED QUESTIONS ===');
          
          // AUTO-GRADE: Process auto-gradable questions, manual for others
          let autoGradedScore = 0;
          let manualQuestionPoints = 0;
          let autoGradableQuestions = 0;
          let manualQuestions = 0;
          
          questions.forEach(question => {
            const studentAnswer = answers[question.id];
            
            if (question.type === 'multiple-choice') {
              autoGradableQuestions++;
              console.log(`MC Question ${question.id}: Student=${studentAnswer}, Correct=${question.correctAnswer}`);
              if (studentAnswer === question.correctAnswer) {
                autoGradedScore += question.points;
                console.log(`✅ Correct! Added ${question.points} points`);
              } else {
                console.log(`❌ Wrong! No points added`);
              }
            } 
            else if (question.type === 'true-false') {
              autoGradableQuestions++;
              const correctAnswer = String(question.correctAnswer).toLowerCase() === 'true';
              const studentAnswerBool = String(studentAnswer).toLowerCase() === 'true';
              console.log(`T/F Question ${question.id}: Student=${studentAnswerBool}, Correct=${correctAnswer}`);
              if (correctAnswer === studentAnswerBool) {
                autoGradedScore += question.points;
                console.log(`✅ Correct! Added ${question.points} points`);
              } else {
                console.log(`❌ Wrong! No points added`);
              }
            }
            else if (question.type === 'short-answer' || question.type === 'fill-in-blank') {
              manualQuestions++;
              // Manual grading required - add to manual points tracker
              manualQuestionPoints += question.points;
              console.log(`📝 ${question.type} Question ${question.id}: Requires manual grading (${question.points} points)`);
            }
          });

          // MIXED QUESTION HANDLING - Set appropriate status
          if (manualQuestions > 0) {
            // HAS MANUAL QUESTIONS: Partial auto-grading, needs lecturer review
            finalScore = autoGradedScore; // Partial score from auto-graded questions
            finalPercentage = assessment.total_points > 0 ? Math.round((autoGradedScore / assessment.total_points) * 100) : 0;
            submissionStatus = 'partially-graded'; // Mixed: Auto + Manual pending
            console.log(`🔄 MIXED QUESTIONS: Auto-graded ${autoGradableQuestions} questions (${autoGradedScore} pts), Manual pending ${manualQuestions} questions (${manualQuestionPoints} pts)`);
          } else {
            // ALL AUTO-GRADABLE: Complete auto-grading
            finalScore = autoGradedScore;
            finalPercentage = assessment.total_points > 0 ? Math.round((autoGradedScore / assessment.total_points) * 100) : 0;
            submissionStatus = 'auto-graded'; // Fully auto-graded
            console.log(`✅ FULLY AUTO-GRADED: All ${autoGradableQuestions} questions auto-graded (${autoGradedScore} pts)`);
          }
          
        } else {
          console.log('=== AUTO-GRADE MODE: OFF ===');
          console.log('All questions require manual grading - submitted for lecturer review');
          
          // MANUAL MODE: All questions need manual grading (score = 0)
          finalScore = 0;
          finalPercentage = 0;
          submissionStatus = 'submitted'; // LECTURER MUST REVIEW AND GRADE ALL
        }

    console.log('===FINAL GRADING RESULT ===');
    console.log('Final Score:', finalScore);
    console.log('Final Percentage:', finalPercentage);
    console.log('Status:', submissionStatus);
    // Insert submission with calculated scores
    const result = await pool.query(
      `INSERT INTO assessment_submissions 
       (assessment_id, student_id, student_name, student_registration, student_program, 
        answers, score, percentage, status, auto_graded_score, submitted_at) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW()) 
       RETURNING *`,
      [assessment_id, student_id, student_name, student_registration, student_program, 
       JSON.stringify(answers), finalScore, finalPercentage, submissionStatus, finalScore]
    );

    console.log('Submission saved with real grading:', result.rows[0]);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error saving submission:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== ASSIGNMENT ENDPOINTS ====================

// Add missing program_id column without deleting data
app.post('/api/assignments/add-program-id', async (req, res) => {
  try {
    console.log('Adding program_id column to assignments table...');
    
    // Add program_id column if it doesn't exist
    await pool.query(`
      ALTER TABLE assignments 
      ADD COLUMN IF NOT EXISTS program_id INTEGER
    `);
    
    console.log('✅ program_id column added successfully');
    res.json({ success: true, message: 'program_id column added to assignments table' });
  } catch (error) {
    console.error('Error adding program_id column:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Fix assignment table
app.post('/api/assignments/fix', async (req, res) => {
  try {
    // Drop and recreate assignments table with correct schema
    await pool.query('DROP TABLE IF EXISTS assignment_submissions CASCADE');
    await pool.query('DROP TABLE IF EXISTS assignments CASCADE');
    
    await pool.query(`
      CREATE TABLE assignments (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        program_id INTEGER,
        program_name VARCHAR(255) NOT NULL,
        deadline TIMESTAMP NOT NULL,
        submission_type VARCHAR(20) DEFAULT 'text',
        max_points INTEGER DEFAULT 100,
        lecturer_id INTEGER,
        lecturer_name VARCHAR(255),
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE assignment_submissions (
        id SERIAL PRIMARY KEY,
        assignment_id INTEGER REFERENCES assignments(id) ON DELETE CASCADE,
        student_id INTEGER,
        student_name VARCHAR(255),
        student_registration VARCHAR(100),
        student_program VARCHAR(255),
        submission_type VARCHAR(20),
        text_content TEXT,
        file_path VARCHAR(500),
        file_name VARCHAR(255),
        submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        points_awarded INTEGER DEFAULT 0,
        feedback TEXT,
        graded_at TIMESTAMP
      )
    `);

    console.log('Assignment tables fixed successfully');
    res.json({ success: true, message: 'Assignment tables fixed' });
  } catch (error) {
    console.error('Error fixing assignment tables:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Initialize assignment tables
app.post('/api/assignments/init', async (req, res) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS assignments (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        program_id INTEGER,
        program_name VARCHAR(255) NOT NULL,
        deadline TIMESTAMP NOT NULL,
        submission_type VARCHAR(20) DEFAULT 'text',
        max_points INTEGER DEFAULT 100,
        lecturer_id INTEGER,
        lecturer_name VARCHAR(255),
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS assignment_submissions (
        id SERIAL PRIMARY KEY,
        assignment_id INTEGER REFERENCES assignments(id) ON DELETE CASCADE,
        student_id INTEGER,
        student_name VARCHAR(255),
        student_registration VARCHAR(100),
        student_program VARCHAR(255),
        submission_type VARCHAR(20),
        text_content TEXT,
        file_path VARCHAR(500),
        file_name VARCHAR(255),
        submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        points_awarded INTEGER DEFAULT 0,
        feedback TEXT,
        graded_at TIMESTAMP
      )
    `);

    res.json({ success: true, message: 'Assignment tables initialized' });
  } catch (error) {
    console.error('Error initializing assignment tables:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create new assignment
app.post('/api/assignments', async (req, res) => {
  try {
    const {
      title, description, program_name, deadline, submission_type,
      max_points, lecturer_id, lecturer_name
    } = req.body;

    console.log('=== CREATE ASSIGNMENT API DEBUG ===');
    console.log('Request Body:', JSON.stringify(req.body, null, 2));
    console.log('Title:', title, '(type:', typeof title, ')');
    console.log('Program Name:', program_name, '(type:', typeof program_name, ')');
    console.log('Deadline:', deadline, '(type:', typeof deadline, ')');
    console.log('Submission Type:', submission_type, '(type:', typeof submission_type, ')');
    console.log('Max Points:', max_points, '(type:', typeof max_points, ')');
    console.log('Lecturer ID:', lecturer_id, '(type:', typeof lecturer_id, ')');
    console.log('Lecturer Name:', lecturer_name, '(type:', typeof lecturer_name, ')');

    // Validate required fields
    if (!title || !program_name || !deadline) {
      console.error('❌ Missing required fields');
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: title, program_name, or deadline' 
      });
    }

    if (!lecturer_id || !lecturer_name) {
      console.error('❌ Missing lecturer information');
      console.error('Lecturer ID provided:', lecturer_id);
      console.error('Lecturer Name provided:', lecturer_name);
      return res.status(400).json({ 
        success: false, 
        error: 'Missing lecturer information. Please ensure you are logged in properly.' 
      });
    }

    // Convert lecturer_id to integer if it's a string
    const lecturerIdInt = parseInt(lecturer_id);
    if (isNaN(lecturerIdInt)) {
      console.error('❌ Invalid lecturer_id:', lecturer_id);
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid lecturer ID format' 
      });
    }

    console.log('✅ All validations passed. Looking up program_id...');
    console.log('Converted Lecturer ID:', lecturerIdInt);

    // Get program_id from program_name for precise targeting
    // CRITICAL: This ensures assignments are sent to the correct program ONLY
    // SUPPORTS BOTH REGULAR PROGRAMS AND SHORT-TERM PROGRAMS
    let programId = null;
    let isShortTermProgram = false;
    try {
      // First, try to find program by exact name match in regular programs
      const programResult = await pool.query(
        'SELECT id, name, lecturer_id FROM programs WHERE name = $1 LIMIT 1',
        [program_name]
      );
      
      if (programResult.rows.length > 0) {
        programId = programResult.rows[0].id;
        console.log('✅ Found regular program_id:', programId, 'for program:', program_name);
        
        // VALIDATION: Check if lecturer is assigned to this program
        const programLecturerId = programResult.rows[0].lecturer_id;
        if (programLecturerId && programLecturerId !== lecturerIdInt) {
          console.warn('⚠️ WARNING: Lecturer', lecturerIdInt, 'is creating assignment for program', program_name, 'but program is assigned to lecturer', programLecturerId);
          // Allow it but log warning - lecturer might be teaching multiple sections
        }
      } else {
        // If no exact match in regular programs, try case-insensitive search
        const programResultCaseInsensitive = await pool.query(
          'SELECT id, name FROM programs WHERE LOWER(name) = LOWER($1) LIMIT 1',
          [program_name]
        );
        
        if (programResultCaseInsensitive.rows.length > 0) {
          programId = programResultCaseInsensitive.rows[0].id;
          console.log('✅ Found regular program_id (case-insensitive):', programId, 'for program:', program_name);
        } else {
          // NOT FOUND IN REGULAR PROGRAMS - CHECK SHORT-TERM PROGRAMS
          console.log('🔍 Program not found in regular programs, checking short-term programs...');
          
          // Try exact match in short-term programs (match by title)
          const shortTermResult = await pool.query(
            'SELECT id, title FROM short_term_programs WHERE title = $1 LIMIT 1',
            [program_name]
          );
          
          if (shortTermResult.rows.length > 0) {
            programId = shortTermResult.rows[0].id;
            isShortTermProgram = true;
            console.log('✅ Found short-term program_id:', programId, 'for program:', program_name);
          } else {
            // Try case-insensitive match in short-term programs
            const shortTermResultCaseInsensitive = await pool.query(
              'SELECT id, title FROM short_term_programs WHERE LOWER(title) = LOWER($1) LIMIT 1',
              [program_name]
            );
            
            if (shortTermResultCaseInsensitive.rows.length > 0) {
              programId = shortTermResultCaseInsensitive.rows[0].id;
              isShortTermProgram = true;
              console.log('✅ Found short-term program_id (case-insensitive):', programId, 'for program:', program_name);
            } else {
              // NOT FOUND IN EITHER TABLE
              console.error('❌ CRITICAL: No program found with name:', program_name);
              console.error('   Checked both regular programs and short-term programs');
              console.error('   This assignment will NOT be visible to students!');
              console.error('   Available programs should be fetched from /api/lecturer-programs');
              
              return res.status(400).json({ 
                success: false, 
                error: `Program "${program_name}" not found in database. Please select a valid program from the dropdown.` 
              });
            }
          }
        }
      }
    } catch (err) {
      console.error('❌ Error looking up program_id:', err.message);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to validate program. Please try again.' 
      });
    }
    
    // Final validation: Ensure we have a program_id
    if (!programId) {
      console.error('❌ CRITICAL: program_id is null after lookup!');
      return res.status(400).json({ 
        success: false, 
        error: 'Failed to identify program. Please contact administrator.' 
      });
    }

    const result = await pool.query(`
      INSERT INTO assignments (
        title, description, program_id, program_name, deadline, submission_type, 
        max_points, lecturer_id, lecturer_name, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *
    `, [
      title, 
      description || '', 
      programId,
      program_name, 
      deadline, 
      submission_type || 'text', 
      max_points || 100, 
      lecturerIdInt, 
      lecturer_name, 
      'active'
    ]);

    console.log('✅ Assignment created successfully:', result.rows[0]);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('❌ Error creating assignment:', error);
    console.error('Error details:', error.message);
    console.error('Error stack:', error.stack);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get lecturer programs
app.get('/api/lecturer-programs', async (req, res) => {
  try {
    const { lecturer_id } = req.query;
    
    console.log('=== LECTURER PROGRAMS API DEBUG ===');
    console.log('Lecturer ID requested:', lecturer_id);
    
    // First get lecturer info
    const lecturerResult = await pool.query('SELECT * FROM lecturers WHERE id = $1', [lecturer_id]);
    console.log('Lecturer found:', lecturerResult.rows[0]);
    
    if (lecturerResult.rows.length === 0) {
      console.log('No lecturer found, returning empty');
      return res.json({ success: true, data: [] });
    }
    
    const lecturer = lecturerResult.rows[0];
    
    // Get programs assigned to this lecturer
    const result = await pool.query(`
      SELECT p.*, c.name as course_name, d.name as department_name, col.name as college_name
      FROM programs p
      LEFT JOIN courses c ON p.course_id = c.id
      LEFT JOIN departments d ON c.department_id = d.id
      LEFT JOIN colleges col ON d.college_id = col.id
      WHERE p.lecturer_id = $1 OR p.lecturer_name = $2
      ORDER BY p.name ASC
    `, [lecturer_id, lecturer.username]);

    console.log('Programs found:', result.rows);
    
    // If no programs found, create realistic fallback based on lecturer specialization
    if (result.rows.length === 0) {
      console.log('No programs in database, creating fallback based on specialization');
      
      let fallbackPrograms = [];
      const specialization = lecturer.specialization || 'Computer Science';
      
      if (specialization.toLowerCase().includes('computer')) {
        fallbackPrograms = [
          { id: 1, name: 'Introduction to Programming', lecturer_name: lecturer.username, course_name: 'Computer Science' },
          { id: 2, name: 'Data Structures and Algorithms', lecturer_name: lecturer.username, course_name: 'Computer Science' },
          { id: 3, name: 'Object-Oriented Programming', lecturer_name: lecturer.username, course_name: 'Computer Science' },
          { id: 4, name: 'Database Management Systems', lecturer_name: lecturer.username, course_name: 'Computer Science' }
        ];
      } else if (specialization.toLowerCase().includes('information')) {
        fallbackPrograms = [
          { id: 1, name: 'Information Systems Fundamentals', lecturer_name: lecturer.username, course_name: 'Information Technology' },
          { id: 2, name: 'Web Technologies', lecturer_name: lecturer.username, course_name: 'Information Technology' },
          { id: 3, name: 'System Analysis and Design', lecturer_name: lecturer.username, course_name: 'Information Technology' },
          { id: 4, name: 'Network Administration', lecturer_name: lecturer.username, course_name: 'Information Technology' }
        ];
      } else {
        fallbackPrograms = [
          { id: 1, name: 'General Programming', lecturer_name: lecturer.username, course_name: 'General Studies' },
          { id: 2, name: 'Software Development', lecturer_name: lecturer.username, course_name: 'General Studies' }
        ];
      }
      
      console.log('Fallback programs created:', fallbackPrograms);
      return res.json({ success: true, data: fallbackPrograms });
    }

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching lecturer programs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// REMOVED: Duplicate GET /api/assignments endpoint - already exists at line 1680 with better student filtering

// Get assignments for students
app.get('/api/student-assignments', async (req, res) => {
  try {
    const { student_program, student_id, student_username } = req.query;
    
    console.log('=== STUDENT ASSIGNMENTS API DEBUG ===');
    console.log('Student program requested:', student_program);
    console.log('Student ID:', student_id);
    console.log('Student username:', student_username);
    
    // First, auto-delete expired assignments
    await pool.query(`
      UPDATE assignments 
      SET status = 'expired' 
      WHERE deadline <= NOW() AND status = 'active'
    `);
    
    console.log('Auto-updated expired assignments');
    
    // IMPROVED: Get student's actual programs from database
    let studentProgramIds = [];
    let studentProgramNames = [];
    
    if (student_id || student_username) {
      try {
        // Get student info
        let studentQuery = '';
        let studentParams = [];
        
        if (student_id) {
          studentQuery = 'SELECT s.*, c.name as course_name FROM students s LEFT JOIN courses c ON s.course_id = c.id WHERE s.id = $1';
          studentParams = [student_id];
        } else {
          studentQuery = 'SELECT s.*, c.name as course_name FROM students s LEFT JOIN courses c ON s.course_id = c.id WHERE s.registration_number = $1 OR s.email = $1 OR s.name = $1';
          studentParams = [student_username];
        }
        
        const studentResult = await pool.query(studentQuery, studentParams);
        
        if (studentResult.rows.length > 0) {
          const studentInfo = studentResult.rows[0];
          
          // Get student's regular programs
          const programsResult = await pool.query(
            'SELECT id, name FROM programs WHERE course_id = $1',
            [studentInfo.course_id]
          );
          
          studentProgramIds = programsResult.rows.map(p => p.id);
          studentProgramNames = programsResult.rows.map(p => p.name);
          
          console.log('✅ Found student regular programs:', studentProgramNames);
          
          // Add short-term programs that student is eligible for
          try {
            const shortTermResult = await pool.query(
              'SELECT * FROM short_term_programs WHERE end_date > NOW()'
            );
            
            const eligibleShortTermPrograms = shortTermResult.rows.filter(program => {
              // Check targeting for short-term programs
              if (program.target_type === 'all') return true;
              if (program.target_type === 'college' && program.target_value === studentInfo.college_name) return true;
              if (program.target_type === 'department' && program.target_value === studentInfo.department_name) return true;
              if (program.target_type === 'course' && program.target_value === studentInfo.course_name) return true;
              if (program.target_type === 'year' && program.target_value === studentInfo.year_of_study) return true;
              if (program.target_type === 'program' && studentProgramNames.includes(program.target_value)) return true;
              return false;
            });
            
            // Add short-term program titles to student programs list
            const shortTermProgramNames = eligibleShortTermPrograms.map(p => p.title);
            studentProgramNames = [...studentProgramNames, ...shortTermProgramNames];
            console.log('✅ Added short-term programs:', shortTermProgramNames);
            console.log('   Total programs:', studentProgramNames.length);
          } catch (error) {
            console.log('⚠️ No short-term programs or error:', error.message);
          }
        }
      } catch (err) {
        console.error('Error fetching student programs:', err);
      }
    }
    
    // Query assignments based on program_id (most accurate)
    let result;
    
    if (studentProgramIds.length > 0) {
      result = await pool.query(`
        SELECT a.* FROM assignments a
        WHERE a.program_id = ANY($1)
        AND a.status = 'active' 
        AND a.deadline > NOW()
        ORDER BY a.deadline ASC
      `, [studentProgramIds]);
      
      console.log(`Found ${result.rows.length} assignments via program_id matching`);
    } else if (student_program) {
      // Fallback to exact name matching only (no fuzzy matching to prevent cross-program leakage)
      result = await pool.query(`
        SELECT a.* FROM assignments a
        WHERE LOWER(a.program_name) = LOWER($1)
        AND a.status = 'active' 
        AND a.deadline > NOW()
        ORDER BY a.deadline ASC
      `, [student_program]);
      
      console.log(`Found ${result.rows.length} assignments via program_name matching`);
    } else {
      result = { rows: [] };
      console.log('No student program information provided, returning empty array');
    }

    console.log('Assignments found for student:', result.rows);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching student assignments:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Auto cleanup expired assignments (can be called periodically)
app.post('/api/assignments/cleanup', async (req, res) => {
  try {
    console.log('=== AUTO CLEANUP EXPIRED ASSIGNMENTS ===');
    
    // Update expired assignments
    const expiredResult = await pool.query(`
      UPDATE assignments 
      SET status = 'expired' 
      WHERE deadline <= NOW() AND status = 'active'
      RETURNING *
    `);
    
    console.log('Expired assignments updated:', expiredResult.rows.length);
    
    res.json({ 
      success: true, 
      message: `${expiredResult.rows.length} assignments marked as expired`,
      expired_assignments: expiredResult.rows
    });
  } catch (error) {
    console.error('Error cleaning up assignments:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Submit assignment (upload endpoint moved to top of file before express.json middleware)
app.post('/api/assignment-submissions', async (req, res) => {
  try {
    const {
      assignment_id, student_id, student_name, student_registration,
      student_program, submission_type, text_content, file_path, file_name
    } = req.body;

    console.log('=== ASSIGNMENT SUBMISSION DEBUG ===');
    console.log('Submission data:', JSON.stringify(req.body, null, 2));
    
    // Validate required fields
    if (!assignment_id) {
      console.error('❌ Missing assignment_id');
      return res.status(400).json({ 
        success: false, 
        error: 'Assignment ID is required' 
      });
    }
    
    if (!student_id) {
      console.error('❌ Missing student_id');
      return res.status(400).json({ 
        success: false, 
        error: 'Student ID is required' 
      });
    }
    
    // CRITICAL FIX: Convert assignment_id to integer if it's a string
    // This handles cases where frontend sends "assignment_34" or "34"
    let assignmentIdInt = assignment_id;
    if (typeof assignment_id === 'string') {
      // Extract numeric part if string contains prefix like "assignment_34"
      const numericMatch = assignment_id.match(/\d+/);
      if (numericMatch) {
        assignmentIdInt = parseInt(numericMatch[0]);
        console.log(`✅ Converted assignment_id from "${assignment_id}" to ${assignmentIdInt}`);
      } else {
        console.error('❌ Invalid assignment_id format:', assignment_id);
        return res.status(400).json({ 
          success: false, 
          error: 'Invalid assignment ID format' 
        });
      }
    }
    
    // Validate that we have a valid integer
    if (isNaN(assignmentIdInt) || assignmentIdInt <= 0) {
      console.error('❌ Invalid assignment_id after conversion:', assignmentIdInt);
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid assignment ID' 
      });
    }
    
    // Check if assignment exists
    const assignmentCheck = await pool.query(
      'SELECT id FROM assignments WHERE id = $1',
      [assignmentIdInt]
    );
    
    if (assignmentCheck.rows.length === 0) {
      console.error('❌ Assignment not found:', assignment_id);
      return res.status(404).json({ 
        success: false, 
        error: 'Assignment not found' 
      });
    }
    
    console.log('✅ Assignment exists, proceeding with submission...');

    const result = await pool.query(`
      INSERT INTO assignment_submissions (
        assignment_id, student_id, student_name, student_registration,
        student_program, submission_type, text_content, file_path, file_name
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *
    `, [assignmentIdInt, student_id, student_name, student_registration, student_program, submission_type, text_content, file_path, file_name]);

    console.log('✅ Submission saved successfully:', result.rows[0]);
    res.json({ success: true, data: result.rows[0], message: 'Assignment submitted successfully' });
  } catch (error) {
    console.error('❌ Error submitting assignment:', error);
    console.error('Error details:', error.message);
    console.error('Error stack:', error.stack);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get assignment submissions for lecturer
app.get('/api/assignment-submissions', async (req, res) => {
  try {
    const { assignment_id, lecturer_id, student_id, student_name } = req.query;
    
    console.log('=== ASSIGNMENT SUBMISSIONS API DEBUG ===');
    console.log('Assignment ID requested:', assignment_id);
    console.log('Lecturer ID requested:', lecturer_id);
    console.log('Student ID requested:', student_id);
    console.log('Student Name requested:', student_name);
    
    let result;
    
    // SECURITY: If student_id or student_name provided, only return that student's submissions
    if (student_id || student_name) {
      let query;
      let params;
      
      if (student_id && assignment_id) {
        query = `
          SELECT s.*, a.title as assignment_title, a.program_name, a.deadline
          FROM assignment_submissions s
          LEFT JOIN assignments a ON s.assignment_id = a.id
          WHERE s.assignment_id = $1 AND s.student_id = $2 
          ORDER BY s.submitted_at DESC
        `;
        params = [assignment_id, student_id];
      } else if (student_id) {
        query = `
          SELECT s.*, a.title as assignment_title, a.program_name, a.deadline
          FROM assignment_submissions s
          LEFT JOIN assignments a ON s.assignment_id = a.id
          WHERE s.student_id = $1 
          ORDER BY s.submitted_at DESC
        `;
        params = [student_id];
      } else if (student_name) {
        query = `
          SELECT s.*, a.title as assignment_title, a.program_name, a.deadline
          FROM assignment_submissions s
          LEFT JOIN assignments a ON s.assignment_id = a.id
          WHERE s.student_name = $1 
          ORDER BY s.submitted_at DESC
        `;
        params = [student_name];
      }
      
      result = await pool.query(query, params);
      console.log('Found submissions for student:', result.rows.length);
      return res.json({ success: true, data: result.rows });
    }
    
    if (assignment_id) {
      // Get submissions for specific assignment (lecturer view)
      result = await pool.query(`
        SELECT * FROM assignment_submissions 
        WHERE assignment_id = $1 ORDER BY submitted_at DESC
      `, [assignment_id]);
    } else if (lecturer_id) {
      // Get all submissions for lecturer's assignments
      result = await pool.query(`
        SELECT s.*, a.title as assignment_title, a.program_name
        FROM assignment_submissions s
        JOIN assignments a ON s.assignment_id = a.id
        WHERE a.lecturer_id = $1
        ORDER BY s.submitted_at DESC
      `, [lecturer_id]);
    } else {
      // SECURITY: Require at least one filter parameter
      console.log('No filter provided, returning empty array');
      return res.json({ success: true, data: [] });
    }

    console.log('Submissions found:', result.rows.length);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching assignment submissions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete assignment submission (student can delete their own submission)
app.delete('/api/assignment-submissions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('=== DELETE ASSIGNMENT SUBMISSION DEBUG ===');
    console.log('Submission ID to delete:', id);
    
    // Delete the submission
    const result = await pool.query('DELETE FROM assignment_submissions WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Submission not found' });
    }
    
    console.log('Submission deleted successfully:', result.rows[0]);
    res.json({ success: true, message: 'Submission deleted successfully', data: result.rows[0] });
  } catch (error) {
    console.error('Error deleting submission:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete assignment
app.delete('/api/assignments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('=== DELETE ASSIGNMENT DEBUG ===');
    console.log('Assignment ID to delete:', id);
    
    // First delete all submissions for this assignment
    await pool.query('DELETE FROM assignment_submissions WHERE assignment_id = $1', [id]);
    
    // Then delete the assignment
    const result = await pool.query('DELETE FROM assignments WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Assignment not found' });
    }
    
    console.log('Assignment deleted successfully:', result.rows[0]);
    res.json({ success: true, message: 'Assignment deleted successfully', data: result.rows[0] });
  } catch (error) {
    console.error('Error deleting assignment:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update assignment
app.put('/api/assignments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, program_name, deadline, submission_type, max_points } = req.body;
    
    console.log('=== UPDATE ASSIGNMENT DEBUG ===');
    console.log('Assignment ID to update:', id);
    console.log('Update data:', req.body);
    
    const result = await pool.query(`
      UPDATE assignments 
      SET title = $1, description = $2, program_name = $3, deadline = $4, 
          submission_type = $5, max_points = $6
      WHERE id = $7 
      RETURNING *
    `, [title, description, program_name, deadline, submission_type, max_points, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Assignment not found' });
    }
    
    console.log('Assignment updated successfully:', result.rows[0]);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error updating assignment:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== LIVE CLASSROOM ENDPOINTS ====================

// Create live classes table
const initializeLiveClassesTable = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS live_classes (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        program_name VARCHAR(255) NOT NULL,
        date DATE NOT NULL,
        time TIME NOT NULL,
        duration INTEGER DEFAULT 60,
        lecturer_id INTEGER,
        lecturer_name VARCHAR(255),
        room_id VARCHAR(255) UNIQUE NOT NULL,
        status VARCHAR(50) DEFAULT 'scheduled',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        started_at TIMESTAMP,
        ended_at TIMESTAMP
      )
    `);
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS live_class_participants (
        id SERIAL PRIMARY KEY,
        class_id INTEGER REFERENCES live_classes(id) ON DELETE CASCADE,
        student_id INTEGER,
        student_name VARCHAR(255),
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        left_at TIMESTAMP,
        status VARCHAR(50) DEFAULT 'joined'
      )
    `);
    
    console.log('Live classes tables initialized');
  } catch (error) {
    console.error('Error initializing live classes tables:', error);
  }
};

// Create live class
app.post('/api/live-classes', async (req, res) => {
  try {
    const { title, description, program_name, date, time, duration, lecturer_id, lecturer_name, room_id, status, meeting_url } = req.body;
    
    console.log('=== CREATE LIVE CLASS DEBUG ===');
    console.log('Class data received:', req.body);
    
    // Add meeting_url column if it doesn't exist
    try {
      await pool.query(`
        ALTER TABLE live_classes ADD COLUMN IF NOT EXISTS meeting_url TEXT
      `);
    } catch (alterError) {
      console.log('Column meeting_url might already exist:', alterError.message);
    }
    
    // Generate room_id if not provided
    const finalRoomId = room_id || `room_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    
    const result = await pool.query(`
      INSERT INTO live_classes (title, description, program_name, date, time, duration, lecturer_id, lecturer_name, room_id, status, meeting_url)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [title, description, program_name, date, time, duration, lecturer_id, lecturer_name, finalRoomId, status || 'scheduled', meeting_url]);
    
    console.log('Live class created:', result.rows[0]);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error creating live class:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get live classes with student-specific program filtering
app.get('/api/live-classes', async (req, res) => {
  try {
    const { lecturer_name, student_course, student_id, student_username } = req.query;
    
    console.log('=== GET LIVE CLASSES DEBUG ===');
    console.log('Lecturer Name:', lecturer_name);
    console.log('Student Course:', student_course);
    console.log('Student ID:', student_id);
    console.log('Student Username:', student_username);
    
    // If lecturer_name provided, return only that lecturer's classes (for lecturer view)
    if (lecturer_name && !student_id && !student_username) {
      const result = await pool.query(
        'SELECT * FROM live_classes WHERE lecturer_name = $1 ORDER BY date ASC, time ASC',
        [lecturer_name]
      );
      console.log('Live classes found for lecturer:', result.rows.length);
      return res.json({ success: true, data: result.rows });
    }
    
    // If no student info provided, return all classes (for admin view)
    if (!student_id && !student_username) {
      const result = await pool.query('SELECT * FROM live_classes ORDER BY date ASC, time ASC');
      console.log('Live classes found (no filter):', result.rows.length);
      return res.json({ success: true, data: result.rows });
    }
    
    // Get student information - INCLUDING college and department for short-term targeting
    let studentInfo = null;
    if (student_id) {
      const studentResult = await pool.query(`
        SELECT s.*, 
               c.name as course_name,
               d.name as department_name,
               col.name as college_name
        FROM students s
        LEFT JOIN courses c ON s.course_id = c.id
        LEFT JOIN departments d ON c.department_id = d.id
        LEFT JOIN colleges col ON d.college_id = col.id
        WHERE s.id = $1
      `, [student_id]);
      
      if (studentResult.rows.length > 0) {
        studentInfo = studentResult.rows[0];
      }
    } else if (student_username) {
      console.log('Looking up student by username for live classes:', student_username);
      const studentResult = await pool.query(`
        SELECT s.*, 
               c.name as course_name,
               d.name as department_name,
               col.name as college_name
        FROM students s
        LEFT JOIN courses c ON s.course_id = c.id
        LEFT JOIN departments d ON c.department_id = d.id
        LEFT JOIN colleges col ON d.college_id = col.id
        WHERE s.registration_number = $1 OR s.email = $1 OR s.name = $1 OR LOWER(s.registration_number) = LOWER($1)
      `, [student_username]);
      
      console.log('Student lookup result for live classes:', studentResult.rows.length > 0 ? 'Found' : 'Not found');
      
      if (studentResult.rows.length > 0) {
        studentInfo = studentResult.rows[0];
      }
    }
    
    // FIXED: Check if student is enrolled in any short-term programs directly
    // This handles cases where student enrolled via short-term enrollment system
    let studentShortTermEnrollments = [];
    if (studentInfo) {
      try {
        const enrollmentCheck = await pool.query(`
          SELECT stp.id, stp.title, stp.target_type, stp.target_value
          FROM short_term_enrollments ste
          JOIN short_term_programs stp ON ste.program_id = stp.id
          WHERE ste.student_id = $1
        `, [studentInfo.id]);
        studentShortTermEnrollments = enrollmentCheck.rows;
        console.log('Student Short-Term Enrollments:', studentShortTermEnrollments.length);
      } catch (enrollErr) {
        console.log('Short-term enrollments check skipped:', enrollErr.message);
      }
    }
    
    if (!studentInfo) {
      console.log('Student not found for live classes, returning empty array. Username:', student_username);
      return res.json({ success: true, data: [] });
    }
    
    console.log('=== STUDENT INFO FOR LIVE CLASSES ===');
    console.log('Student ID:', studentInfo.id);
    console.log('Student Name:', studentInfo.name);
    console.log('Course ID:', studentInfo.course_id);
    console.log('Course Name:', studentInfo.course_name);
    console.log('Department Name:', studentInfo.department_name);
    console.log('College Name:', studentInfo.college_name);
    
    // CRITICAL FIX: ALWAYS try to look up department/college info if missing
    // This handles cases where JOIN doesn't work due to NULL foreign keys
    if (studentInfo.course_id) {
      // First, get course info
      if (!studentInfo.course_name) {
        try {
          const courseResult = await pool.query('SELECT name FROM courses WHERE id = $1', [studentInfo.course_id]);
          if (courseResult.rows.length > 0) {
            studentInfo.course_name = courseResult.rows[0].name;
            console.log('   ✅ Found course_name via direct lookup:', studentInfo.course_name);
          }
        } catch (err) { console.log('Course lookup failed:', err.message); }
      }
      
      // Then, get department info via course
      if (!studentInfo.department_name) {
        try {
          const deptResult = await pool.query(`
            SELECT d.name as department_name, d.college_id
            FROM courses c
            JOIN departments d ON c.department_id = d.id
            WHERE c.id = $1
          `, [studentInfo.course_id]);
          if (deptResult.rows.length > 0) {
            studentInfo.department_name = deptResult.rows[0].department_name;
            studentInfo._college_id = deptResult.rows[0].college_id; // Store for college lookup
            console.log('   ✅ Found department_name via direct lookup:', studentInfo.department_name);
          }
        } catch (err) { console.log('Department lookup failed:', err.message); }
      }
      
      // Finally, get college info via department
      if (!studentInfo.college_name) {
        try {
          // Try via stored college_id first
          if (studentInfo._college_id) {
            const collegeResult = await pool.query('SELECT name FROM colleges WHERE id = $1', [studentInfo._college_id]);
            if (collegeResult.rows.length > 0) {
              studentInfo.college_name = collegeResult.rows[0].name;
              console.log('   ✅ Found college_name via stored college_id:', studentInfo.college_name);
            }
          }
          
          // If still no college, try full chain lookup
          if (!studentInfo.college_name) {
            const collegeResult = await pool.query(`
              SELECT col.name as college_name
              FROM courses c
              JOIN departments d ON c.department_id = d.id
              JOIN colleges col ON d.college_id = col.id
              WHERE c.id = $1
            `, [studentInfo.course_id]);
            if (collegeResult.rows.length > 0) {
              studentInfo.college_name = collegeResult.rows[0].college_name;
              console.log('   ✅ Found college_name via chain lookup:', studentInfo.college_name);
            }
          }
        } catch (err) { console.log('College lookup failed:', err.message); }
      }
      
      console.log('=== FINAL STUDENT INFO AFTER LOOKUPS ===');
      console.log('Course Name:', studentInfo.course_name);
      console.log('Department Name:', studentInfo.department_name);
      console.log('College Name:', studentInfo.college_name);
    }
    
    // Get student's regular programs
    const programsResult = await pool.query(
      'SELECT name FROM programs WHERE course_id = $1',
      [studentInfo.course_id]
    );
    const studentPrograms = programsResult.rows.map(p => p.name);
    
    console.log('Student Regular Programs:', studentPrograms);
    
    // Get student's short-term programs (based on targeting)
    // FIXED: Include ALL short-term programs - filtering will happen later based on targeting
    // This ensures we don't miss any short-term programs due to naming mismatches
    const shortTermResult = await pool.query(
      `SELECT * FROM short_term_programs 
       ORDER BY created_at DESC`
    );
    
    console.log('=== SHORT-TERM PROGRAMS FOR LIVE CLASSES ===');
    console.log('Total Short-Term Programs:', shortTermResult.rows.length);
    
    // Also check if student is enrolled in any short-term programs via short_term_enrollments table
    let enrolledShortTermPrograms = [];
    try {
      const enrollmentResult = await pool.query(
        `SELECT stp.title FROM short_term_enrollments ste
         JOIN short_term_programs stp ON ste.program_id = stp.id
         WHERE ste.student_id = $1 AND stp.end_date > NOW()`,
        [studentInfo.id]
      );
      enrolledShortTermPrograms = enrollmentResult.rows.map(r => r.title);
      console.log('Enrolled Short-Term Programs:', enrolledShortTermPrograms);
    } catch (enrollError) {
      console.log('No short_term_enrollments table or error:', enrollError.message);
    }
    
    // FIXED: Also add programs from studentShortTermEnrollments (checked earlier)
    if (studentShortTermEnrollments && studentShortTermEnrollments.length > 0) {
      const additionalEnrolled = studentShortTermEnrollments.map(e => e.title);
      enrolledShortTermPrograms = [...new Set([...enrolledShortTermPrograms, ...additionalEnrolled])];
      console.log('Combined Enrolled Short-Term Programs:', enrolledShortTermPrograms);
    }
    
    // Filter short-term programs based on targeting
    const studentShortTermPrograms = shortTermResult.rows.filter(program => {
      console.log(`\n--- Checking Short-Term Program: "${program.title}" ---`);
      console.log('   Target Type:', program.target_type);
      console.log('   Target Value:', program.target_value);
      console.log('   Student College:', studentInfo.college_name);
      console.log('   Student Department:', studentInfo.department_name);
      console.log('   Student Course:', studentInfo.course_name);
      
      // Check if student is directly enrolled in this short-term program
      if (enrolledShortTermPrograms.includes(program.title)) {
        console.log('   ✅ MATCH: Student directly enrolled');
        return true;
      }
      
      // Check targeting - treat null/undefined/empty as 'all'
      if (!program.target_type || program.target_type === 'all' || program.target_type === '') {
        console.log('   ✅ MATCH: All students (target_type:', program.target_type, ')');
        return true;
      }
      
      // College targeting - only match if student has college_name
      if (program.target_type === 'college') {
        if (studentInfo.college_name && program.target_value === studentInfo.college_name) {
          console.log('   ✅ MATCH: College targeting');
          return true;
        }
        // Also check case-insensitive match
        if (studentInfo.college_name && program.target_value?.toLowerCase() === studentInfo.college_name?.toLowerCase()) {
          console.log('   ✅ MATCH: College targeting (case-insensitive)');
          return true;
        }
        // FIXED: Also check partial match for college names
        if (studentInfo.college_name && program.target_value && (
          studentInfo.college_name.toLowerCase().includes(program.target_value.toLowerCase()) ||
          program.target_value.toLowerCase().includes(studentInfo.college_name.toLowerCase())
        )) {
          console.log('   ✅ MATCH: College targeting (partial match)');
          return true;
        }
      }
      
      // Department targeting - only match if student has department_name
      if (program.target_type === 'department') {
        if (studentInfo.department_name && program.target_value === studentInfo.department_name) {
          console.log('   ✅ MATCH: Department targeting');
          return true;
        }
        // Also check case-insensitive match
        if (studentInfo.department_name && program.target_value?.toLowerCase() === studentInfo.department_name?.toLowerCase()) {
          console.log('   ✅ MATCH: Department targeting (case-insensitive)');
          return true;
        }
        // FIXED: Also check partial match for department names
        if (studentInfo.department_name && program.target_value && (
          studentInfo.department_name.toLowerCase().includes(program.target_value.toLowerCase()) ||
          program.target_value.toLowerCase().includes(studentInfo.department_name.toLowerCase())
        )) {
          console.log('   ✅ MATCH: Department targeting (partial match)');
          return true;
        }
      }
      
      // Course targeting - match by course_name
      if (program.target_type === 'course') {
        if (studentInfo.course_name && program.target_value === studentInfo.course_name) {
          console.log('   ✅ MATCH: Course targeting');
          return true;
        }
        // Also check case-insensitive match
        if (studentInfo.course_name && program.target_value?.toLowerCase() === studentInfo.course_name?.toLowerCase()) {
          console.log('   ✅ MATCH: Course targeting (case-insensitive)');
          return true;
        }
        // Also check partial match for course names
        if (studentInfo.course_name && program.target_value && (
          studentInfo.course_name.toLowerCase().includes(program.target_value.toLowerCase()) ||
          program.target_value.toLowerCase().includes(studentInfo.course_name.toLowerCase())
        )) {
          console.log('   ✅ MATCH: Course targeting (partial match)');
          return true;
        }
      }
      
      // Year targeting with proper type conversion
      if (program.target_type === 'year') {
        const targetYear = String(program.target_value);
        const studentYear = String(studentInfo.year_of_study);
        if (targetYear === studentYear) {
          console.log('   ✅ MATCH: Year targeting');
          return true;
        }
      }
      
      // Program targeting - match by course name or regular programs
      if (program.target_type === 'program') {
        // First check if target_value matches student's course name
        if (studentInfo.course_name && (
          program.target_value === studentInfo.course_name ||
          program.target_value?.toLowerCase() === studentInfo.course_name?.toLowerCase() ||
          studentInfo.course_name.toLowerCase().includes(program.target_value?.toLowerCase()) ||
          program.target_value?.toLowerCase().includes(studentInfo.course_name?.toLowerCase())
        )) {
          console.log('   ✅ MATCH: Program targeting (course name match)');
          return true;
        }
        // Also check regular programs
        const programMatch = studentPrograms.some(p => 
          p === program.target_value ||
          p?.toLowerCase().includes(program.target_value?.toLowerCase()) ||
          program.target_value?.toLowerCase().includes(p?.toLowerCase())
        );
        if (programMatch) {
          console.log('   ✅ MATCH: Program targeting');
          return true;
        }
      }
      
      // Short-term course targeting - match by short-term program title
      // This handles cases where target_type is 'short-term' or similar
      if (program.target_type === 'short-term' || program.target_type === 'short_term' || program.target_type === 'shortterm') {
        // For short-term targeting, check if student is enrolled
        if (enrolledShortTermPrograms.includes(program.title)) {
          console.log('   ✅ MATCH: Short-term course targeting');
          return true;
        }
      }
      
      // FALLBACK: If student has course_id but no department_name/college_name,
      // try to match by looking up the course's department/college directly
      if ((program.target_type === 'department' || program.target_type === 'college') && 
          studentInfo.course_id && 
          (!studentInfo.department_name || !studentInfo.college_name)) {
        console.log('   ⚠️ Attempting fallback lookup for department/college targeting...');
        // This will be handled in the live class filtering section with direct DB lookup
        // For now, we'll mark this as a potential match to be verified later
      }
      
      console.log('   ❌ NO MATCH');
      return false;
    }).map(p => p.title);
    
    console.log('Student Short-Term Programs:', studentShortTermPrograms);
    
    // Combine all student programs (regular + short-term + enrolled short-term)
    const allStudentPrograms = [...new Set([...studentPrograms, ...studentShortTermPrograms, ...enrolledShortTermPrograms])];
    console.log('All Student Programs (Regular + Short-Term):', allStudentPrograms);
    
    // Fetch all live classes
    const liveClassesResult = await pool.query('SELECT * FROM live_classes ORDER BY date ASC, time ASC');
    
    console.log('=== ALL LIVE CLASSES IN DATABASE ===');
    console.log('Total Live Classes:', liveClassesResult.rows.length);
    liveClassesResult.rows.forEach(lc => {
      console.log(`  - "${lc.title}" (Program: ${lc.program_name}, Status: ${lc.status})`);
    });
    
    console.log('=== SHORT-TERM PROGRAMS AVAILABLE ===');
    console.log('Total Short-Term Programs:', shortTermResult.rows.length);
    shortTermResult.rows.forEach(stp => {
      console.log(`  - "${stp.title}" (Target: ${stp.target_type}=${stp.target_value}, End: ${stp.end_date})`);
    });
    
    // Filter live classes based on student's programs (regular + short-term)
    const filteredLiveClasses = liveClassesResult.rows.filter(liveClass => {
      console.log(`\n--- Checking Live Class: "${liveClass.title}" (Program: ${liveClass.program_name}, Status: ${liveClass.status}) ---`);
      
      // Check if live class program matches any of student's programs
      const programMatch = allStudentPrograms.some(program => {
        if (!program || !liveClass.program_name) return false;
        
        const programLower = program.toLowerCase().trim();
        const liveClassProgramLower = liveClass.program_name.toLowerCase().trim();
        
        // Exact match
        if (programLower === liveClassProgramLower) {
          console.log(`✅ Live Class "${liveClass.title}" - Exact program match: ${liveClass.program_name}`);
          return true;
        }
        
        // Contains match
        if (programLower.includes(liveClassProgramLower) || liveClassProgramLower.includes(programLower)) {
          console.log(`✅ Live Class "${liveClass.title}" - Partial program match: ${liveClass.program_name}`);
          return true;
        }
        
        // Word-based matching
        const programWords = programLower.split(/\s+/);
        const liveClassWords = liveClassProgramLower.split(/\s+/);
        const commonWords = programWords.filter(word => 
          word.length > 3 && liveClassWords.includes(word)
        );
        
        if (commonWords.length >= 2) {
          console.log(`✅ Live Class "${liveClass.title}" - Word match: ${liveClass.program_name}`);
          return true;
        }
        
        return false;
      });
      
      // If no program match, check if this live class is for a short-term program
      // and if the student qualifies based on the short-term program's targeting
      if (!programMatch) {
        // FIXED: More flexible matching for short-term programs
        const liveClassProgramLower = liveClass.program_name?.toLowerCase().trim() || '';
        
        const shortTermProgram = shortTermResult.rows.find(stp => {
          const stpTitleLower = stp.title?.toLowerCase().trim() || '';
          
          // Exact match
          if (stpTitleLower === liveClassProgramLower) return true;
          
          // Contains match (either direction)
          if (stpTitleLower.includes(liveClassProgramLower) || liveClassProgramLower.includes(stpTitleLower)) return true;
          
          // Word-based matching for multi-word titles
          const stpWords = stpTitleLower.split(/\s+/).filter(w => w.length > 2);
          const lcWords = liveClassProgramLower.split(/\s+/).filter(w => w.length > 2);
          const commonWords = stpWords.filter(word => lcWords.includes(word));
          if (commonWords.length >= 1 && commonWords.length >= Math.min(stpWords.length, lcWords.length) * 0.5) return true;
          
          return false;
        });
        
        if (shortTermProgram) {
          console.log(`\n--- Checking Short-Term Live Class: "${liveClass.title}" for program "${shortTermProgram.title}" ---`);
          console.log('   Target Type:', shortTermProgram.target_type);
          console.log('   Target Value:', shortTermProgram.target_value);
          console.log('   Student College:', studentInfo.college_name);
          console.log('   Student Department:', studentInfo.department_name);
          console.log('   Student Course:', studentInfo.course_name);
          
          // Check if student qualifies for this short-term program
          let qualifies = false;
          
          // IMPORTANT: If target_type is 'all', null, undefined, or empty - show to ALL students
          if (!shortTermProgram.target_type || shortTermProgram.target_type === 'all' || shortTermProgram.target_type === '' || shortTermProgram.target_type === null) {
            console.log('   ✅ Short-term program targets ALL students (target_type:', shortTermProgram.target_type, ')');
            qualifies = true;
          }
          // Check if student is directly enrolled
          else if (enrolledShortTermPrograms.includes(shortTermProgram.title)) {
            console.log('   ✅ Student directly enrolled in short-term program');
            qualifies = true;
          }
          // COURSES targeting - CRITICAL FIX: This is the most common case for short-term programs
          else if (shortTermProgram.target_type === 'courses' || shortTermProgram.target_type === 'course') {
            console.log('   🔍 Checking COURSES targeting...');
            console.log('      Target Value:', shortTermProgram.target_value);
            console.log('      Student Course:', studentInfo.course_name);
            console.log('      Student College:', studentInfo.college_name);
            console.log('      Student Department:', studentInfo.department_name);
            
            // CRITICAL: For "courses" targeting, target_value can contain:
            // 1. Single course name (e.g., "Computer Science")
            // 2. Multiple course names separated by comma (e.g., "Computer Science, Information Technology")
            // 3. Course ID or partial name
            if (studentInfo.course_name && shortTermProgram.target_value) {
              const targetLower = shortTermProgram.target_value.toLowerCase().trim();
              const courseLower = studentInfo.course_name.toLowerCase().trim();
              
              // Check if target_value contains multiple courses (comma-separated)
              const targetCourses = targetLower.split(',').map(c => c.trim()).filter(c => c.length > 0);
              
              for (const targetCourse of targetCourses) {
                // Exact match
                if (targetCourse === courseLower) {
                  console.log('   ✅ COURSES targeting - Exact match');
                  qualifies = true;
                  break;
                }
                // Partial match (either direction)
                if (targetCourse.includes(courseLower) || courseLower.includes(targetCourse)) {
                  console.log('   ✅ COURSES targeting - Partial match');
                  qualifies = true;
                  break;
                }
                // Word-based matching
                const targetWords = targetCourse.split(/\s+/).filter(w => w.length > 2);
                const courseWords = courseLower.split(/\s+/).filter(w => w.length > 2);
                const commonWords = targetWords.filter(word => courseWords.includes(word));
                if (commonWords.length >= 1) {
                  console.log('   ✅ COURSES targeting - Word match:', commonWords);
                  qualifies = true;
                  break;
                }
              }
            }
            
            // FALLBACK: If no course match, check if student's regular programs match
            if (!qualifies && studentPrograms && studentPrograms.length > 0) {
              const targetLower = shortTermProgram.target_value?.toLowerCase().trim() || '';
              const programMatch = studentPrograms.some(p => {
                if (!p) return false;
                const pLower = p.toLowerCase().trim();
                return pLower === targetLower || 
                       pLower.includes(targetLower) || 
                       targetLower.includes(pLower);
              });
              if (programMatch) {
                console.log('   ✅ COURSES targeting - Program name match');
                qualifies = true;
              }
            }
            
            if (!qualifies) {
              console.log('   ❌ COURSES targeting - No match');
            }
          }
          // College targeting - FIXED: Added partial match
          else if (shortTermProgram.target_type === 'college') {
            console.log('   🔍 Checking COLLEGE targeting...');
            if (studentInfo.college_name && shortTermProgram.target_value) {
              const targetLower = shortTermProgram.target_value.toLowerCase().trim();
              const collegeLower = studentInfo.college_name.toLowerCase().trim();
              
              if (targetLower === collegeLower || 
                  collegeLower.includes(targetLower) || 
                  targetLower.includes(collegeLower)) {
                console.log('   ✅ Student college matches short-term program target');
                qualifies = true;
              }
            }
            if (!qualifies) {
              console.log('   ❌ COLLEGE targeting - No match or missing data');
            }
          }
          // Department targeting - FIXED: Added partial match
          else if (shortTermProgram.target_type === 'department') {
            console.log('   🔍 Checking DEPARTMENT targeting...');
            if (studentInfo.department_name && shortTermProgram.target_value) {
              const targetLower = shortTermProgram.target_value.toLowerCase().trim();
              const deptLower = studentInfo.department_name.toLowerCase().trim();
              
              if (targetLower === deptLower || 
                  deptLower.includes(targetLower) || 
                  targetLower.includes(deptLower)) {
                console.log('   ✅ Student department matches short-term program target');
                qualifies = true;
              }
            }
            if (!qualifies) {
              console.log('   ❌ DEPARTMENT targeting - No match or missing data');
            }
          }
          // Year targeting
          else if (shortTermProgram.target_type === 'year') {
            console.log('   🔍 Checking YEAR targeting...');
            if (String(shortTermProgram.target_value) === String(studentInfo.year_of_study)) {
              console.log('   ✅ Student year matches short-term program target');
              qualifies = true;
            } else {
              console.log('   ❌ YEAR targeting - No match');
            }
          }
          // Program targeting - match by course name or regular programs
          else if (shortTermProgram.target_type === 'program') {
            console.log('   🔍 Checking PROGRAM targeting...');
            // First check if target_value matches student's course name
            if (studentInfo.course_name && shortTermProgram.target_value) {
              const targetLower = shortTermProgram.target_value.toLowerCase().trim();
              const courseLower = studentInfo.course_name.toLowerCase().trim();
              
              if (targetLower === courseLower || 
                  courseLower.includes(targetLower) || 
                  targetLower.includes(courseLower)) {
                console.log('   ✅ Student course matches short-term program target (program type)');
                qualifies = true;
              }
            }
            // Also check regular programs
            if (!qualifies) {
              const programTargetMatch = studentPrograms.some(p => {
                if (!p || !shortTermProgram.target_value) return false;
                const pLower = p.toLowerCase().trim();
                const targetLower = shortTermProgram.target_value.toLowerCase().trim();
                return pLower === targetLower || 
                       pLower.includes(targetLower) || 
                       targetLower.includes(pLower);
              });
              if (programTargetMatch) {
                console.log('   ✅ Student program matches short-term program target');
                qualifies = true;
              }
            }
            if (!qualifies) {
              console.log('   ❌ PROGRAM targeting - No match');
            }
          }
          
          if (qualifies) {
            console.log(`✅ Live Class "${liveClass.title}" - Short-term program targeting match`);
            return true;
          } else {
            console.log(`❌ Live Class "${liveClass.title}" - Student does NOT qualify for this short-term program`);
          }
        } else {
          // Short-term program not found by flexible matching - try direct exact match
          console.log(`⚠️ Live Class "${liveClass.title}" - Short-term program "${liveClass.program_name}" not found by flexible matching`);
          
          // Find the exact short-term program by title
          const exactShortTermProgram = shortTermResult.rows.find(stp => 
            stp.title?.toLowerCase().trim() === liveClass.program_name?.toLowerCase().trim()
          );
          
          if (exactShortTermProgram) {
            console.log(`\n--- Found Exact Short-Term Program: "${exactShortTermProgram.title}" ---`);
            console.log('   Target Type:', exactShortTermProgram.target_type);
            console.log('   Target Value:', exactShortTermProgram.target_value);
            
            // FIXED: Check targeting for this short-term program
            let qualifiesExact = false;
            
            // If target_type is 'all', null, undefined, or empty - show to ALL students
            if (!exactShortTermProgram.target_type || exactShortTermProgram.target_type === 'all' || exactShortTermProgram.target_type === '' || exactShortTermProgram.target_type === null) {
              console.log('   ✅ Short-term program targets ALL students');
              qualifiesExact = true;
            }
            // Check if student is directly enrolled
            else if (enrolledShortTermPrograms.includes(exactShortTermProgram.title)) {
              console.log('   ✅ Student directly enrolled in short-term program');
              qualifiesExact = true;
            }
            // College targeting - FIXED: Added partial match
            else if (exactShortTermProgram.target_type === 'college') {
              if (studentInfo.college_name && 
                  (exactShortTermProgram.target_value === studentInfo.college_name ||
                   exactShortTermProgram.target_value?.toLowerCase() === studentInfo.college_name?.toLowerCase() ||
                   studentInfo.college_name.toLowerCase().includes(exactShortTermProgram.target_value?.toLowerCase()) ||
                   exactShortTermProgram.target_value?.toLowerCase().includes(studentInfo.college_name?.toLowerCase()))) {
                console.log('   ✅ Student college matches short-term program target');
                qualifiesExact = true;
              }
            }
            // Department targeting - FIXED: Added partial match
            else if (exactShortTermProgram.target_type === 'department') {
              if (studentInfo.department_name && 
                  (exactShortTermProgram.target_value === studentInfo.department_name ||
                   exactShortTermProgram.target_value?.toLowerCase() === studentInfo.department_name?.toLowerCase() ||
                   studentInfo.department_name.toLowerCase().includes(exactShortTermProgram.target_value?.toLowerCase()) ||
                   exactShortTermProgram.target_value?.toLowerCase().includes(studentInfo.department_name?.toLowerCase()))) {
                console.log('   ✅ Student department matches short-term program target');
                qualifiesExact = true;
              }
            }
            // Course targeting
            else if (exactShortTermProgram.target_type === 'course') {
              if (studentInfo.course_name && 
                  (exactShortTermProgram.target_value === studentInfo.course_name ||
                   exactShortTermProgram.target_value?.toLowerCase() === studentInfo.course_name?.toLowerCase() ||
                   studentInfo.course_name.toLowerCase().includes(exactShortTermProgram.target_value?.toLowerCase()) ||
                   exactShortTermProgram.target_value?.toLowerCase().includes(studentInfo.course_name?.toLowerCase()))) {
                console.log('   ✅ Student course matches short-term program target');
                qualifiesExact = true;
              }
            }
            // Year targeting
            else if (exactShortTermProgram.target_type === 'year') {
              if (String(exactShortTermProgram.target_value) === String(studentInfo.year_of_study)) {
                console.log('   ✅ Student year matches short-term program target');
                qualifiesExact = true;
              }
            }
            // Program targeting - match by course name or regular programs
            else if (exactShortTermProgram.target_type === 'program') {
              // Check if target_value matches student's course name
              if (studentInfo.course_name && 
                  (exactShortTermProgram.target_value === studentInfo.course_name ||
                   exactShortTermProgram.target_value?.toLowerCase() === studentInfo.course_name?.toLowerCase() ||
                   studentInfo.course_name.toLowerCase().includes(exactShortTermProgram.target_value?.toLowerCase()) ||
                   exactShortTermProgram.target_value?.toLowerCase().includes(studentInfo.course_name?.toLowerCase()))) {
                console.log('   ✅ Student course matches short-term program target (program type)');
                qualifiesExact = true;
              }
              // Also check regular programs
              else {
                const programTargetMatch = studentPrograms.some(p => 
                  p === exactShortTermProgram.target_value ||
                  p?.toLowerCase().includes(exactShortTermProgram.target_value?.toLowerCase()) ||
                  exactShortTermProgram.target_value?.toLowerCase().includes(p?.toLowerCase())
                );
                if (programTargetMatch) {
                  console.log('   ✅ Student program matches short-term program target');
                  qualifiesExact = true;
                }
              }
            }
            
            if (qualifiesExact) {
              console.log(`✅ Live Class "${liveClass.title}" - Exact short-term program match with targeting`);
              return true;
            } else {
              console.log(`❌ Live Class "${liveClass.title}" - Student does not qualify for short-term program targeting`);
            }
          } else {
            // Not found in short-term programs at all - check if it's a regular program
            const isRegularProgram = studentPrograms.some(p => 
              p?.toLowerCase().trim() === liveClass.program_name?.toLowerCase().trim()
            );
            
            if (!isRegularProgram) {
              // This might be a new short-term program not yet in database
              // For safety, don't show it (could be targeting specific students)
              console.log(`❌ Live Class "${liveClass.title}" - Program "${liveClass.program_name}" not found in any program list`);
            }
          }
        }
        
        console.log(`❌ Live Class "${liveClass.title}" - No program match: ${liveClass.program_name}`);
      }
      
      return programMatch;
    });
    
    console.log(`Filtered ${filteredLiveClasses.length} live classes for student (including short-term programs)`);
    res.json({ success: true, data: filteredLiveClasses });
  } catch (error) {
    console.error('Error fetching live classes:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete live class
app.delete('/api/live-classes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('=== DELETE LIVE CLASS DEBUG ===');
    console.log('Deleting class ID:', id);
    
    const result = await pool.query('DELETE FROM live_classes WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Live class not found' });
    }
    
    console.log('Live class deleted:', result.rows[0]);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error deleting live class:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Join live class
app.post('/api/live-classes/join', async (req, res) => {
  try {
    const { class_id, student_id, student_name, join_time } = req.body;
    
    console.log('=== STUDENT JOINING LIVE CLASS ===');
    console.log('Join data:', req.body);
    
    // Check if student already joined
    const existingParticipant = await pool.query(
      'SELECT * FROM live_class_participants WHERE class_id = $1 AND student_id = $2',
      [class_id, student_id]
    );
    
    if (existingParticipant.rows.length > 0) {
      return res.json({ success: true, message: 'Student already joined', data: existingParticipant.rows[0] });
    }
    
    // Add student to participants
    const result = await pool.query(
      'INSERT INTO live_class_participants (class_id, student_id, student_name, join_time, status) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [class_id, student_id, student_name, join_time, 'active']
    );
    
    console.log('Student joined live class:', result.rows[0]);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error joining live class:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get live class participants
app.get('/api/live-classes/:id/participants', async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('=== GETTING LIVE CLASS PARTICIPANTS ===');
    console.log('Class ID:', id);
    
    const result = await pool.query(
      'SELECT * FROM live_class_participants WHERE class_id = $1 ORDER BY join_time ASC',
      [id]
    );
    
    console.log('Participants found:', result.rows.length);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error getting participants:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// End all live classes
app.post('/api/live-classes/end-all', async (req, res) => {
  try {
    console.log('=== ENDING ALL LIVE CLASSES ===');
    
    const result = await pool.query(
      "UPDATE live_classes SET status = 'ended' WHERE status = 'live' RETURNING *"
    );
    
    console.log('Live classes ended:', result.rows.length);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error ending live classes:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete fake/test classes
app.post('/api/live-classes/cleanup', async (req, res) => {
  try {
    console.log('=== CLEANING UP FAKE CLASSES ===');
    
    // Delete classes with fake program names
    const result = await pool.query(
      "DELETE FROM live_classes WHERE program_name IN ('ELECTRONICS', 'TEST', 'DEMO') OR title LIKE '%test%' OR title LIKE '%demo%' RETURNING *"
    );
    
    console.log(`Deleted ${result.rows.length} fake classes`);
    res.json({ success: true, message: `Deleted ${result.rows.length} fake classes`, data: result.rows });
  } catch (error) {
    console.error('Error cleaning up fake classes:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Auto-start scheduled class
app.post('/api/live-classes/:id/auto-start', async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('=== AUTO-STARTING SCHEDULED CLASS ===');
    console.log('Class ID:', id);
    
    const result = await pool.query(
      "UPDATE live_classes SET status = 'live' WHERE id = $1 AND status = 'scheduled' RETURNING *",
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Scheduled class not found' });
    }
    
    console.log('Class auto-started:', result.rows[0]);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error auto-starting class:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Automatic scheduler - checks every 10 seconds for classes that should start
const checkScheduledClasses = async () => {
  try {
    // Check database connection first
    const client = await pool.connect().catch(err => {
      if (err.code === 'ECONNREFUSED') {
        // Database not available - fail silently to avoid spam
        return null;
      }
      throw err;
    });
    
    if (!client) {
      // Database not connected, skip this check silently
      return;
    }
    
    client.release();
    
    console.log('=== CHECKING SCHEDULED CLASSES ===');
    console.log(`Scheduler running at: ${new Date().toLocaleString()}`);
    
    // Get ALL live classes first for debugging
    const allClassesResult = await pool.query("SELECT * FROM live_classes ORDER BY created_at DESC");
    console.log(`Total live classes in database: ${allClassesResult.rows.length}`);
    
    if (allClassesResult.rows.length > 0) {
      console.log('All live classes:');
      allClassesResult.rows.forEach((cls, index) => {
        console.log(`${index + 1}. ${cls.title} - Status: ${cls.status} - Date: ${cls.date} - Time: ${cls.time}`);
      });
    }
    
    // Get scheduled classes specifically
    const result = await pool.query(
      "SELECT * FROM live_classes WHERE status = 'scheduled' ORDER BY date, time"
    );
    
    const scheduledClasses = result.rows;
    console.log(`\nFound ${scheduledClasses.length} scheduled classes specifically`);
    
    if (scheduledClasses.length === 0) {
      console.log('No scheduled classes found');
      return;
    }
    
    // Get current time in local timezone
    const now = new Date();
    console.log(`Current server time: ${now.toLocaleString()}`);
    console.log(`Current server time (ISO): ${now.toISOString()}`);
    console.log(`Current server time (UTC): ${now.toUTCString()}`);
    
    for (const classItem of scheduledClasses) {
      try {
        console.log(`\n--- Checking class: ${classItem.title} ---`);
        console.log(`Class date: ${classItem.date}`);
        console.log(`Class time: ${classItem.time}`);
        
        // Validate date and time format
        if (!classItem.date || !classItem.time) {
          console.log(`❌ SKIPPING: Missing date or time for class ${classItem.title}`);
          continue;
        }
        
        // Handle date and time parsing more robustly
        let classDateTime;
        
        // Try different date parsing methods
        if (classItem.date && classItem.time) {
          // Extract date part from timestamp if needed
          let dateString = classItem.date;
          if (dateString.includes('T')) {
            dateString = dateString.split('T')[0]; // Get only date part: "2025-10-18"
          }
          
          console.log(`Processing date: ${dateString}, time: ${classItem.time}`);
          
          // Ensure time has seconds
          let timeString = classItem.time;
          if (timeString.split(':').length === 2) {
            timeString += ':00'; // Add seconds if missing
          }
          
          // Method 1: ISO format
          const dateTimeString = `${dateString}T${timeString}`;
          classDateTime = new Date(dateTimeString);
          
          console.log(`Parsed datetime (Method 1): ${classDateTime}`);
          
          // Method 2: If ISO fails, try manual parsing
          if (isNaN(classDateTime.getTime())) {
            console.log('Method 1 failed, trying Method 2...');
            const dateParts = dateString.split('-');
            const timeParts = classItem.time.split(':');
            classDateTime = new Date(
              parseInt(dateParts[0]), // year
              parseInt(dateParts[1]) - 1, // month (0-indexed)
              parseInt(dateParts[2]), // day
              parseInt(timeParts[0]), // hour
              parseInt(timeParts[1]), // minute
              0 // seconds
            );
            console.log(`Parsed datetime (Method 2): ${classDateTime}`);
          }
        }
        
        // Check if date is valid
        if (!classDateTime || isNaN(classDateTime.getTime())) {
          console.log(`❌ SKIPPING: Invalid date/time format for class ${classItem.title}`);
          console.log(`Date: ${classItem.date}, Time: ${classItem.time}`);
          continue;
        }
        
        console.log(`Scheduled datetime: ${classDateTime.toLocaleString()}`);
        console.log(`Current datetime: ${now.toLocaleString()}`);
        
        // Calculate time difference in seconds
        const timeDiff = (classDateTime - now) / 1000;
        console.log(`Time difference: ${timeDiff} seconds`);
        
        // If current time is past scheduled time (allowing 1 minute buffer)
        if (timeDiff <= 60) {
          console.log(`🚀 AUTO-STARTING CLASS: ${classItem.title}`);
          console.log(`Class was scheduled for: ${classDateTime.toLocaleString()}`);
          console.log(`Starting now at: ${now.toLocaleString()}`);
          
          // Update status to 'live' with started_at timestamp
          const updateResult = await pool.query(
            "UPDATE live_classes SET status = 'live', started_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *",
            [classItem.id]
          );
          
          if (updateResult.rows.length > 0) {
            console.log(`✅ SUCCESS: Class ${classItem.title} is now LIVE!`);
            console.log(`Updated class data:`, updateResult.rows[0]);
            console.log(`Class ID ${classItem.id} status changed from 'scheduled' to 'live'`);
            
            // Verify the update worked
            const verifyResult = await pool.query(
              "SELECT * FROM live_classes WHERE id = $1",
              [classItem.id]
            );
            
            if (verifyResult.rows.length > 0 && verifyResult.rows[0].status === 'live') {
              console.log(`✅ VERIFIED: Class ${classItem.title} status is confirmed as 'live'`);
            } else {
              console.log(`❌ VERIFICATION FAILED: Class ${classItem.title} status not updated properly`);
            }
          } else {
            console.log(`❌ FAILED: Could not update class ${classItem.title}`);
            console.log(`Attempting alternative update method...`);
            
            // Try alternative update
            try {
              const altUpdateResult = await pool.query(
                "UPDATE live_classes SET status = $1 WHERE id = $2 RETURNING *",
                ['live', classItem.id]
              );
              
              if (altUpdateResult.rows.length > 0) {
                console.log(`✅ ALTERNATIVE SUCCESS: Class ${classItem.title} updated via alternative method`);
              } else {
                console.log(`❌ ALTERNATIVE FAILED: Could not update class ${classItem.title} via alternative method`);
              }
            } catch (altError) {
              console.log(`❌ ALTERNATIVE ERROR:`, altError.message);
            }
          }
        } else {
          const minutesUntilStart = Math.round(timeDiff / 60);
          const secondsUntilStart = Math.round(timeDiff);
          console.log(`⏰ Class ${classItem.title} starts in ${minutesUntilStart} minutes (${secondsUntilStart} seconds)`);
        }
      } catch (classError) {
        console.error(`❌ Error processing class ${classItem.title}:`, classError);
      }
    }
  } catch (error) {
    // Only log non-connection errors to avoid spam
    if (error.code !== 'ECONNREFUSED') {
      console.error('❌ Error in automatic scheduler:', error.message);
    }
    // Connection errors are silently ignored as database may not be available yet
  }
};


// Manual trigger for scheduler (for testing)
app.post('/api/live-classes/check-scheduled', async (req, res) => {
  try {
    console.log('=== MANUAL SCHEDULER TRIGGER ===');
    await checkScheduledClasses();
    res.json({ success: true, message: 'Scheduler check completed' });
  } catch (error) {
    console.error('Error in manual scheduler trigger:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Debug endpoint to check all live classes
app.get('/api/live-classes/debug', async (req, res) => {
  try {
    console.log('=== DEBUG: ALL LIVE CLASSES ===');
    
    const allClasses = await pool.query("SELECT * FROM live_classes ORDER BY created_at DESC");
    const scheduledClasses = await pool.query("SELECT * FROM live_classes WHERE status = 'scheduled' ORDER BY date, time");
    const liveClasses = await pool.query("SELECT * FROM live_classes WHERE status = 'live' ORDER BY created_at DESC");
    
    const debugInfo = {
      total_classes: allClasses.rows.length,
      scheduled_classes: scheduledClasses.rows.length,
      live_classes: liveClasses.rows.length,
      all_classes: allClasses.rows,
      scheduled_only: scheduledClasses.rows,
      live_only: liveClasses.rows,
      current_time: new Date().toLocaleString(),
      scheduler_status: 'Running every 10 seconds'
    };
    
    console.log('Debug info:', debugInfo);
    res.json({ success: true, data: debugInfo });
  } catch (error) {
    console.error('Error in debug endpoint:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Force start a specific class (for testing)
app.post('/api/live-classes/:id/force-start', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`=== FORCE STARTING CLASS ID: ${id} ===`);
    
    // Get class details first
    const classResult = await pool.query("SELECT * FROM live_classes WHERE id = $1", [id]);
    
    if (classResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Class not found' });
    }
    
    const classItem = classResult.rows[0];
    console.log(`Force starting class: ${classItem.title}`);
    console.log(`Current status: ${classItem.status}`);
    
    // Force update to live
    const updateResult = await pool.query(
      "UPDATE live_classes SET status = 'live', started_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *",
      [id]
    );
    
    if (updateResult.rows.length > 0) {
      console.log(`✅ FORCE START SUCCESS: Class ${classItem.title} is now LIVE!`);
      res.json({ success: true, data: updateResult.rows[0], message: 'Class force started successfully' });
    } else {
      console.log(`❌ FORCE START FAILED: Could not update class ${classItem.title}`);
      res.status(500).json({ success: false, error: 'Failed to force start class' });
    }
  } catch (error) {
    console.error('Error force starting class:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Test scheduler with specific time simulation
app.post('/api/live-classes/test-scheduler', async (req, res) => {
  try {
    const { simulateTime } = req.body;
    console.log('=== TESTING SCHEDULER WITH TIME SIMULATION ===');
    
    if (simulateTime) {
      console.log(`Simulating time: ${simulateTime}`);
      // Override current time for testing
      const originalCheckScheduledClasses = checkScheduledClasses;
      
      const testCheckScheduledClasses = async () => {
        try {
          console.log('=== TESTING SCHEDULED CLASSES ===');
          console.log(`Simulated time: ${new Date(simulateTime).toLocaleString()}`);
          
          const result = await pool.query("SELECT * FROM live_classes WHERE status = 'scheduled' ORDER BY date, time");
          const scheduledClasses = result.rows;
          console.log(`Found ${scheduledClasses.length} scheduled classes for testing`);
          
          const simulatedNow = new Date(simulateTime);
          
          for (const classItem of scheduledClasses) {
            const dateTimeString = `${classItem.date}T${classItem.time}:00`;
            const classDateTime = new Date(dateTimeString);
            const timeDiff = (classDateTime - simulatedNow) / 1000;
            
            console.log(`Testing class: ${classItem.title}`);
            console.log(`Scheduled: ${classDateTime.toLocaleString()}, Simulated: ${simulatedNow.toLocaleString()}`);
            console.log(`Time diff: ${timeDiff} seconds`);
            
            if (timeDiff <= 60) {
              console.log(`🚀 TEST: Would start class ${classItem.title}`);
              
              const updateResult = await pool.query(
                "UPDATE live_classes SET status = 'live', started_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *",
                [classItem.id]
              );
              
              if (updateResult.rows.length > 0) {
                console.log(`✅ TEST SUCCESS: Class ${classItem.title} started in test mode`);
              }
            }
          }
        } catch (error) {
          console.error('Error in test scheduler:', error);
        }
      };
      
      await testCheckScheduledClasses();
    } else {
      // Run normal scheduler check
      await checkScheduledClasses();
    }
    
    res.json({ success: true, message: 'Scheduler test completed' });
  } catch (error) {
    console.error('Error in scheduler test:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===== DISCUSSION SYSTEM API ENDPOINTS =====

// Get all discussions with student-specific program filtering
app.get('/api/discussions', async (req, res) => {
  try {
    const { student_id, student_username, lecturer_id, lecturer_username } = req.query;
    
    console.log('=== FETCHING DISCUSSIONS ===');
    console.log('Student ID:', student_id);
    console.log('Student Username:', student_username);
    console.log('Lecturer ID:', lecturer_id);
    console.log('Lecturer Username:', lecturer_username);
    
    // If lecturer info provided, filter by lecturer's programs
    if (lecturer_id || lecturer_username) {
      console.log('Fetching discussions for lecturer...');
      
      // Get lecturer's programs (both regular and short-term)
      let lecturerPrograms = [];
      
      // Get regular programs
      const regularProgramsResult = await pool.query(`
        SELECT name FROM programs 
        WHERE lecturer_id = $1 OR lecturer_name = $2
      `, [lecturer_id || null, lecturer_username || '']);
      lecturerPrograms = regularProgramsResult.rows.map(p => p.name);
      
      // Get short-term programs
      const shortTermResult = await pool.query(`
        SELECT title FROM short_term_programs 
        WHERE lecturer_id = $1 OR lecturer_name = $2
      `, [lecturer_id || null, lecturer_username || '']);
      const shortTermPrograms = shortTermResult.rows.map(p => p.title);
      lecturerPrograms = [...lecturerPrograms, ...shortTermPrograms];
      
      console.log('Lecturer Programs:', lecturerPrograms);
      
      // Get all discussions
      const allDiscussionsResult = await pool.query(`
        SELECT d.*, 
               (SELECT COUNT(*) FROM discussion_replies WHERE discussion_id = d.id) as reply_count
        FROM discussions d 
        ORDER BY d.created_at DESC
      `);
      
      // Filter discussions by lecturer's programs with improved matching
      const filteredDiscussions = allDiscussionsResult.rows.filter(discussion => {
        if (!discussion.program || discussion.program.trim() === '') {
          return false; // Don't show discussions without program
        }
        
        const discussionProgram = discussion.program.toLowerCase().trim();
        
        return lecturerPrograms.some(program => {
          if (!program) return false;
          
          const lecturerProgram = program.toLowerCase().trim();
          
          // 1. Exact match
          if (lecturerProgram === discussionProgram) {
            console.log(`✅ Discussion "${discussion.title}" - Exact match: ${discussion.program}`);
            return true;
          }
          
          // 2. Contains match (either direction)
          if (lecturerProgram.includes(discussionProgram) || discussionProgram.includes(lecturerProgram)) {
            console.log(`✅ Discussion "${discussion.title}" - Contains match: ${discussion.program}`);
            return true;
          }
          
          // 3. Word-based matching (at least 2 common significant words)
          const lecturerWords = lecturerProgram.split(/\s+/).filter(w => w.length > 3);
          const discussionWords = discussionProgram.split(/\s+/).filter(w => w.length > 3);
          const commonWords = lecturerWords.filter(word => discussionWords.includes(word));
          
          if (commonWords.length >= 2) {
            console.log(`✅ Discussion "${discussion.title}" - Word match (${commonWords.join(', ')}): ${discussion.program}`);
            return true;
          }
          
          // 4. Single significant word match for short program names
          if (lecturerWords.length === 1 && discussionWords.length === 1 && lecturerWords[0] === discussionWords[0]) {
            console.log(`✅ Discussion "${discussion.title}" - Single word match: ${discussion.program}`);
            return true;
          }
          
          return false;
        });
      });
      
      console.log(`Filtered ${filteredDiscussions.length} discussions for lecturer from ${allDiscussionsResult.rows.length} total`);
      return res.json({ success: true, data: filteredDiscussions });
    }
    
    // If no student or lecturer info provided, return all discussions (for admin view)
    if (!student_id && !student_username) {
      const result = await pool.query(`
        SELECT d.*, 
               (SELECT COUNT(*) FROM discussion_replies WHERE discussion_id = d.id) as reply_count
        FROM discussions d 
        ORDER BY d.created_at DESC
      `);
      console.log('Discussions found (no filter):', result.rows.length);
      return res.json({ success: true, data: result.rows });
    }
    
    // Get student information
    let studentInfo = null;
    if (student_id) {
      const studentResult = await pool.query(`
        SELECT s.*, c.name as course_name
        FROM students s
        LEFT JOIN courses c ON s.course_id = c.id
        WHERE s.id = $1
      `, [student_id]);
      
      if (studentResult.rows.length > 0) {
        studentInfo = studentResult.rows[0];
      }
    } else if (student_username) {
      const studentResult = await pool.query(`
        SELECT s.*, c.name as course_name
        FROM students s
        LEFT JOIN courses c ON s.course_id = c.id
        WHERE s.registration_number = $1 OR s.email = $1 OR s.name = $1
      `, [student_username]);
      
      if (studentResult.rows.length > 0) {
        studentInfo = studentResult.rows[0];
      }
    }
    
    if (!studentInfo) {
      console.log('Student not found, returning empty array');
      return res.json({ success: true, data: [] });
    }
    
    console.log('Student Info:', studentInfo);
    
    // Get student's full info including college and department for short-term program targeting
    let studentFullInfo = studentInfo;
    if (!studentInfo.college_name || !studentInfo.department_name) {
      const fullInfoResult = await pool.query(`
        SELECT s.*, 
               c.name as course_name,
               d.name as department_name,
               col.name as college_name
        FROM students s
        LEFT JOIN courses c ON s.course_id = c.id
        LEFT JOIN departments d ON c.department_id = d.id
        LEFT JOIN colleges col ON d.college_id = col.id
        WHERE s.id = $1
      `, [studentInfo.id]);
      
      if (fullInfoResult.rows.length > 0) {
        studentFullInfo = fullInfoResult.rows[0];
      }
    }
    
    // Get student's regular programs
    const programsResult = await pool.query(
      'SELECT name FROM programs WHERE course_id = $1',
      [studentInfo.course_id]
    );
    let studentPrograms = programsResult.rows.map(p => p.name);
    
    console.log('Student Regular Programs:', studentPrograms);
    
    // CRITICAL: Add short-term programs that student is eligible for
    try {
      // FIXED: Remove end_date filter to match live-classes endpoint behavior
      const shortTermResult = await pool.query(
        'SELECT * FROM short_term_programs ORDER BY created_at DESC'
      );
      
      const eligibleShortTermPrograms = shortTermResult.rows.filter(program => {
        // Check targeting for short-term programs with case-insensitive matching
        // FIXED: Check for null, undefined, empty string, or 'all'
        if (!program.target_type || program.target_type === 'all' || program.target_type === '' || program.target_type === null) {
          console.log(`✅ Short-term program "${program.title}" - All students (target_type: ${program.target_type})`);
          return true;
        }
        
        // College targeting - case-insensitive
        if (program.target_type === 'college') {
          if (studentFullInfo.college_name && 
              program.target_value?.toLowerCase().trim() === studentFullInfo.college_name?.toLowerCase().trim()) {
            return true;
          }
        }
        
        // Department targeting - case-insensitive
        if (program.target_type === 'department') {
          if (studentFullInfo.department_name && 
              program.target_value?.toLowerCase().trim() === studentFullInfo.department_name?.toLowerCase().trim()) {
            return true;
          }
        }
        
        // Course targeting - case-insensitive with partial match
        if (program.target_type === 'course') {
          if (studentFullInfo.course_name) {
            const targetLower = program.target_value?.toLowerCase().trim();
            const courseLower = studentFullInfo.course_name?.toLowerCase().trim();
            if (targetLower === courseLower || 
                targetLower?.includes(courseLower) || 
                courseLower?.includes(targetLower)) {
              return true;
            }
          }
        }
        
        // Year targeting with type conversion
        if (program.target_type === 'year') {
          if (String(program.target_value) === String(studentFullInfo.year_of_study)) {
            return true;
          }
        }
        
        // Program targeting - case-insensitive
        if (program.target_type === 'program') {
          const targetLower = program.target_value?.toLowerCase().trim();
          if (studentPrograms.some(p => p?.toLowerCase().trim() === targetLower)) {
            return true;
          }
        }
        
        return false;
      });
      
      // Add short-term program titles to student programs list
      const shortTermProgramNames = eligibleShortTermPrograms.map(p => p.title);
      studentPrograms = [...studentPrograms, ...shortTermProgramNames];
      console.log('✅ Added short-term programs for discussions:', shortTermProgramNames);
      console.log('   Total programs (Regular + Short-Term):', studentPrograms.length);
    } catch (error) {
      console.log('⚠️ No short-term programs table or error:', error.message);
    }
    
    console.log('Student All Programs:', studentPrograms);
    
    // Fetch all discussions
    const discussionsResult = await pool.query(`
      SELECT d.*, 
             (SELECT COUNT(*) FROM discussion_replies WHERE discussion_id = d.id) as reply_count
      FROM discussions d 
      ORDER BY d.created_at DESC
    `);
    
    // Filter discussions based on student's programs
    const filteredDiscussions = discussionsResult.rows.filter(discussion => {
      // If no program specified, show to all (for general discussions)
      if (!discussion.program || discussion.program.trim() === '') {
        console.log(`✅ Discussion "${discussion.title}" - No program restriction (general)`);
        return true;
      }
      
      // Check if discussion program matches any of student's programs
      const programMatch = studentPrograms.some(program => {
        if (!program) return false;
        
        const programLower = program.toLowerCase().trim();
        const discussionProgramLower = discussion.program.toLowerCase().trim();
        
        // Exact match
        if (programLower === discussionProgramLower) {
          console.log(`✅ Discussion "${discussion.title}" - Exact program match: ${discussion.program}`);
          return true;
        }
        
        // Contains match (either direction)
        if (programLower.includes(discussionProgramLower) || discussionProgramLower.includes(programLower)) {
          console.log(`✅ Discussion "${discussion.title}" - Partial program match: ${discussion.program}`);
          return true;
        }
        
        // Word-based matching (at least 2 common significant words)
        const programWords = programLower.split(/\s+/).filter(w => w.length > 3);
        const discussionWords = discussionProgramLower.split(/\s+/).filter(w => w.length > 3);
        const commonWords = programWords.filter(word => discussionWords.includes(word));
        
        if (commonWords.length >= 2) {
          console.log(`✅ Discussion "${discussion.title}" - Word match (${commonWords.join(', ')}): ${discussion.program}`);
          return true;
        }
        
        // Single significant word match for short program names
        if (programWords.length === 1 && discussionWords.length === 1 && programWords[0] === discussionWords[0]) {
          console.log(`✅ Discussion "${discussion.title}" - Single word match: ${discussion.program}`);
          return true;
        }
        
        return false;
      });
      
      if (!programMatch) {
        console.log(`❌ Discussion "${discussion.title}" - No program match: ${discussion.program} (Student programs: ${studentPrograms.join(', ')})`);
      }
      
      return programMatch;
    });
    
    console.log(`Filtered ${filteredDiscussions.length} discussions for student`);
    res.json({ success: true, data: filteredDiscussions });
  } catch (error) {
    console.error('Error fetching discussions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create new discussion
app.post('/api/discussions', async (req, res) => {
  try {
    const { 
      title, content, category, program, author, author_id, 
      group_name, group_leader, group_members, priority, status 
    } = req.body;
    
    console.log('=== CREATING DISCUSSION ===');
    console.log('Discussion data:', req.body);
    
    // CR VALIDATION: Only CRs can create general discussions
    if (category === 'general') {
      if (!author_id) {
        return res.status(403).json({ 
          success: false, 
          error: 'Only Class Representatives can create general discussions. Please contact your CR or admin.' 
        });
      }
      
      // Check if user is a CR
      const crCheck = await pool.query(
        'SELECT is_cr, name FROM students WHERE id = $1',
        [author_id]
      );
      
      if (crCheck.rows.length === 0 || !crCheck.rows[0].is_cr) {
        return res.status(403).json({ 
          success: false, 
          error: 'Only Class Representatives can create general discussions. Please contact your CR or admin.',
          message: 'You must be a Class Representative to create general discussions'
        });
      }
      
      console.log(`✅ CR ${crCheck.rows[0].name} creating general discussion`);
    }
    
    const result = await pool.query(`
      INSERT INTO discussions (
        title, content, category, program, author, author_id,
        group_name, group_leader, group_members, priority, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) 
      RETURNING *
    `, [
      title, content, category, program, author, author_id,
      group_name, group_leader, group_members, priority || 'normal', status || 'active'
    ]);
    
    console.log('Discussion created:', result.rows[0]);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error creating discussion:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get discussion by ID
app.get('/api/discussions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('=== FETCHING DISCUSSION BY ID ===');
    console.log('Discussion ID:', id);
    
    const discussionResult = await pool.query('SELECT * FROM discussions WHERE id = $1', [id]);
    
    if (discussionResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Discussion not found' });
    }
    
    // Get replies for this discussion
    const repliesResult = await pool.query(`
      SELECT * FROM discussion_replies 
      WHERE discussion_id = $1 
      ORDER BY created_at ASC
    `, [id]);
    
    const discussion = {
      ...discussionResult.rows[0],
      replies: repliesResult.rows
    };
    
    console.log('Discussion found with', repliesResult.rows.length, 'replies');
    res.json({ success: true, data: discussion });
  } catch (error) {
    console.error('Error fetching discussion:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create reply to discussion (without file - JSON body)
app.post('/api/discussion-replies', async (req, res) => {
  try {
    const { discussion_id, content, author, author_id, author_type, file_url, file_name, file_type, file_size } = req.body;
    
    console.log('=== CREATING DISCUSSION REPLY (JSON) ===');
    console.log('Reply data:', req.body);
    
    // Insert reply with optional file info
    const replyResult = await pool.query(`
      INSERT INTO discussion_replies (discussion_id, content, author, author_id, author_type, file_url, file_name, file_type, file_size)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *
    `, [discussion_id, content || '', author, author_id, author_type || 'student', file_url || null, file_name || null, file_type || null, file_size || null]);
    
    // Update discussion reply count
    await pool.query(`
      UPDATE discussions 
      SET replies = replies + 1, updated_at = CURRENT_TIMESTAMP 
      WHERE id = $1
    `, [discussion_id]);
    
    console.log('Reply created:', replyResult.rows[0]);
    res.json({ success: true, data: replyResult.rows[0] });
  } catch (error) {
    console.error('Error creating reply:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update discussion (pin/unpin, like, etc.)
app.put('/api/discussions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { is_pinned, likes, views } = req.body;
    
    console.log('=== UPDATING DISCUSSION ===');
    console.log('Discussion ID:', id);
    console.log('Update data:', req.body);
    
    let updateQuery = 'UPDATE discussions SET updated_at = CURRENT_TIMESTAMP';
    let updateValues = [];
    let paramCount = 0;
    
    if (is_pinned !== undefined) {
      paramCount++;
      updateQuery += `, is_pinned = $${paramCount}`;
      updateValues.push(is_pinned);
    }
    
    if (likes !== undefined) {
      paramCount++;
      updateQuery += `, likes = $${paramCount}`;
      updateValues.push(likes);
    }
    
    if (views !== undefined) {
      paramCount++;
      updateQuery += `, views = $${paramCount}`;
      updateValues.push(views);
    }
    
    paramCount++;
    updateQuery += ` WHERE id = $${paramCount} RETURNING *`;
    updateValues.push(id);
    
    const result = await pool.query(updateQuery, updateValues);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Discussion not found' });
    }
    
    console.log('Discussion updated:', result.rows[0]);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error updating discussion:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete discussion
app.delete('/api/discussions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('=== DELETING DISCUSSION ===');
    console.log('Discussion ID:', id);
    
    // Delete replies first (CASCADE should handle this, but being explicit)
    await pool.query('DELETE FROM discussion_replies WHERE discussion_id = $1', [id]);
    
    // Delete discussion
    const result = await pool.query('DELETE FROM discussions WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Discussion not found' });
    }
    
    console.log('Discussion deleted:', result.rows[0]);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error deleting discussion:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===== STUDY GROUP NOTIFICATIONS API =====

// Create study group notifications
app.post('/api/study-group-notifications', async (req, res) => {
  try {
    const { notifications } = req.body;
    
    console.log('=== CREATING STUDY GROUP NOTIFICATIONS ===');
    console.log('Notifications:', notifications);
    
    if (!notifications || !Array.isArray(notifications)) {
      return res.status(400).json({ success: false, error: 'Notifications array is required' });
    }
    
    const results = [];
    
    for (const notification of notifications) {
      const {
        discussion_id, student_reg_no, student_name, group_name,
        group_leader, program, notification_type
      } = notification;
      
      const result = await pool.query(`
        INSERT INTO study_group_notifications (
          discussion_id, student_reg_no, student_name, group_name,
          group_leader, program, notification_type, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
        RETURNING *
      `, [
        discussion_id, student_reg_no, student_name, group_name,
        group_leader, program, notification_type || 'group_invitation', 'pending'
      ]);
      
      results.push(result.rows[0]);
    }
    
    console.log('Study group notifications created:', results.length);
    res.json({ success: true, data: results });
  } catch (error) {
    console.error('Error creating study group notifications:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get study group notifications for a student
app.get('/api/study-group-notifications/:regNo', async (req, res) => {
  try {
    const { regNo } = req.params;
    
    console.log('=== FETCHING STUDY GROUP NOTIFICATIONS ===');
    console.log('Student Reg No:', regNo);
    
    const result = await pool.query(`
      SELECT sgn.*, d.title as discussion_title, d.content as discussion_content
      FROM study_group_notifications sgn
      LEFT JOIN discussions d ON sgn.discussion_id = d.id
      WHERE sgn.student_reg_no = $1
      ORDER BY sgn.created_at DESC
    `, [regNo]);
    
    console.log('Notifications found:', result.rows.length);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching study group notifications:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update notification status
app.put('/api/study-group-notifications/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    console.log('=== UPDATING NOTIFICATION STATUS ===');
    console.log('Notification ID:', id, 'Status:', status);
    
    const result = await pool.query(`
      UPDATE study_group_notifications 
      SET status = $1 
      WHERE id = $2 
      RETURNING *
    `, [status, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error updating notification status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get replies for a discussion
app.get('/api/discussions/:id/replies', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT * FROM discussion_replies WHERE discussion_id = $1 ORDER BY created_at ASC',
      [id]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching replies:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Add reply to discussion (duplicate endpoint - updated with file support)
app.post('/api/discussion-replies', async (req, res) => {
  try {
    const { discussion_id, content, author, author_id, author_type, file_url, file_name, file_type, file_size } = req.body;
    
    const result = await pool.query(`
      INSERT INTO discussion_replies (discussion_id, content, author, author_id, author_type, file_url, file_name, file_type, file_size)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *
    `, [discussion_id, content || '', author, author_id, author_type || 'student', file_url || null, file_name || null, file_type || null, file_size || null]);
    
    // Update discussion reply count
    await pool.query(
      'UPDATE discussions SET replies = replies + 1 WHERE id = $1',
      [discussion_id]
    );
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error adding reply:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Like a discussion
app.post('/api/discussions/:id/like', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'UPDATE discussions SET likes = likes + 1 WHERE id = $1 RETURNING *',
      [id]
    );
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error liking discussion:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete a discussion (CASCADE delete will handle replies automatically)
app.delete('/api/discussions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id, user_type } = req.body;
    
    console.log('=== DELETE DISCUSSION DEBUG ===');
    console.log('Discussion ID:', id);
    console.log('User ID:', user_id);
    console.log('User Type:', user_type);
    
    // First, get the discussion to check permissions
    const discussionResult = await pool.query(
      'SELECT * FROM discussions WHERE id = $1',
      [id]
    );
    
    if (discussionResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Discussion not found' });
    }
    
    const discussion = discussionResult.rows[0];
    console.log('Discussion found:', discussion);
    
    // Check permissions: only lecturer of the program or discussion creator can delete
    let canDelete = false;
    
    if (user_type === 'lecturer') {
      // Lecturer can delete discussions in their programs
      const programResult = await pool.query(
        'SELECT * FROM programs WHERE name = $1 AND (lecturer_id = $2 OR lecturer_name = $3)',
        [discussion.program, user_id, req.body.username]
      );
      canDelete = programResult.rows.length > 0;
      console.log('Lecturer permission check:', canDelete);
    } else if (user_type === 'student') {
      // Student can only delete their own discussions
      canDelete = discussion.author_id == user_id || discussion.author === req.body.username;
      console.log('Student permission check:', canDelete);
    }
    
    if (!canDelete) {
      return res.status(403).json({ 
        success: false, 
        error: 'Permission denied. Only the discussion creator or program lecturer can delete this discussion.' 
      });
    }
    
    // Delete the discussion (CASCADE will automatically delete replies)
    const deleteResult = await pool.query(
      'DELETE FROM discussions WHERE id = $1 RETURNING *',
      [id]
    );
    
    console.log('Discussion deleted successfully:', deleteResult.rows[0]);
    
    res.json({ 
      success: true, 
      message: 'Discussion and all related replies deleted successfully',
      data: deleteResult.rows[0] 
    });
    
  } catch (error) {
    console.error('Error deleting discussion:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Initialize announcements table
const initializeAnnouncementsTable = async () => {
  try {
    console.log('Initializing announcements table...');
    
    // Drop and recreate announcements table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS announcements (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        target_type VARCHAR(50) NOT NULL,
        target_value VARCHAR(255),
        created_by VARCHAR(255) NOT NULL,
        created_by_id INTEGER,
        created_by_type VARCHAR(20) DEFAULT 'admin',
        file_url TEXT,
        file_name VARCHAR(255),
        views INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Announcements table initialized successfully');
  } catch (error) {
    console.error('Error initializing announcements table:', error);
  }
};

// Initialize short-term programs table
const initializeShortTermProgramsTable = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS short_term_programs (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        duration_value INTEGER NOT NULL,
        duration_unit VARCHAR(20) NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        target_type VARCHAR(50) NOT NULL,
        target_value VARCHAR(255),
        lecturer_id INTEGER,
        lecturer_name VARCHAR(255),
        status VARCHAR(50) DEFAULT 'active',
        created_by VARCHAR(255),
        created_by_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Short-term programs table initialized successfully');
  } catch (error) {
    console.error('Error initializing short-term programs table:', error);
  }
};

// Get all announcements with student-specific filtering
app.get('/api/announcements', async (req, res) => {
  try {
    const { student_id, student_username } = req.query;
    
    console.log('=== FETCHING ANNOUNCEMENTS ===');
    console.log('Student ID:', student_id);
    console.log('Student Username:', student_username);
    
    // If no student info provided, return all announcements (for admin/lecturer view)
    if (!student_id && !student_username) {
      const result = await pool.query(
        'SELECT * FROM announcements ORDER BY created_at DESC'
      );
      return res.json({ success: true, data: result.rows });
    }
    
    // Get student information with college, department, and course details
    let studentInfo = null;
    if (student_id) {
      const studentResult = await pool.query(`
        SELECT s.*, 
               c.name as course_name,
               d.name as department_name,
               col.name as college_name
        FROM students s
        LEFT JOIN courses c ON s.course_id = c.id
        LEFT JOIN departments d ON c.department_id = d.id
        LEFT JOIN colleges col ON d.college_id = col.id
        WHERE s.id = $1
      `, [student_id]);
      
      if (studentResult.rows.length > 0) {
        studentInfo = studentResult.rows[0];
      }
    } else if (student_username) {
      const studentResult = await pool.query(`
        SELECT s.*, 
               c.name as course_name,
               d.name as department_name,
               col.name as college_name
        FROM students s
        LEFT JOIN courses c ON s.course_id = c.id
        LEFT JOIN departments d ON c.department_id = d.id
        LEFT JOIN colleges col ON d.college_id = col.id
        WHERE s.registration_number = $1 OR s.email = $1 OR s.name = $1
      `, [student_username]);
      
      if (studentResult.rows.length > 0) {
        studentInfo = studentResult.rows[0];
      }
    }
    
    if (!studentInfo) {
      console.log('Student not found, returning empty array');
      return res.json({ success: true, data: [] });
    }
    
    console.log('Student Info:', studentInfo);
    
    // Get student's programs (regular + short-term)
    const programsResult = await pool.query(
      'SELECT name FROM programs WHERE course_id = $1',
      [studentInfo.course_id]
    );
    let studentPrograms = programsResult.rows.map(p => p.name);
    
    // Add short-term programs that student is eligible for
    try {
      const shortTermResult = await pool.query(
        'SELECT * FROM short_term_programs WHERE end_date > NOW()'
      );
      
      const eligibleShortTermPrograms = shortTermResult.rows.filter(program => {
        // Check targeting for short-term programs
        // CRITICAL: If target_type is null, undefined, or 'all', ALL students should see it
        if (!program.target_type || program.target_type === 'all' || program.target_type === '') return true;
        if (program.target_type === 'college' && program.target_value === studentInfo.college_name) return true;
        if (program.target_type === 'department' && program.target_value === studentInfo.department_name) return true;
        if (program.target_type === 'course' && program.target_value === studentInfo.course_name) return true;
        if (program.target_type === 'program') {
          return studentPrograms.some(p => p === program.target_value);
        }
        return false;
      });
      
      // Add short-term program titles to student programs list
      const shortTermProgramNames = eligibleShortTermPrograms.map(p => p.title);
      studentPrograms = [...studentPrograms, ...shortTermProgramNames];
      console.log('Added short-term programs:', shortTermProgramNames);
    } catch (error) {
      console.log('No short-term programs table or error:', error.message);
    }
    
    console.log('Student Programs (Regular + Short-Term):', studentPrograms);
    
    // Fetch all announcements
    const announcementsResult = await pool.query(
      'SELECT * FROM announcements ORDER BY created_at DESC'
    );
    
    // Filter announcements based on targeting AND creator type
    const filteredAnnouncements = announcementsResult.rows.filter(announcement => {
      console.log(`\n🔍 Checking announcement: "${announcement.title}"`);
      console.log(`   Created by: ${announcement.created_by} (${announcement.created_by_type})`);
      console.log(`   Target: ${announcement.target_type} = ${announcement.target_value}`);
      
      // ADMIN ANNOUNCEMENTS - Check targeting
      if (announcement.created_by_type === 'admin') {
        // Show all announcements targeted to "All Students" or with null/undefined target_type
        if (!announcement.target_type || announcement.target_type === 'all' || announcement.target_type === '') {
          console.log(`✅ Admin Announcement - All Students (target_type: ${announcement.target_type})`);
          return true;
        }
        
        // Show announcements targeted to student's college
        if (announcement.target_type === 'college' && 
            announcement.target_value === studentInfo.college_name) {
          console.log(`✅ Admin Announcement - College match: ${announcement.target_value}`);
          return true;
        }
        
        // Show announcements targeted to student's department
        if (announcement.target_type === 'department' && 
            announcement.target_value === studentInfo.department_name) {
          console.log(`✅ Admin Announcement - Department match: ${announcement.target_value}`);
          return true;
        }
        
        // Show announcements targeted to student's course
        if (announcement.target_type === 'course' && 
            announcement.target_value === studentInfo.course_name) {
          console.log(`✅ Admin Announcement - Course match: ${announcement.target_value}`);
          return true;
        }
        
        // Show announcements targeted to student's programs - STRICT MATCH ONLY
        if (announcement.target_type === 'program') {
          const programMatch = studentPrograms.some(program => {
            if (!program || !announcement.target_value) return false;
            
            // ONLY exact match (case-insensitive) - prevents cross-program leakage
            const programLower = program.toLowerCase().trim();
            const targetLower = announcement.target_value.toLowerCase().trim();
            
            if (programLower === targetLower) {
              console.log(`✅ Admin Announcement - Exact program match: ${announcement.target_value}`);
              return true;
            }
            
            return false;
          });
          
          if (programMatch) {
            return true;
          } else {
            console.log(`❌ Admin Announcement - No exact match: ${announcement.target_value} (Student programs: ${studentPrograms.join(', ')})`);
          }
        }
      }
      
      // LECTURER ANNOUNCEMENTS - Only show if student is in the targeted program - STRICT MATCH
      if (announcement.created_by_type === 'lecturer') {
        // Lecturer announcements are ALWAYS program-specific
        if (announcement.target_type === 'program') {
          const programMatch = studentPrograms.some(program => {
            if (!program || !announcement.target_value) return false;
            
            const programLower = program.toLowerCase().trim();
            const targetLower = announcement.target_value.toLowerCase().trim();
            
            // ONLY exact match (case-insensitive) - prevents cross-program leakage
            if (programLower === targetLower) {
              console.log(`✅ Lecturer Announcement - Exact program match: ${announcement.target_value}`);
              return true;
            }
            
            return false;
          });
          
          if (programMatch) {
            return true;
          } else {
            console.log(`❌ Lecturer Announcement - No exact match: ${announcement.target_value} (Student programs: ${studentPrograms.join(', ')})`);
          }
        }
      }
      
      console.log(`❌ Announcement "${announcement.title}" - No match or wrong creator type`);
      return false;
    });
    
    console.log(`Filtered ${filteredAnnouncements.length} announcements for student`);
    res.json({ success: true, data: filteredAnnouncements });
  } catch (error) {
    console.error('Error fetching announcements:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create new announcement - MOVED TO LINE 263 (before express.json middleware)
// This endpoint is now handled by the multipart/form-data version above
// to support file uploads with announcements

// Delete announcement
app.delete('/api/announcements/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'DELETE FROM announcements WHERE id = $1 RETURNING *',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Announcement not found' });
    }
    
    res.json({ success: true, message: 'Announcement deleted successfully', data: result.rows[0] });
  } catch (error) {
    console.error('Error deleting announcement:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Short-Term Programs API Endpoints

// Get all short-term programs (supports filtering by lecturer_username)
app.get('/api/short-term-programs', async (req, res) => {
  try {
    const { lecturer_username } = req.query;
    
    // If lecturer_username is provided, filter by lecturer
    if (lecturer_username) {
      console.log('=== FETCHING SHORT-TERM PROGRAMS FOR LECTURER ===');
      console.log('Lecturer Username:', lecturer_username);
      
      // Find lecturer first - try direct field matches
      let lecturerResult = await pool.query(
        'SELECT id, employee_id, name FROM lecturers WHERE employee_id = $1 OR email = $1 OR name = $1',
        [lecturer_username]
      );
      
      // If not found, try to find via password_records table using username
      if (lecturerResult.rows.length === 0) {
        console.log('Lecturer not found by direct match, checking password_records...');
        const passwordResult = await pool.query(
          'SELECT user_id FROM password_records WHERE username = $1 AND user_type = $2',
          [lecturer_username, 'lecturer']
        );
        
        if (passwordResult.rows.length > 0) {
          console.log('Found lecturer via password_records, user_id:', passwordResult.rows[0].user_id);
          lecturerResult = await pool.query(
            'SELECT id, employee_id, name FROM lecturers WHERE id = $1',
            [passwordResult.rows[0].user_id]
          );
        }
      }
      
      // If still not found, try case-insensitive search
      if (lecturerResult.rows.length === 0) {
        console.log('Trying case-insensitive search...');
        lecturerResult = await pool.query(
          'SELECT id, employee_id, name FROM lecturers WHERE LOWER(employee_id) = LOWER($1) OR LOWER(email) = LOWER($1) OR LOWER(name) = LOWER($1)',
          [lecturer_username]
        );
      }
      
      if (lecturerResult.rows.length === 0) {
        console.log('Lecturer not found:', lecturer_username);
        return res.json({ success: true, data: [] });
      }
      
      const lecturer = lecturerResult.rows[0];
      console.log('=== SHORT-TERM PROGRAMS - LECTURER DATA ===');
      console.log('Lecturer ID:', lecturer.id);
      console.log('Lecturer Employee ID:', lecturer.employee_id);
      console.log('Lecturer Name:', lecturer.name);
      
      // More flexible query using ILIKE for partial matching
      // FIXED: Also match by username (employee_id) in lecturer_name field
      const result = await pool.query(
        `SELECT * FROM short_term_programs 
         WHERE lecturer_id = $1 
            OR lecturer_name = $2 
            OR lecturer_name = $3
            OR lecturer_name = $4
            OR lecturer_name ILIKE $5
            OR lecturer_name ILIKE $6
            OR lecturer_name ILIKE $7
         ORDER BY created_at DESC`,
        [lecturer.id, lecturer.employee_id, lecturer.name, lecturer_username, `%${lecturer.employee_id}%`, `%${lecturer.name}%`, `%${lecturer_username}%`]
      );
      
      console.log(`Found ${result.rows.length} short-term programs for lecturer`);
      
      // If no short-term programs found, check what exists
      if (result.rows.length === 0) {
        console.log('=== NO SHORT-TERM PROGRAMS FOUND - DEBUGGING ===');
        
        // Check total short-term programs in database
        const totalShortTermPrograms = await pool.query('SELECT COUNT(*) FROM short_term_programs');
        console.log('Total short-term programs in database:', totalShortTermPrograms.rows[0].count);
        
        // Check short-term programs with lecturer assignments
        const shortTermWithLecturer = await pool.query(`
          SELECT id, title, lecturer_id, lecturer_name 
          FROM short_term_programs 
          WHERE lecturer_id IS NOT NULL OR lecturer_name IS NOT NULL 
          LIMIT 5
        `);
        console.log('Sample short-term programs with lecturer assigned:', shortTermWithLecturer.rows);
      }
      
      return res.json({ success: true, data: result.rows });
    }
    
    // Otherwise return all programs (admin view)
    const result = await pool.query(
      'SELECT * FROM short_term_programs ORDER BY created_at DESC'
    );
    
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching short-term programs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get short-term programs for a specific lecturer
app.get('/api/short-term-programs/lecturer/:lecturer_id', async (req, res) => {
  try {
    const { lecturer_id } = req.params;
    
    console.log('=== FETCHING LECTURER SHORT-TERM PROGRAMS ===');
    console.log('Lecturer ID:', lecturer_id);
    
    // Get lecturer info for flexible matching
    const lecturerResult = await pool.query(
      'SELECT employee_id, name FROM lecturers WHERE id = $1',
      [lecturer_id]
    );
    
    if (lecturerResult.rows.length === 0) {
      console.log('Lecturer not found');
      return res.json({ success: true, data: [] });
    }
    
    const lecturer = lecturerResult.rows[0];
    
    // Get programs assigned to this lecturer with flexible matching
    const result = await pool.query(
      `SELECT * FROM short_term_programs 
       WHERE lecturer_id = $1 
          OR lecturer_name = $2 
          OR lecturer_name = $3
          OR lecturer_name ILIKE $4
          OR lecturer_name ILIKE $5
       ORDER BY created_at DESC`,
      [lecturer_id, lecturer.employee_id, lecturer.name, `%${lecturer.employee_id}%`, `%${lecturer.name}%`]
    );
    
    console.log(`Found ${result.rows.length} programs for lecturer ${lecturer_id}`);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching lecturer short-term programs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get short-term programs for a specific student (with targeting filter)
app.get('/api/short-term-programs/student', async (req, res) => {
  try {
    const { student_id, student_username } = req.query;
    
    console.log('=== FETCHING STUDENT SHORT-TERM PROGRAMS ===');
    console.log('Student ID:', student_id);
    console.log('Student Username:', student_username);
    
    if (!student_id && !student_username) {
      return res.status(400).json({ 
        success: false, 
        error: 'Student ID or username is required' 
      });
    }
    
    // Get student information with college, department, and course details
    let studentInfo = null;
    if (student_id) {
      const studentResult = await pool.query(`
        SELECT s.*, 
               c.name as course_name,
               d.name as department_name,
               col.name as college_name
        FROM students s
        LEFT JOIN courses c ON s.course_id = c.id
        LEFT JOIN departments d ON c.department_id = d.id
        LEFT JOIN colleges col ON d.college_id = col.id
        WHERE s.id = $1
      `, [student_id]);
      
      if (studentResult.rows.length > 0) {
        studentInfo = studentResult.rows[0];
      }
    } else if (student_username) {
      const studentResult = await pool.query(`
        SELECT s.*, 
               c.name as course_name,
               d.name as department_name,
               col.name as college_name
        FROM students s
        LEFT JOIN courses c ON s.course_id = c.id
        LEFT JOIN departments d ON c.department_id = d.id
        LEFT JOIN colleges col ON d.college_id = col.id
        WHERE s.registration_number = $1 OR s.email = $1 OR s.name = $1
      `, [student_username]);
      
      if (studentResult.rows.length > 0) {
        studentInfo = studentResult.rows[0];
      }
    }
    
    if (!studentInfo) {
      console.log('Student not found, returning empty array');
      return res.json({ success: true, data: [] });
    }
    
    console.log('Student Info:', studentInfo);
    
    // Get student's programs
    const programsResult = await pool.query(
      'SELECT name FROM programs WHERE course_id = $1',
      [studentInfo.course_id]
    );
    const studentPrograms = programsResult.rows.map(p => p.name);
    
    console.log('Student Programs:', studentPrograms);
    
    // Get all active short-term programs
    const shortTermResult = await pool.query(
      'SELECT * FROM short_term_programs WHERE end_date > NOW() ORDER BY created_at DESC'
    );
    
    // Filter programs based on targeting
    const filteredPrograms = shortTermResult.rows.filter(program => {
      console.log(`\n🔍 Checking program: "${program.title}"`);
      console.log(`   Target: ${program.target_type} = ${program.target_value}`);
      console.log(`   Student College: ${studentInfo.college_name}`);
      console.log(`   Student Department: ${studentInfo.department_name}`);
      console.log(`   Student Course: ${studentInfo.course_name}`);
      
      // Check targeting
      // CRITICAL: If target_type is null, undefined, or 'all', ALL students should see it
      if (!program.target_type || program.target_type === 'all' || program.target_type === '') {
        console.log(`✅ Program - All Students (target_type: ${program.target_type})`);
        return true;
      }
      
      // College targeting - with case-insensitive and partial match
      if (program.target_type === 'college') {
        if (studentInfo.college_name && program.target_value === studentInfo.college_name) {
          console.log(`✅ Program - College match: ${program.target_value}`);
          return true;
        }
        if (studentInfo.college_name && program.target_value?.toLowerCase() === studentInfo.college_name?.toLowerCase()) {
          console.log(`✅ Program - College match (case-insensitive): ${program.target_value}`);
          return true;
        }
        // CRITICAL FIX: Add partial match for college names
        if (studentInfo.college_name && program.target_value && (
          studentInfo.college_name.toLowerCase().includes(program.target_value.toLowerCase()) ||
          program.target_value.toLowerCase().includes(studentInfo.college_name.toLowerCase())
        )) {
          console.log(`✅ Program - College match (partial): ${program.target_value}`);
          return true;
        }
      }
      
      // Department targeting - with case-insensitive and partial match
      if (program.target_type === 'department') {
        if (studentInfo.department_name && program.target_value === studentInfo.department_name) {
          console.log(`✅ Program - Department match: ${program.target_value}`);
          return true;
        }
        if (studentInfo.department_name && program.target_value?.toLowerCase() === studentInfo.department_name?.toLowerCase()) {
          console.log(`✅ Program - Department match (case-insensitive): ${program.target_value}`);
          return true;
        }
        // CRITICAL FIX: Add partial match for department names
        if (studentInfo.department_name && program.target_value && (
          studentInfo.department_name.toLowerCase().includes(program.target_value.toLowerCase()) ||
          program.target_value.toLowerCase().includes(studentInfo.department_name.toLowerCase())
        )) {
          console.log(`✅ Program - Department match (partial): ${program.target_value}`);
          return true;
        }
      }
      
      // Course/Courses targeting - with case-insensitive and partial match
      // CRITICAL FIX: Handle both 'course' and 'courses' (plural) target types
      if (program.target_type === 'course' || program.target_type === 'courses') {
        if (studentInfo.course_name && program.target_value === studentInfo.course_name) {
          console.log(`✅ Program - Course match: ${program.target_value}`);
          return true;
        }
        if (studentInfo.course_name && program.target_value?.toLowerCase() === studentInfo.course_name?.toLowerCase()) {
          console.log(`✅ Program - Course match (case-insensitive): ${program.target_value}`);
          return true;
        }
        if (studentInfo.course_name && (
          studentInfo.course_name.toLowerCase().includes(program.target_value?.toLowerCase()) ||
          program.target_value?.toLowerCase().includes(studentInfo.course_name?.toLowerCase())
        )) {
          console.log(`✅ Program - Course match (partial): ${program.target_value}`);
          return true;
        }
        // CRITICAL FIX: Handle comma-separated course list
        if (studentInfo.course_name && program.target_value) {
          const targetCourses = program.target_value.toLowerCase().split(',').map(c => c.trim()).filter(c => c.length > 0);
          const courseLower = studentInfo.course_name.toLowerCase().trim();
          for (const targetCourse of targetCourses) {
            if (targetCourse === courseLower || targetCourse.includes(courseLower) || courseLower.includes(targetCourse)) {
              console.log(`✅ Program - Course match (comma-separated list): ${program.target_value}`);
              return true;
            }
          }
        }
      }
      
      // Year targeting with proper type conversion
      if (program.target_type === 'year') {
        const targetYear = String(program.target_value);
        const studentYear = String(studentInfo.year_of_study);
        if (targetYear === studentYear) {
          console.log(`✅ Program - Year match: ${program.target_value}`);
          return true;
        }
      }
      
      // Program targeting
      if (program.target_type === 'program') {
        const programMatch = studentPrograms.some(p => 
          p === program.target_value ||
          p?.toLowerCase().includes(program.target_value?.toLowerCase()) ||
          program.target_value?.toLowerCase().includes(p?.toLowerCase())
        );
        if (programMatch) {
          console.log(`✅ Program - Program match: ${program.target_value}`);
          return true;
        }
      }
      
      console.log(`❌ Program - No match`);
      return false;
    });
    
    console.log(`Filtered ${filteredPrograms.length} short-term programs for student`);
    res.json({ success: true, data: filteredPrograms });
  } catch (error) {
    console.error('Error fetching student short-term programs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create new short-term program
app.post('/api/short-term-programs', async (req, res) => {
  try {
    const {
      title,
      description,
      duration_value,
      duration_unit,
      start_date,
      end_date,
      target_type,
      target_value,
      lecturer_id,
      lecturer_name,
      created_by,
      created_by_id
    } = req.body;

    console.log('=== CREATING SHORT-TERM PROGRAM ===');
    console.log('Program Data:', req.body);

    const result = await pool.query(
      `INSERT INTO short_term_programs 
       (title, description, duration_value, duration_unit, start_date, end_date, 
        target_type, target_value, lecturer_id, lecturer_name, created_by, created_by_id) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) 
       RETURNING *`,
      [title, description, duration_value, duration_unit, start_date, end_date,
       target_type, target_value, lecturer_id, lecturer_name, created_by, created_by_id]
    );

    console.log('Short-term program created:', result.rows[0]);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error creating short-term program:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete short-term program
app.delete('/api/short-term-programs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'DELETE FROM short_term_programs WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Short-term program not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error deleting short-term program:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update short-term program status (for auto-expiry)
app.patch('/api/short-term-programs/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    const result = await pool.query(
      'UPDATE short_term_programs SET status = $1 WHERE id = $2 RETURNING *',
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Short-term program not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error updating short-term program status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ================================
// SECURE FILTERED ENDPOINTS
// ================================

// Get students by lecturer (only students in lecturer's programs)
app.get('/api/students/by-lecturer', async (req, res) => {
  try {
    const { lecturer_id } = req.query;
    
    console.log('=== FETCHING STUDENTS BY LECTURER ===');
    console.log('Lecturer ID:', lecturer_id);
    
    if (!lecturer_id) {
      return res.status(400).json({ 
        success: false, 
        error: 'Lecturer ID is required' 
      });
    }
    
    // Get students enrolled in lecturer's programs
    const result = await pool.query(`
      SELECT DISTINCT s.id, s.name, s.registration_number, s.academic_year, 
             s.course_id, s.current_semester, s.email, s.phone, s.created_at,
             c.name as course_name, d.name as department_name, col.name as college_name
      FROM students s
      LEFT JOIN courses c ON s.course_id = c.id
      LEFT JOIN departments d ON c.department_id = d.id
      LEFT JOIN colleges col ON d.college_id = col.id
      WHERE s.course_id IN (
        SELECT DISTINCT course_id FROM programs 
        WHERE lecturer_id = $1 OR lecturer_name IN (
          SELECT username FROM lecturers WHERE id = $1
        )
      )
      ORDER BY s.name ASC
    `, [lecturer_id]);
    
    console.log(`Found ${result.rows.length} students for lecturer ${lecturer_id}`);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching students by lecturer:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get assignments by lecturer (only lecturer's assignments)
app.get('/api/assignments/lecturer', async (req, res) => {
  try {
    const { lecturer_id } = req.query;
    
    console.log('=== FETCHING ASSIGNMENTS BY LECTURER ===');
    console.log('Lecturer ID:', lecturer_id);
    
    if (!lecturer_id) {
      return res.status(400).json({ 
        success: false, 
        error: 'Lecturer ID is required' 
      });
    }
    
    // Get assignments created by this lecturer
    const result = await pool.query(`
      SELECT a.*, p.name as program_name
      FROM assignments a
      LEFT JOIN programs p ON a.program_id = p.id
      WHERE a.lecturer_id = $1
      ORDER BY a.created_at DESC
    `, [lecturer_id]);
    
    console.log(`Found ${result.rows.length} assignments for lecturer ${lecturer_id}`);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching assignments by lecturer:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get assignments by student (only assignments for student's programs)
app.get('/api/assignments/student', async (req, res) => {
  try {
    const { student_id, student_username } = req.query;
    
    console.log('=== FETCHING ASSIGNMENTS BY STUDENT ===');
    console.log('Student ID:', student_id);
    console.log('Student Username:', student_username);
    
    if (!student_id && !student_username) {
      return res.status(400).json({ 
        success: false, 
        error: 'Student ID or username is required' 
      });
    }
    
    // Get student information
    let studentInfo = null;
    if (student_id) {
      const studentResult = await pool.query(
        'SELECT * FROM students WHERE id = $1',
        [student_id]
      );
      if (studentResult.rows.length > 0) {
        studentInfo = studentResult.rows[0];
      }
    } else if (student_username) {
      const studentResult = await pool.query(
        'SELECT * FROM students WHERE registration_number = $1 OR email = $1',
        [student_username]
      );
      if (studentResult.rows.length > 0) {
        studentInfo = studentResult.rows[0];
      }
    }
    
    if (!studentInfo) {
      console.log('Student not found');
      return res.json({ success: true, data: [] });
    }
    
    console.log('Student Info:', studentInfo);
    
    // Get student's programs
    const programsResult = await pool.query(
      'SELECT id FROM programs WHERE course_id = $1',
      [studentInfo.course_id]
    );
    const programIds = programsResult.rows.map(p => p.id);
    
    if (programIds.length === 0) {
      console.log('No programs found for student');
      return res.json({ success: true, data: [] });
    }
    
    // Get assignments for student's programs
    const result = await pool.query(`
      SELECT a.*, p.name as program_name
      FROM assignments a
      LEFT JOIN programs p ON a.program_id = p.id
      WHERE a.program_id = ANY($1)
      ORDER BY a.deadline ASC
    `, [programIds]);
    
    console.log(`Found ${result.rows.length} assignments for student`);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching assignments by student:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get announcements by lecturer (only lecturer's announcements)
app.get('/api/announcements/lecturer', async (req, res) => {
  try {
    const { lecturer_id } = req.query;
    
    console.log('=== FETCHING ANNOUNCEMENTS BY LECTURER ===');
    console.log('Lecturer ID:', lecturer_id);
    
    if (!lecturer_id) {
      return res.status(400).json({ 
        success: false, 
        error: 'Lecturer ID is required' 
      });
    }
    
    // Get announcements created by this lecturer
    const result = await pool.query(`
      SELECT * FROM announcements 
      WHERE created_by = $1 AND created_by_type = 'lecturer'
      ORDER BY created_at DESC
    `, [lecturer_id]);
    
    console.log(`Found ${result.rows.length} announcements for lecturer ${lecturer_id}`);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching announcements by lecturer:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get live classes by student (only live classes for student's programs)
app.get('/api/live-classes/student', async (req, res) => {
  try {
    const { student_id, student_username } = req.query;
    
    console.log('=== FETCHING LIVE CLASSES BY STUDENT ===');
    console.log('Student ID:', student_id);
    console.log('Student Username:', student_username);
    
    if (!student_id && !student_username) {
      return res.status(400).json({ 
        success: false, 
        error: 'Student ID or username is required' 
      });
    }
    
    // Get student information
    let studentInfo = null;
    if (student_id) {
      const studentResult = await pool.query(
        'SELECT * FROM students WHERE id = $1',
        [student_id]
      );
      if (studentResult.rows.length > 0) {
        studentInfo = studentResult.rows[0];
      }
    } else if (student_username) {
      const studentResult = await pool.query(
        'SELECT * FROM students WHERE registration_number = $1 OR email = $1',
        [student_username]
      );
      if (studentResult.rows.length > 0) {
        studentInfo = studentResult.rows[0];
      }
    }
    
    if (!studentInfo) {
      console.log('Student not found');
      return res.json({ success: true, data: [] });
    }
    
    // Get student's programs
    const programsResult = await pool.query(
      'SELECT name FROM programs WHERE course_id = $1',
      [studentInfo.course_id]
    );
    const programNames = programsResult.rows.map(p => p.name);
    
    if (programNames.length === 0) {
      console.log('No programs found for student');
      return res.json({ success: true, data: [] });
    }
    
    // Get live classes for student's programs
    const result = await pool.query(`
      SELECT * FROM live_classes 
      WHERE program_name = ANY($1)
      ORDER BY scheduled_time DESC
    `, [programNames]);
    
    console.log(`Found ${result.rows.length} live classes for student`);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching live classes by student:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ================================
// TIMETABLE MANAGEMENT SYSTEM
// ================================

// Initialize timetable table
const initializeTimetableTable = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS timetable (
        id SERIAL PRIMARY KEY,
        day VARCHAR(20) NOT NULL,
        time_start VARCHAR(10) NOT NULL,
        time_end VARCHAR(10) NOT NULL,
        program_name VARCHAR(255) NOT NULL,
        lecturer_name VARCHAR(255) NOT NULL,
        venue VARCHAR(255) NOT NULL,
        course_name VARCHAR(255),
        department_name VARCHAR(255),
        college_name VARCHAR(255),
        semester INTEGER DEFAULT 1,
        academic_year VARCHAR(20) DEFAULT '2024/2025',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Timetable table initialized');
  } catch (error) {
    console.error('❌ Error initializing timetable table:', error);
  }
};

// Initialize venues table
const initializeVenuesTable = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS venues (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        short_name VARCHAR(100) NOT NULL,
        capacity INTEGER DEFAULT 0,
        type VARCHAR(100) NOT NULL,
        building VARCHAR(255) NOT NULL,
        floor VARCHAR(100),
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Venues table initialized');
  } catch (error) {
    console.error('❌ Error initializing venues table:', error);
  }
};

// Get all timetable entries
app.get('/api/timetable', async (req, res) => {
  try {
    console.log('=== TIMETABLE GET ALL DEBUG ===');
    const result = await pool.query(`
      SELECT * FROM timetable 
      ORDER BY 
        CASE day 
          WHEN 'Monday' THEN 1 
          WHEN 'Tuesday' THEN 2 
          WHEN 'Wednesday' THEN 3 
          WHEN 'Thursday' THEN 4 
          WHEN 'Friday' THEN 5 
          WHEN 'Saturday' THEN 6 
          ELSE 7 
        END, 
        time_start
    `);
    
    console.log('Total Timetable Entries:', result.rows.length);
    console.log('Sample Entry:', result.rows[0]);
    
    res.json({ 
      success: true, 
      data: result.rows 
    });
  } catch (error) {
    console.error('Error fetching timetable:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Create new timetable entry
app.post('/api/timetable', async (req, res) => {
  try {
    console.log('=== TIMETABLE CREATE DEBUG ===');
    console.log('Request Body:', req.body);
    
    const {
      day,
      time_start,
      time_end,
      program_name,
      lecturer_name,
      venue,
      course_name,
      department_name,
      college_name,
      semester,
      academic_year
    } = req.body;

    // Validate required fields
    if (!day || !time_start || !time_end || !program_name || !lecturer_name || !venue) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: day, time_start, time_end, program_name, lecturer_name, venue' 
      });
    }

    // Check for time conflicts
    const conflictCheck = await pool.query(`
      SELECT * FROM timetable 
      WHERE day = $1 
      AND venue = $2 
      AND (
        (time_start <= $3 AND time_end > $3) OR
        (time_start < $4 AND time_end >= $4) OR
        (time_start >= $3 AND time_end <= $4)
      )
    `, [day, venue, time_start, time_end]);

    if (conflictCheck.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Time conflict detected! ${venue} is already booked on ${day} during this time.`,
        conflictingEntry: conflictCheck.rows[0]
      });
    }

    // Insert new timetable entry
    const result = await pool.query(`
      INSERT INTO timetable (
        day, time_start, time_end, program_name, lecturer_name, venue,
        course_name, department_name, college_name, semester, academic_year
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) 
      RETURNING *
    `, [
      day, time_start, time_end, program_name, lecturer_name, venue,
      course_name, department_name, college_name, semester || 1, academic_year || '2024/2025'
    ]);

    console.log('Timetable entry created:', result.rows[0]);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error creating timetable entry:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update timetable entry
app.put('/api/timetable/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      day,
      time_start,
      time_end,
      program_name,
      lecturer_name,
      venue,
      course_name,
      department_name,
      college_name,
      semester,
      academic_year
    } = req.body;

    console.log('=== TIMETABLE UPDATE DEBUG ===');
    console.log('Updating entry ID:', id);
    console.log('Update data:', req.body);

    // Check for time conflicts (excluding current entry)
    const conflictCheck = await pool.query(`
      SELECT * FROM timetable 
      WHERE day = $1 
      AND venue = $2 
      AND id != $3
      AND (
        (time_start <= $4 AND time_end > $4) OR
        (time_start < $5 AND time_end >= $5) OR
        (time_start >= $4 AND time_end <= $5)
      )
    `, [day, venue, id, time_start, time_end]);

    if (conflictCheck.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Time conflict detected! ${venue} is already booked on ${day} during this time.`,
        conflictingEntry: conflictCheck.rows[0]
      });
    }

    const result = await pool.query(`
      UPDATE timetable SET 
        day = $1, time_start = $2, time_end = $3, program_name = $4, 
        lecturer_name = $5, venue = $6, course_name = $7, 
        department_name = $8, college_name = $9, semester = $10, 
        academic_year = $11, updated_at = CURRENT_TIMESTAMP
      WHERE id = $12 
      RETURNING *
    `, [
      day, time_start, time_end, program_name, lecturer_name, venue,
      course_name, department_name, college_name, semester, academic_year, id
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Timetable entry not found' });
    }

    console.log('Timetable entry updated:', result.rows[0]);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error updating timetable entry:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete timetable entry
app.delete('/api/timetable/:id', async (req, res) => {
  try {
    const { id } = req.params;

    console.log('=== TIMETABLE DELETE DEBUG ===');
    console.log('Deleting entry ID:', id);

    const result = await pool.query('DELETE FROM timetable WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Timetable entry not found' });
    }

    console.log('Timetable entry deleted:', result.rows[0]);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error deleting timetable entry:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get timetable entries by lecturer
app.get('/api/timetable/lecturer/:lecturerName', async (req, res) => {
  try {
    const { lecturerName } = req.params;

    console.log('=== LECTURER TIMETABLE DEBUG ===');
    console.log('Fetching timetable for lecturer:', lecturerName);

    const result = await pool.query(`
      SELECT * FROM timetable 
      WHERE lecturer_name = $1 
      ORDER BY 
        CASE day 
          WHEN 'Monday' THEN 1 
          WHEN 'Tuesday' THEN 2 
          WHEN 'Wednesday' THEN 3 
          WHEN 'Thursday' THEN 4 
          WHEN 'Friday' THEN 5 
          WHEN 'Saturday' THEN 6 
          ELSE 7 
        END, 
        time_start
    `, [lecturerName]);

    console.log('Lecturer timetable entries:', result.rows.length);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching lecturer timetable:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get timetable entries by program
app.get('/api/timetable/program/:programName', async (req, res) => {
  try {
    const { programName } = req.params;

    console.log('=== PROGRAM TIMETABLE DEBUG ===');
    console.log('Fetching timetable for program:', programName);

    const result = await pool.query(`
      SELECT * FROM timetable 
      WHERE program_name = $1 
      ORDER BY 
        CASE day 
          WHEN 'Monday' THEN 1 
          WHEN 'Tuesday' THEN 2 
          WHEN 'Wednesday' THEN 3 
          WHEN 'Thursday' THEN 4 
          WHEN 'Friday' THEN 5 
          WHEN 'Saturday' THEN 6 
          ELSE 7 
        END, 
        time_start
    `, [programName]);

    console.log('Program timetable entries:', result.rows.length);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching program timetable:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get timetable statistics
app.get('/api/timetable/stats', async (req, res) => {
  try {
    const totalEntries = await pool.query('SELECT COUNT(*) FROM timetable');
    const activeLecturers = await pool.query('SELECT COUNT(DISTINCT lecturer_name) FROM timetable');
    const programsScheduled = await pool.query('SELECT COUNT(DISTINCT program_name) FROM timetable');
    const venuesUsed = await pool.query('SELECT COUNT(DISTINCT venue) FROM timetable');

    const stats = {
      totalSchedules: parseInt(totalEntries.rows[0].count),
      activeLecturers: parseInt(activeLecturers.rows[0].count),
      programsScheduled: parseInt(programsScheduled.rows[0].count),
      venuesUsed: parseInt(venuesUsed.rows[0].count)
    };

    console.log('=== TIMETABLE STATS ===');
    console.log('Statistics:', stats);

    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Error fetching timetable statistics:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// VENUES API ENDPOINTS

// Get all venues
app.get('/api/venues', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM venues ORDER BY name');
    console.log('=== VENUES API DEBUG ===');
    console.log('Total venues:', result.rows.length);
    console.log('Venues:', result.rows);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching venues:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create new venue
app.post('/api/venues', async (req, res) => {
  try {
    const {
      name,
      short_name,
      capacity,
      type,
      building,
      floor,
      description
    } = req.body;

    console.log('=== VENUE CREATE DEBUG ===');
    console.log('Received data:', req.body);

    // Validate required fields
    if (!name || !short_name || !type || !building) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: name, short_name, type, building' 
      });
    }

    // Check for duplicate venue names
    const duplicateCheck = await pool.query(
      'SELECT * FROM venues WHERE name = $1 OR short_name = $2',
      [name, short_name]
    );

    if (duplicateCheck.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Venue with this name or short name already exists'
      });
    }

    // Insert new venue
    const result = await pool.query(`
      INSERT INTO venues (name, short_name, capacity, type, building, floor, description) 
      VALUES ($1, $2, $3, $4, $5, $6, $7) 
      RETURNING *
    `, [name, short_name, capacity || 0, type, building, floor || '', description || '']);

    console.log('Venue created:', result.rows[0]);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error creating venue:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update venue
app.put('/api/venues/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      short_name,
      capacity,
      type,
      building,
      floor,
      description
    } = req.body;

    console.log('=== VENUE UPDATE DEBUG ===');
    console.log('Updating venue ID:', id);
    console.log('Update data:', req.body);

    const result = await pool.query(`
      UPDATE venues SET 
        name = $1, short_name = $2, capacity = $3, type = $4, 
        building = $5, floor = $6, description = $7, updated_at = CURRENT_TIMESTAMP
      WHERE id = $8 
      RETURNING *
    `, [name, short_name, capacity, type, building, floor, description, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Venue not found' });
    }

    console.log('Venue updated:', result.rows[0]);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error updating venue:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete venue
app.delete('/api/venues/:id', async (req, res) => {
  try {
    const { id } = req.params;

    console.log('=== VENUE DELETE DEBUG ===');
    console.log('Deleting venue ID:', id);

    // Check if venue is being used in timetable
    const usageCheck = await pool.query('SELECT COUNT(*) as count FROM timetable WHERE venue = (SELECT name FROM venues WHERE id = $1)', [id]);
    
    if (parseInt(usageCheck.rows[0].count) > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete venue. It is currently being used in the timetable.'
      });
    }

    const result = await pool.query('DELETE FROM venues WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Venue not found' });
    }

    console.log('Venue deleted:', result.rows[0]);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error deleting venue:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PASSWORD RESET FUNCTIONALITY

// Create password reset logs table
const createPasswordResetTable = async () => {
  try {
    // Create password_reset_logs table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS password_reset_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        user_name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        user_type VARCHAR(50) NOT NULL,
        reset_code VARCHAR(10) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL,
        used BOOLEAN DEFAULT FALSE,
        used_at TIMESTAMP
      )
    `);

    // Make sure reset_code column can hold longer markers (e.g. 'MANUAL_RESET')
    try {
      await pool.query(`
        ALTER TABLE password_reset_logs
        ALTER COLUMN reset_code TYPE VARCHAR(255)
      `);
      console.log('✅ reset_code column in password_reset_logs resized to VARCHAR(255)');
    } catch (error) {
      console.log('reset_code resize may not be needed or failed:', error.message);
    }

    // Create admin_settings table for admin email
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admin_settings (
        id SERIAL PRIMARY KEY,
        setting_key VARCHAR(100) UNIQUE NOT NULL,
        setting_value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert default admin email if not exists
    await pool.query(`
      INSERT INTO admin_settings (setting_key, setting_value) 
      VALUES ('admin_email', 'uj23hiueddhpna2y@ethereal.email')
      ON CONFLICT (setting_key) DO NOTHING
    `);
    console.log('✅ Password reset logs table created/verified');
  } catch (error) {
    console.error('Error creating password reset table:', error);
  }
};

// Generate random 6-digit verification code
const generateResetCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Manual password reset endpoint
app.post('/api/password-reset/manual', async (req, res) => {
  try {
    const { userId, userType, newPassword, adminEmail } = req.body;
    
    console.log('=== MANUAL PASSWORD RESET ===');
    console.log('User ID:', userId);
    console.log('User Type:', userType);
    console.log('Admin Email:', adminEmail);
    
    // Update password in respective table
    let updateResult;
    let userName = '';
    let userEmail = '';
    
    if (userType === 'student') {
      updateResult = await pool.query(
        'UPDATE students SET password = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING name, email',
        [newPassword, userId]
      );
      if (updateResult.rows.length > 0) {
        userName = updateResult.rows[0].name;
        userEmail = updateResult.rows[0].email;
      }
    } else if (userType === 'lecturer') {
      updateResult = await pool.query(
        'UPDATE lecturers SET password = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING name, email',
        [newPassword, userId]
      );
      if (updateResult.rows.length > 0) {
        userName = updateResult.rows[0].name;
        userEmail = updateResult.rows[0].email;
      }
    }
    
    if (!updateResult || updateResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    // Update password_records table
    await pool.query(
      'UPDATE password_records SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE user_type = $2 AND user_id = $3',
      [newPassword, userType, userId]
    );
    
    // Log the manual reset
    await pool.query(
      `INSERT INTO password_reset_logs (user_id, user_name, email, user_type, reset_code, expires_at, used, used_at) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [userId, userName, adminEmail, userType, 'MANUAL_RESET', new Date(Date.now() + 24*60*60*1000), true, new Date()]
    );
    
    console.log('✅ Manual password reset completed for:', userName);
    res.json({ 
      success: true, 
      message: `Password successfully reset for ${userName}`,
      data: { userName, userEmail, userType }
    });
    
  } catch (error) {
    console.error('Error in manual password reset:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Verify email exists in system - NEW ENDPOINT
app.post('/api/password-reset/verify-email', async (req, res) => {
  try {
    const { email, userType } = req.body;
    
    console.log('=== VERIFYING EMAIL ===');
    console.log('Email:', email);
    console.log('User Type:', userType);
    
    if (!email || !userType) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email and user type are required' 
      });
    }
    
    // Find user by email
    let user = null;
    
    if (userType === 'student') {
      const result = await pool.query('SELECT id, name, email FROM students WHERE email = $1', [email]);
      if (result.rows.length > 0) {
        user = result.rows[0];
      }
    } else if (userType === 'lecturer') {
      const result = await pool.query('SELECT id, name, email FROM lecturers WHERE email = $1', [email]);
      if (result.rows.length > 0) {
        user = result.rows[0];
      }
    }
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: `No ${userType} found with email: ${email}. Please verify your email address is correct.` 
      });
    }
    
    console.log('✅ Email verified for user:', user.name);
    res.json({ 
      success: true, 
      message: 'Email verified',
      data: {
        userName: user.name,
        email: user.email
      }
    });
    
  } catch (error) {
    console.error('Error verifying email:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Send reset code endpoint
app.post('/api/password-reset/send-code', async (req, res) => {
  try {
    const { email, userType, adminEmail } = req.body;
    
    console.log('=== SENDING RESET CODE ===');
    console.log('User Email:', email);
    console.log('User Type:', userType);
    console.log('Admin Email from request:', adminEmail);
    
    // Get current admin email from database
    const currentAdminEmail = await getAdminEmail();
    console.log('Current admin email from database:', currentAdminEmail);
    
    // Find user by email
    let user = null;
    let userId = null;
    let userName = '';
    
    if (userType === 'student') {
      const result = await pool.query('SELECT id, name, email FROM students WHERE email = $1', [email]);
      if (result.rows.length > 0) {
        user = result.rows[0];
        userId = user.id;
        userName = user.name;
      }
    } else if (userType === 'lecturer') {
      const result = await pool.query('SELECT id, name, email FROM lecturers WHERE email = $1', [email]);
      if (result.rows.length > 0) {
        user = result.rows[0];
        userId = user.id;
        userName = user.name;
      }
    }
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: `No ${userType} found with email: ${email}` 
      });
    }
    
    // Generate reset code
    const resetCode = generateResetCode();
    const expiresAt = new Date(Date.now() + 15*60*1000); // 15 minutes expiry
    
    // Save reset code to database
    await pool.query(
      `INSERT INTO password_reset_logs (user_id, user_name, email, user_type, reset_code, expires_at) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, userName, email, userType, resetCode, expiresAt]
    );
    
    console.log('✅ Reset code generated:', resetCode);
    console.log('✅ Code expires at:', expiresAt);
    console.log('✅ Sending email to user:', email);
    
    // Send real email to user
    const emailResult = await sendResetCodeEmail(email, userName, resetCode);
    
    if (emailResult.success) {
      console.log('✅ Reset code sent to user email:', email);
      
      // SECURE RESPONSE - No reset code included
      res.json({ 
        success: true, 
        message: `Reset code sent to ${email}. Please check your email.`,
        data: { 
          userName,
          email,
          expiresAt,
          emailSent: !emailResult.simulated
        }
      });
    } else {
      res.status(500).json({ 
        success: false, 
        error: 'Failed to send reset code email'
      });
    }
    
  } catch (error) {
    console.error('Error sending reset code:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Verify reset code and reset password endpoint
app.post('/api/password-reset/verify-and-reset', async (req, res) => {
  try {
    const { email, resetCode, newPassword, userType } = req.body;
    
    console.log('=== VERIFYING RESET CODE ===');
    console.log('Email:', email);
    console.log('Reset Code:', resetCode);
    console.log('User Type:', userType);
    
    // Find valid reset code
    const codeResult = await pool.query(
      `SELECT * FROM password_reset_logs 
       WHERE email = $1 AND reset_code = $2 AND user_type = $3 AND used = FALSE AND expires_at > CURRENT_TIMESTAMP
       ORDER BY created_at DESC LIMIT 1`,
      [email, resetCode, userType]
    );
    
    if (codeResult.rows.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid or expired reset code' 
      });
    }
    
    const resetLog = codeResult.rows[0];
    
    // Update password in respective table
    let updateResult;
    if (userType === 'student') {
      updateResult = await pool.query(
        'UPDATE students SET password = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING name, email',
        [newPassword, resetLog.user_id]
      );
    } else if (userType === 'lecturer') {
      updateResult = await pool.query(
        'UPDATE lecturers SET password = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING name, email',
        [newPassword, resetLog.user_id]
      );
    }
    
    if (!updateResult || updateResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    // Update password_records table
    await pool.query(
      'UPDATE password_records SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE user_type = $2 AND user_id = $3',
      [newPassword, userType, resetLog.user_id]
    );
    
    // Mark reset code as used
    await pool.query(
      'UPDATE password_reset_logs SET used = TRUE, used_at = CURRENT_TIMESTAMP WHERE id = $1',
      [resetLog.id]
    );
    
    console.log('✅ Password reset completed for:', resetLog.user_name);
    
    // Send confirmation email
    try {
      if (emailTransporter) {
        const confirmationEmail = {
          from: `"MUST LMS" <${ADMIN_EMAIL}>`,
          to: email,
          subject: 'Password Reset Successful - MUST LMS',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="text-align: center; margin-bottom: 30px;">
                <h1 style="color: #16a34a;">Password Reset Successful</h1>
              </div>
              
              <div style="background: #f0fdf4; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                <p>Dear ${resetLog.user_name},</p>
                <p>Your password has been successfully reset for your MUST LMS account.</p>
                <p>You can now log in with your new password.</p>
                
                <div style="background: #dcfce7; padding: 15px; border-radius: 6px; margin: 20px 0;">
                  <p style="margin: 0; color: #166534;"><strong>Security Notice:</strong></p>
                  <p style="margin: 5px 0 0 0; color: #166534;">If you did not make this change, please contact IT Support immediately.</p>
                </div>
              </div>
              
              <div style="text-align: center; color: #64748b; font-size: 12px;">
                <p>© 2026 Mbeya University of Science and Technology</p>
                <p>Contact IT Support: +255 25 295 7544</p>
              </div>
            </div>
          `
        };
        
        await emailTransporter.sendMail(confirmationEmail);
        console.log('✅ Password reset confirmation email sent');
      }
    } catch (error) {
      console.warn('⚠️ Failed to send confirmation email:', error.message);
    }

    res.json({ 
      success: true, 
      message: 'Password reset successfully',
      data: { 
        userName: updateResult.rows[0].name,
        email: updateResult.rows[0].email
      }
    });
    
  } catch (error) {
    console.error('Error verifying reset code:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get password reset logs endpoint
app.get('/api/password-reset-logs', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM password_reset_logs 
      ORDER BY created_at DESC 
      LIMIT 50
    `);
    
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching password reset logs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ACCOUNT LOCK/UNLOCK ENDPOINTS

// Lock user account endpoint
app.post('/api/user/lock', async (req, res) => {
  try {
    const { userId, userType } = req.body;
    
    if (!userId || !userType) {
      return res.status(400).json({ success: false, error: 'userId and userType are required' });
    }
    
    console.log(`=== LOCKING USER ACCOUNT ===`);
    console.log(`User ID: ${userId}, Type: ${userType}`);
    
    let updateResult;
    
    if (userType === 'student') {
      updateResult = await pool.query(
        'UPDATE students SET is_locked = TRUE, locked_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING name, email, is_locked',
        [userId]
      );
    } else if (userType === 'lecturer') {
      updateResult = await pool.query(
        'UPDATE lecturers SET is_locked = TRUE, locked_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING name, email, is_locked',
        [userId]
      );
    } else {
      return res.status(400).json({ success: false, error: 'Invalid userType' });
    }
    
    if (updateResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    const user = updateResult.rows[0];
    console.log(`✅ Account locked for: ${user.name}`);
    
    res.json({ 
      success: true, 
      message: `Account locked for ${user.name}`,
      data: { 
        userName: user.name, 
        email: user.email, 
        is_locked: user.is_locked 
      }
    });
  } catch (error) {
    console.error('Error locking user account:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Unlock user account endpoint
app.post('/api/user/unlock', async (req, res) => {
  try {
    const { userId, userType } = req.body;
    
    if (!userId || !userType) {
      return res.status(400).json({ success: false, error: 'userId and userType are required' });
    }
    
    console.log(`=== UNLOCKING USER ACCOUNT ===`);
    console.log(`User ID: ${userId}, Type: ${userType}`);
    
    let updateResult;
    
    if (userType === 'student') {
      updateResult = await pool.query(
        'UPDATE students SET is_locked = FALSE, locked_at = NULL WHERE id = $1 RETURNING name, email, is_locked',
        [userId]
      );
    } else if (userType === 'lecturer') {
      updateResult = await pool.query(
        'UPDATE lecturers SET is_locked = FALSE, locked_at = NULL WHERE id = $1 RETURNING name, email, is_locked',
        [userId]
      );
    } else {
      return res.status(400).json({ success: false, error: 'Invalid userType' });
    }
    
    if (updateResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    const user = updateResult.rows[0];
    console.log(`✅ Account unlocked for: ${user.name}`);
    
    res.json({ 
      success: true, 
      message: `Account unlocked for ${user.name}`,
      data: { 
        userName: user.name, 
        email: user.email, 
        is_locked: user.is_locked 
      }
    });
  } catch (error) {
    console.error('Error unlocking user account:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Admin email configuration endpoint (separate from password reset)
app.post('/api/admin/configure-email', async (req, res) => {
  try {
    const { adminEmail } = req.body;
    
    console.log('=== CONFIGURING ADMIN EMAIL ===');
    console.log('Admin Email from request:', adminEmail);
    
    // Get current admin email from database
    const currentAdminEmail = await getAdminEmail();
    console.log('Current admin email from database:', currentAdminEmail);
    
    // Admin email configuration successful
    console.log('✅ Admin email configured:', currentAdminEmail);
    
    res.json({ 
      success: true, 
      message: `Admin email configured successfully: ${currentAdminEmail}`,
      data: { 
        adminEmail: currentAdminEmail,
        configured: true
      }
    });
    
  } catch (error) {
    console.error('Error configuring admin email:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Admin email management endpoints
// Get admin email
app.get('/api/admin/email', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT setting_value FROM admin_settings WHERE setting_key = $1',
      ['admin_email']
    );
    
    if (result.rows.length > 0) {
      res.json({ 
        success: true, 
        data: { adminEmail: result.rows[0].setting_value }
      });
    } else {
      res.json({ 
        success: true, 
        data: { adminEmail: 'admin@must.ac.tz' }
      });
    }
  } catch (error) {
    console.error('Error fetching admin email:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Save admin email
app.post('/api/admin/email', async (req, res) => {
  try {
    const { adminEmail } = req.body;
    
    if (!adminEmail || !adminEmail.includes('@')) {
      return res.status(400).json({ 
        success: false, 
        error: 'Valid admin email is required' 
      });
    }
    
    // Update admin email in database
    await pool.query(`
      INSERT INTO admin_settings (setting_key, setting_value, updated_at) 
      VALUES ('admin_email', $1, CURRENT_TIMESTAMP)
      ON CONFLICT (setting_key) 
      DO UPDATE SET setting_value = $1, updated_at = CURRENT_TIMESTAMP
    `, [adminEmail]);
    
    console.log('✅ Admin email updated to:', adminEmail);
    
    res.json({ 
      success: true, 
      message: 'Admin email updated successfully',
      data: { adminEmail }
    });
  } catch (error) {
    console.error('Error saving admin email:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== PASSWORD CHANGE ENDPOINT ====================

// Change password for logged-in users
app.post('/api/change-password', async (req, res) => {
  try {
    const { userId, username, currentPassword, newPassword, userType } = req.body;
    
    console.log('=== CHANGE PASSWORD DEBUG ===');
    console.log('User Type:', userType);
    console.log('User ID:', userId);
    console.log('Username:', username);
    
    // Validate inputs
    if (!currentPassword || !newPassword || !userType) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields' 
      });
    }
    
    // Determine which table to query
    const table = userType === 'student' ? 'students' : 'lecturers';
    const idField = userType === 'student' ? 'registration_number' : 'employee_id';
    
    // Get user from database
    const userQuery = `SELECT * FROM ${table} WHERE ${idField} = $1`;
    const userResult = await pool.query(userQuery, [username]);
    
    if (userResult.rows.length === 0) {
      console.log('User not found in database');
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }
    
    const user = userResult.rows[0];
    console.log('User found:', user.name || user.username);
    console.log('Stored password (first 4 chars):', user.password?.substring(0, 4) + '...');
    console.log('Provided password (first 4 chars):', currentPassword?.substring(0, 4) + '...');
    console.log('Password match:', user.password === currentPassword);
    
    // Verify current password
    if (user.password !== currentPassword) {
      console.log('Current password incorrect');
      console.log('Expected:', user.password);
      console.log('Received:', currentPassword);
      return res.status(401).json({ 
        success: false, 
        message: 'Current password is incorrect. Please check and try again.' 
      });
    }
    
    // Update password
    const updateQuery = `UPDATE ${table} SET password = $1 WHERE ${idField} = $2 RETURNING *`;
    const updateResult = await pool.query(updateQuery, [newPassword, username]);
    
    if (updateResult.rows.length === 0) {
      console.log('Failed to update password');
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to update password' 
      });
    }
    
    console.log('Password updated successfully for:', username);
    
    // Also update in password_records table if it exists
    try {
      await pool.query(`
        UPDATE password_records 
        SET password = $1, updated_at = CURRENT_TIMESTAMP 
        WHERE user_type = $2 AND (user_id = $3 OR username = $4)
      `, [newPassword, userType, userId, username]);
      console.log('Password record also updated');
    } catch (recordError) {
      console.log('Password records table may not exist or update failed:', recordError.message);
    }
    
    res.json({ 
      success: true, 
      message: 'Password updated successfully',
      data: {
        username: user.name || user.username,
        userType
      }
    });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while changing password',
      error: error.message 
    });
  }
});

// ==================== BULK UPLOAD ENDPOINTS ====================
// Bulk upload students from CSV
app.post('/api/students/bulk-upload', async (req, res) => {
  try {
    const { students } = req.body;
    
    if (!students || !Array.isArray(students) || students.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Students array is required and must not be empty' 
      });
    }

    console.log(`=== BULK UPLOAD STUDENTS - Processing ${students.length} students ===`);
    
    const results = {
      successful: [],
      failed: []
    };

    // Process each student
    for (let i = 0; i < students.length; i++) {
      const student = students[i];
      
      try {
        // Validate required fields
        if (!student.name || !student.email || !student.courseId) {
          results.failed.push({
            row: i + 1,
            data: student,
            error: 'Missing required fields (name, email, courseId)'
          });
          continue;
        }

        // Check if email already exists
        const existingEmail = await pool.query(
          'SELECT id FROM students WHERE email = $1',
          [student.email]
        );
        
        if (existingEmail.rows.length > 0) {
          results.failed.push({
            row: i + 1,
            data: student,
            error: `Email ${student.email} already exists`
          });
          continue;
        }

        // Check if registration number already exists (if provided)
        if (student.registrationNumber) {
          const existingRegNumber = await pool.query(
            'SELECT id FROM students WHERE registration_number = $1',
            [student.registrationNumber]
          );
          
          if (existingRegNumber.rows.length > 0) {
            results.failed.push({
              row: i + 1,
              data: student,
              error: `Registration number ${student.registrationNumber} already exists`
            });
            continue;
          }
        }

        // Insert student
        // Generate registration number if not provided
        const registrationNumber = student.registrationNumber || `MUST/${new Date().getFullYear()}/${String(Date.now()).slice(-6)}`;
        
        const result = await pool.query(
          `INSERT INTO students (name, registration_number, academic_year, course_id, current_semester, email, phone, password, year_of_study, academic_level) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
          [
            student.name,
            registrationNumber,
            student.academicYear || new Date().getFullYear().toString(),
            student.courseId,
            student.currentSemester || 1,
            student.email,
            student.phone || null,
            student.password || 'student123', // Default password
            student.yearOfStudy || 1, // Default to first year
            student.academicLevel || 'bachelor' // Default to bachelor
          ]
        );

        // Save to password records
        await pool.query(
          `INSERT INTO password_records (user_type, user_id, username, password_hash) 
           VALUES ('student', $1, $2, $3)`,
          [result.rows[0].id, registrationNumber, student.password || 'student123']
        );

        results.successful.push({
          row: i + 1,
          data: result.rows[0]
        });

      } catch (error) {
        console.error(`Error processing student at row ${i + 1}:`, error);
        results.failed.push({
          row: i + 1,
          data: student,
          error: error.message
        });
      }
    }

    console.log(`Bulk upload completed: ${results.successful.length} successful, ${results.failed.length} failed`);
    
    res.json({ 
      success: true, 
      message: `Processed ${students.length} students: ${results.successful.length} successful, ${results.failed.length} failed`,
      data: results
    });

  } catch (error) {
    console.error('Error in bulk upload students:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Bulk upload course management data (colleges, departments, courses, programs)
app.post('/api/course-management/bulk-upload', async (req, res) => {
  try {
    const { records } = req.body;

    if (!records || !Array.isArray(records) || records.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Records array is required and must not be empty'
      });
    }

    console.log(`=== BULK UPLOAD COURSE MANAGEMENT - Processing ${records.length} records ===`);

    const results = {
      successful: [],
      failed: []
    };

    for (let i = 0; i < records.length; i++) {
      const record = records[i];

      try {
        // Track created / reused IDs for this row
        let collegeId = null;
        let departmentId = null;
        let courseId = null;
        let programId = null;

        // 1. College
        if (record.collegeName) {
          const collegeResult = await pool.query(
            'SELECT id FROM colleges WHERE name = $1',
            [record.collegeName]
          );

          if (collegeResult.rows.length > 0) {
            collegeId = collegeResult.rows[0].id;
          } else {
            const newCollege = await pool.query(
              `INSERT INTO colleges (name, short_name, description, established)
               VALUES ($1, $2, $3, $4) RETURNING id`,
              [
                record.collegeName,
                record.collegeShortName || record.collegeName.substring(0, 10),
                record.collegeDescription || null,
                record.collegeEstablished || null
              ]
            );
            collegeId = newCollege.rows[0].id;
          }
        }

        // 2. Department
        if (record.departmentName) {
          const departmentResult = await pool.query(
            'SELECT id FROM departments WHERE name = $1',
            [record.departmentName]
          );

          if (departmentResult.rows.length > 0) {
            departmentId = departmentResult.rows[0].id;
          } else {
            const newDepartment = await pool.query(
              `INSERT INTO departments (name, college_id, description, head_of_department)
               VALUES ($1, $2, $3, $4) RETURNING id`,
              [
                record.departmentName,
                collegeId,
                record.departmentDescription || null,
                null
              ]
            );
            departmentId = newDepartment.rows[0].id;
          }
        }

        // 3. Course
        if (record.courseName || record.courseCode) {
          let courseResult = null;

          if (record.courseCode) {
            courseResult = await pool.query(
              'SELECT id FROM courses WHERE code = $1',
              [record.courseCode]
            );
          }

          if (!courseResult || courseResult.rows.length === 0) {
            if (record.courseName) {
              const fallbackCourseResult = await pool.query(
                'SELECT id FROM courses WHERE name = $1',
                [record.courseName]
              );

              if (fallbackCourseResult.rows.length > 0) {
                courseResult = fallbackCourseResult;
              }
            }
          }

          if (courseResult && courseResult.rows.length > 0) {
            courseId = courseResult.rows[0].id;
          } else {
            const newCourse = await pool.query(
              `INSERT INTO courses (name, code, department_id, duration, academic_level, year_of_study, description)
               VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
              [
                record.courseName || record.courseCode,
                record.courseCode || `${record.courseName || 'COURSE'}-${Date.now()}`,
                departmentId,
                record.courseDuration || 4,
                record.courseAcademicLevel || 'bachelor',
                record.courseYearOfStudy || 1,
                record.courseDescription || null
              ]
            );
            courseId = newCourse.rows[0].id;
          }
        }

        // 4. Program
        if (record.programName && courseId) {
          // Try to find lecturer by name or employee_id
          let lecturerId = null;
          if (record.programLecturerName) {
            const lecturerResult = await pool.query(
              'SELECT id FROM lecturers WHERE name = $1 OR employee_id = $1',
              [record.programLecturerName]
            );
            if (lecturerResult.rows.length > 0) {
              lecturerId = lecturerResult.rows[0].id;
            }
          }

          const programResult = await pool.query(
            `INSERT INTO programs (name, course_id, lecturer_id, credits, total_semesters, duration, lecturer_name, description)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
            [
              record.programName,
              courseId,
              lecturerId,
              record.programCredits || 0,
              record.programTotalSemesters || 1,
              record.programDuration || 1,
              record.programLecturerName || null,
              record.programDescription || null
            ]
          );
          programId = programResult.rows[0].id;
        }

        results.successful.push({
          row: i + 1,
          data: {
            collegeId,
            departmentId,
            courseId,
            programId
          }
        });
      } catch (error) {
        console.error(`Error processing course management record at row ${i + 1}:`, error);
        results.failed.push({
          row: i + 1,
          data: record,
          error: error.message
        });
      }
    }

    console.log(`Bulk course management upload completed: ${results.successful.length} successful, ${results.failed.length} failed`);

    res.json({
      success: true,
      message: `Processed ${records.length} records: ${results.successful.length} successful, ${results.failed.length} failed`,
      data: results
    });
  } catch (error) {
    console.error('Error in bulk course management upload:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Bulk upload lecturers from CSV
app.post('/api/lecturers/bulk-upload', async (req, res) => {
  try {
    const { lecturers } = req.body;
    
    if (!lecturers || !Array.isArray(lecturers) || lecturers.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Lecturers array is required and must not be empty' 
      });
    }

    console.log(`=== BULK UPLOAD LECTURERS - Processing ${lecturers.length} lecturers ===`);
    
    const results = {
      successful: [],
      failed: []
    };

    // Process each lecturer
    for (let i = 0; i < lecturers.length; i++) {
      const lecturer = lecturers[i];
      
      try {
        // Validate required fields
        if (!lecturer.name || !lecturer.email || !lecturer.employeeId) {
          results.failed.push({
            row: i + 1,
            data: lecturer,
            error: 'Missing required fields (name, email, employeeId)'
          });
          continue;
        }

        // Check if email already exists
        const existingEmail = await pool.query(
          'SELECT id FROM lecturers WHERE email = $1',
          [lecturer.email]
        );
        
        if (existingEmail.rows.length > 0) {
          results.failed.push({
            row: i + 1,
            data: lecturer,
            error: `Email ${lecturer.email} already exists`
          });
          continue;
        }

        // Check if employee ID already exists
        const existingEmployeeId = await pool.query(
          'SELECT id FROM lecturers WHERE employee_id = $1',
          [lecturer.employeeId]
        );
        
        if (existingEmployeeId.rows.length > 0) {
          results.failed.push({
            row: i + 1,
            data: lecturer,
            error: `Employee ID ${lecturer.employeeId} already exists`
          });
          continue;
        }

        // Insert lecturer
        const result = await pool.query(
          `INSERT INTO lecturers (name, employee_id, specialization, email, phone, password) 
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [
            lecturer.name,
            lecturer.employeeId,
            lecturer.specialization || null,
            lecturer.email,
            lecturer.phone || null,
            lecturer.password || 'lecturer123' // Default password
          ]
        );

        // Save to password records
        await pool.query(
          `INSERT INTO password_records (user_type, user_id, username, password_hash) 
           VALUES ('lecturer', $1, $2, $3)`,
          [result.rows[0].id, lecturer.employeeId, lecturer.password || 'lecturer123']
        );

        results.successful.push({
          row: i + 1,
          data: result.rows[0]
        });

      } catch (error) {
        console.error(`Error processing lecturer at row ${i + 1}:`, error);
        results.failed.push({
          row: i + 1,
          data: lecturer,
          error: error.message
        });
      }
    }

    console.log(`Bulk upload completed: ${results.successful.length} successful, ${results.failed.length} failed`);
    
    res.json({ 
      success: true, 
      message: `Processed ${lecturers.length} lecturers: ${results.successful.length} successful, ${results.failed.length} failed`,
      data: results
    });

  } catch (error) {
    console.error('Error in bulk upload lecturers:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// PROGRESS TRACKER API ENDPOINTS
// ============================================

// Get student progress for a specific program (for lecturer view)
app.get('/api/progress/student/:student_id', async (req, res) => {
  try {
    const { student_id } = req.params;
    const { program_name, lecturer_id } = req.query;
    
    console.log('=== FETCHING STUDENT PROGRESS ===');
    console.log('Student ID:', student_id);
    console.log('Program:', program_name);
    console.log('Lecturer ID:', lecturer_id);
    
    // Get student info
    const studentResult = await pool.query(
      'SELECT * FROM students WHERE id = $1',
      [student_id]
    );
    
    if (studentResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }
    
    const student = studentResult.rows[0];
    
    // Get total assessments created by this lecturer for this program
    let assessmentQuery = `
      SELECT COUNT(*) as total FROM assessments 
      WHERE program_name = $1
    `;
    let assessmentParams = [program_name];
    
    if (lecturer_id) {
      assessmentQuery += ' AND lecturer_id = $2';
      assessmentParams.push(lecturer_id);
    }
    
    const totalAssessmentsResult = await pool.query(assessmentQuery, assessmentParams);
    const totalAssessments = parseInt(totalAssessmentsResult.rows[0].total) || 0;
    
    // Get student's assessment submissions for this program
    const submittedAssessmentsResult = await pool.query(`
      SELECT COUNT(*) as submitted, AVG(COALESCE(score, 0)) as avg_score
      FROM assessment_submissions 
      WHERE student_id = $1 AND student_program = $2
    `, [student_id, program_name]);
    
    const submittedAssessments = parseInt(submittedAssessmentsResult.rows[0].submitted) || 0;
    const avgAssessmentScore = parseFloat(submittedAssessmentsResult.rows[0].avg_score) || 0;
    
    // Get total assignments created by this lecturer for this program
    let assignmentQuery = `
      SELECT COUNT(*) as total FROM assignments 
      WHERE program_name = $1
    `;
    let assignmentParams = [program_name];
    
    if (lecturer_id) {
      assignmentQuery += ' AND lecturer_id = $2';
      assignmentParams.push(lecturer_id);
    }
    
    const totalAssignmentsResult = await pool.query(assignmentQuery, assignmentParams);
    const totalAssignments = parseInt(totalAssignmentsResult.rows[0].total) || 0;
    
    // Get student's assignment submissions
    const submittedAssignmentsResult = await pool.query(`
      SELECT COUNT(*) as submitted, AVG(COALESCE(points_awarded, 0)) as avg_grade
      FROM assignment_submissions 
      WHERE student_id = $1 AND student_program = $2
    `, [student_id, program_name]);
    
    const submittedAssignments = parseInt(submittedAssignmentsResult.rows[0].submitted) || 0;
    const avgAssignmentGrade = parseFloat(submittedAssignmentsResult.rows[0].avg_grade) || 0;
    
    // Get total live classes created by this lecturer for this program
    let liveClassQuery = `
      SELECT COUNT(*) as total FROM live_classes 
      WHERE program_name = $1
    `;
    let liveClassParams = [program_name];
    
    if (lecturer_id) {
      liveClassQuery += ' AND lecturer_id = $2';
      liveClassParams.push(lecturer_id);
    }
    
    const totalLiveClassesResult = await pool.query(liveClassQuery, liveClassParams);
    const totalLiveClasses = parseInt(totalLiveClassesResult.rows[0].total) || 0;
    
    // Get student's live class attendance
    const attendedLiveClassesResult = await pool.query(`
      SELECT COUNT(DISTINCT class_id) as attended
      FROM live_class_participants 
      WHERE student_id = $1
    `, [student_id]);
    
    const attendedLiveClasses = parseInt(attendedLiveClassesResult.rows[0].attended) || 0;
    
    // Calculate participation rates
    const assessmentParticipation = totalAssessments > 0 
      ? ((submittedAssessments / totalAssessments) * 100).toFixed(1)
      : '0.0';
    
    const assignmentParticipation = totalAssignments > 0
      ? ((submittedAssignments / totalAssignments) * 100).toFixed(1)
      : '0.0';
    
    const liveClassParticipation = totalLiveClasses > 0
      ? ((attendedLiveClasses / totalLiveClasses) * 100).toFixed(1)
      : '0.0';
    
    // Calculate overall participation
    const overallParticipation = (
      (parseFloat(assessmentParticipation) + 
       parseFloat(assignmentParticipation) + 
       parseFloat(liveClassParticipation)) / 3
    ).toFixed(1);
    
    // Determine performance level
    let performanceLevel = 'Needs Improvement';
    if (parseFloat(overallParticipation) >= 80) performanceLevel = 'Excellent';
    else if (parseFloat(overallParticipation) >= 60) performanceLevel = 'Good';
    else if (parseFloat(overallParticipation) >= 40) performanceLevel = 'Average';
    
    const progressData = {
      student: {
        id: student.id,
        name: student.name,
        registration_number: student.registration_number,
        email: student.email
      },
      program: program_name,
      assessments: {
        total: totalAssessments,
        submitted: submittedAssessments,
        not_submitted: totalAssessments - submittedAssessments,
        average_score: avgAssessmentScore.toFixed(1),
        participation_rate: assessmentParticipation
      },
      assignments: {
        total: totalAssignments,
        submitted: submittedAssignments,
        not_submitted: totalAssignments - submittedAssignments,
        average_grade: avgAssignmentGrade.toFixed(1),
        participation_rate: assignmentParticipation
      },
      live_classes: {
        total: totalLiveClasses,
        attended: attendedLiveClasses,
        not_attended: totalLiveClasses - attendedLiveClasses,
        attendance_rate: liveClassParticipation
      },
      overall: {
        participation_rate: overallParticipation,
        performance_level: performanceLevel
      }
    };
    
    console.log('Progress data compiled for student:', student.name);
    res.json({ success: true, data: progressData });
  } catch (error) {
    console.error('Error fetching student progress:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all students progress for a lecturer's program
app.get('/api/progress/students', async (req, res) => {
  try {
    const { program_name, lecturer_id } = req.query;
    
    console.log('=== FETCHING ALL STUDENTS PROGRESS ===');
    console.log('Program:', program_name);
    console.log('Lecturer ID:', lecturer_id);
    
    if (!program_name) {
      return res.status(400).json({ success: false, error: 'Program name is required' });
    }
    
    // Get all students enrolled in this program
    const studentsResult = await pool.query(`
      SELECT DISTINCT s.id, s.name, s.registration_number, s.email
      FROM students s
      JOIN enrollments e ON s.id = e.student_id
      JOIN programs p ON e.program_id = p.id
      WHERE p.name = $1
      ORDER BY s.name
    `, [program_name]);
    
    let students = studentsResult.rows;
    
    // If no enrollments found, try to get students by program_name directly
    if (students.length === 0) {
      const directStudentsResult = await pool.query(`
        SELECT DISTINCT s.id, s.name, s.registration_number, s.email
        FROM students s
        WHERE s.program_name = $1
        ORDER BY s.name
      `, [program_name]);
      students = directStudentsResult.rows;
    }
    
    console.log(`Found ${students.length} students for program: ${program_name}`);
    
    const progressList = [];
    
    // Get totals for this program (created by lecturer if specified)
    let assessmentQuery = 'SELECT COUNT(*) as total FROM assessments WHERE program_name = $1';
    let assignmentQuery = 'SELECT COUNT(*) as total FROM assignments WHERE program_name = $1';
    let liveClassQuery = 'SELECT COUNT(*) as total FROM live_classes WHERE program_name = $1';
    
    let queryParams = [program_name];
    
    if (lecturer_id) {
      assessmentQuery += ' AND lecturer_id = $2';
      assignmentQuery += ' AND lecturer_id = $2';
      liveClassQuery += ' AND lecturer_id = $2';
      queryParams.push(lecturer_id);
    }
    
    const totalAssessmentsResult = await pool.query(assessmentQuery, queryParams);
    const totalAssignmentsResult = await pool.query(assignmentQuery, queryParams);
    const totalLiveClassesResult = await pool.query(liveClassQuery, queryParams);
    
    const totalAssessments = parseInt(totalAssessmentsResult.rows[0].total) || 0;
    const totalAssignments = parseInt(totalAssignmentsResult.rows[0].total) || 0;
    const totalLiveClasses = parseInt(totalLiveClassesResult.rows[0].total) || 0;
    
    // Get progress for each student
    for (const student of students) {
      // Get student's assessment submissions
      const submittedAssessmentsResult = await pool.query(`
        SELECT COUNT(*) as submitted, AVG(COALESCE(score, 0)) as avg_score
        FROM assessment_submissions 
        WHERE student_id = $1 AND student_program = $2
      `, [student.id, program_name]);
      
      const submittedAssessments = parseInt(submittedAssessmentsResult.rows[0].submitted) || 0;
      const avgAssessmentScore = parseFloat(submittedAssessmentsResult.rows[0].avg_score) || 0;
      
      // Get student's assignment submissions
      const submittedAssignmentsResult = await pool.query(`
        SELECT COUNT(*) as submitted, AVG(COALESCE(points_awarded, 0)) as avg_grade
        FROM assignment_submissions 
        WHERE student_id = $1 AND student_program = $2
      `, [student.id, program_name]);
      
      const submittedAssignments = parseInt(submittedAssignmentsResult.rows[0].submitted) || 0;
      const avgAssignmentGrade = parseFloat(submittedAssignmentsResult.rows[0].avg_grade) || 0;
      
      // Get student's live class attendance
      const attendedLiveClassesResult = await pool.query(`
        SELECT COUNT(DISTINCT class_id) as attended
        FROM live_class_participants 
        WHERE student_id = $1
      `, [student.id]);
      
      const attendedLiveClasses = parseInt(attendedLiveClassesResult.rows[0].attended) || 0;
      
      // Calculate participation rates
      const assessmentParticipation = totalAssessments > 0 
        ? ((submittedAssessments / totalAssessments) * 100).toFixed(1)
        : '0.0';
      
      const assignmentParticipation = totalAssignments > 0
        ? ((submittedAssignments / totalAssignments) * 100).toFixed(1)
        : '0.0';
      
      const liveClassParticipation = totalLiveClasses > 0
        ? ((attendedLiveClasses / totalLiveClasses) * 100).toFixed(1)
        : '0.0';
      
      const overallParticipation = (
        (parseFloat(assessmentParticipation) + 
         parseFloat(assignmentParticipation) + 
         parseFloat(liveClassParticipation)) / 3
      ).toFixed(1);
      
      let performanceLevel = 'Needs Improvement';
      if (parseFloat(overallParticipation) >= 80) performanceLevel = 'Excellent';
      else if (parseFloat(overallParticipation) >= 60) performanceLevel = 'Good';
      else if (parseFloat(overallParticipation) >= 40) performanceLevel = 'Average';
      
      progressList.push({
        student: {
          id: student.id,
          name: student.name,
          registration_number: student.registration_number
        },
        assessments: {
          total: totalAssessments,
          submitted: submittedAssessments,
          average_score: avgAssessmentScore.toFixed(1),
          participation_rate: assessmentParticipation
        },
        assignments: {
          total: totalAssignments,
          submitted: submittedAssignments,
          average_grade: avgAssignmentGrade.toFixed(1),
          participation_rate: assignmentParticipation
        },
        live_classes: {
          total: totalLiveClasses,
          attended: attendedLiveClasses,
          attendance_rate: liveClassParticipation
        },
        overall: {
          participation_rate: overallParticipation,
          performance_level: performanceLevel
        }
      });
    }
    
    console.log(`Progress data compiled for ${progressList.length} students`);
    res.json({ success: true, data: progressList });
  } catch (error) {
    console.error('Error fetching students progress:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get lecturer progress statistics (for Admin view)
app.get('/api/progress/lecturer/:lecturer_id', async (req, res) => {
  try {
    const { lecturer_id } = req.params;
    
    console.log('=== FETCHING LECTURER PROGRESS ===');
    console.log('Lecturer ID:', lecturer_id);
    
    // Get lecturer info
    const lecturerResult = await pool.query(
      'SELECT * FROM lecturers WHERE id = $1',
      [lecturer_id]
    );
    
    if (lecturerResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Lecturer not found' });
    }
    
    const lecturer = lecturerResult.rows[0];
    
    // Get programs assigned to this lecturer
    const programsResult = await pool.query(`
      SELECT COUNT(*) as total FROM programs WHERE lecturer_id = $1
    `, [lecturer_id]);
    const totalPrograms = parseInt(programsResult.rows[0].total) || 0;
    
    // Get assessment statistics
    const assessmentStats = await pool.query(`
      SELECT 
        COUNT(*) as total_created,
        COUNT(CASE WHEN status = 'active' OR status = 'published' THEN 1 END) as active,
        COUNT(CASE WHEN status = 'completed' OR status = 'expired' THEN 1 END) as completed
      FROM assessments
      WHERE lecturer_id = $1
    `, [lecturer_id]);
    
    // Get assignment statistics
    const assignmentStats = await pool.query(`
      SELECT 
        COUNT(*) as total_created,
        COUNT(CASE WHEN status = 'active' OR status = 'open' THEN 1 END) as active,
        COUNT(CASE WHEN status = 'completed' OR status = 'closed' THEN 1 END) as completed
      FROM assignments
      WHERE lecturer_id = $1
    `, [lecturer_id]);
    
    // Get live class statistics
    const liveClassStats = await pool.query(`
      SELECT 
        COUNT(*) as total_created,
        COUNT(CASE WHEN status = 'live' OR status = 'scheduled' THEN 1 END) as active,
        COUNT(CASE WHEN status = 'ended' OR status = 'completed' THEN 1 END) as completed
      FROM live_classes
      WHERE lecturer_id = $1
    `, [lecturer_id]);
    
    // Get course content/materials statistics
    const contentStats = await pool.query(`
      SELECT COUNT(*) as total_created
      FROM course_content
      WHERE lecturer_id = $1
    `, [lecturer_id]);
    
    // Get announcement statistics
    const announcementStats = await pool.query(`
      SELECT COUNT(*) as total_created
      FROM announcements
      WHERE created_by_id = $1 AND created_by_type = 'lecturer'
    `, [lecturer_id]);
    
    // Get total students across all programs
    const studentsResult = await pool.query(`
      SELECT COUNT(DISTINCT e.student_id) as total_students
      FROM enrollments e
      JOIN programs p ON e.program_id = p.id
      WHERE p.lecturer_id = $1
    `, [lecturer_id]);
    const totalStudents = parseInt(studentsResult.rows[0].total_students) || 0;
    
    const assessmentData = assessmentStats.rows[0];
    const assignmentData = assignmentStats.rows[0];
    const liveClassData = liveClassStats.rows[0];
    const contentData = contentStats.rows[0];
    const announcementData = announcementStats.rows[0];
    
    const totalActivities = 
      parseInt(assessmentData.total_created) + 
      parseInt(assignmentData.total_created) + 
      parseInt(liveClassData.total_created) +
      parseInt(contentData.total_created) +
      parseInt(announcementData.total_created);
    
    let activityLevel = 'Low';
    if (totalActivities >= 30) activityLevel = 'Very Active';
    else if (totalActivities >= 15) activityLevel = 'Active';
    else if (totalActivities >= 5) activityLevel = 'Moderate';
    
    const progressData = {
      lecturer: {
        id: lecturer.id,
        name: lecturer.name,
        email: lecturer.email,
        specialization: lecturer.specialization,
        employee_id: lecturer.employee_id
      },
      programs: {
        total: totalPrograms
      },
      students: {
        total: totalStudents
      },
      assessments: {
        total_created: parseInt(assessmentData.total_created),
        active: parseInt(assessmentData.active),
        completed: parseInt(assessmentData.completed)
      },
      assignments: {
        total_created: parseInt(assignmentData.total_created),
        active: parseInt(assignmentData.active),
        completed: parseInt(assignmentData.completed)
      },
      live_classes: {
        total_created: parseInt(liveClassData.total_created),
        active: parseInt(liveClassData.active),
        completed: parseInt(liveClassData.completed)
      },
      content: {
        total_created: parseInt(contentData.total_created)
      },
      announcements: {
        total_created: parseInt(announcementData.total_created)
      },
      overall: {
        total_activities: totalActivities,
        activity_level: activityLevel
      }
    };
    
    console.log('Lecturer progress data compiled:', lecturer.name);
    res.json({ success: true, data: progressData });
  } catch (error) {
    console.error('Error fetching lecturer progress:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all lecturers with basic progress info (for Admin list view)
app.get('/api/progress/lecturers', async (req, res) => {
  try {
    console.log('=== FETCHING ALL LECTURERS PROGRESS ===');
    
    const lecturersResult = await pool.query(`
      SELECT id, name, email, specialization, employee_id, is_active
      FROM lecturers
      ORDER BY name
    `);
    
    const lecturers = lecturersResult.rows;
    const progressList = [];
    
    for (const lecturer of lecturers) {
      // Get quick stats for each lecturer
      const assessmentCount = await pool.query(
        'SELECT COUNT(*) as total FROM assessments WHERE lecturer_id = $1',
        [lecturer.id]
      );
      
      const assignmentCount = await pool.query(
        'SELECT COUNT(*) as total FROM assignments WHERE lecturer_id = $1',
        [lecturer.id]
      );
      
      const liveClassCount = await pool.query(
        'SELECT COUNT(*) as total FROM live_classes WHERE lecturer_id = $1',
        [lecturer.id]
      );
      
      const programCount = await pool.query(
        'SELECT COUNT(*) as total FROM programs WHERE lecturer_id = $1',
        [lecturer.id]
      );
      
      const totalActivities = 
        parseInt(assessmentCount.rows[0].total) + 
        parseInt(assignmentCount.rows[0].total) + 
        parseInt(liveClassCount.rows[0].total);
      
      let activityLevel = 'Low';
      if (totalActivities >= 30) activityLevel = 'Very Active';
      else if (totalActivities >= 15) activityLevel = 'Active';
      else if (totalActivities >= 5) activityLevel = 'Moderate';
      
      progressList.push({
        lecturer: {
          id: lecturer.id,
          name: lecturer.name,
          email: lecturer.email,
          specialization: lecturer.specialization,
          employee_id: lecturer.employee_id,
          is_active: lecturer.is_active
        },
        stats: {
          programs: parseInt(programCount.rows[0].total),
          assessments: parseInt(assessmentCount.rows[0].total),
          assignments: parseInt(assignmentCount.rows[0].total),
          live_classes: parseInt(liveClassCount.rows[0].total),
          total_activities: totalActivities
        },
        overall: {
          activity_level: activityLevel
        }
      });
    }
    
    console.log(`Progress data compiled for ${progressList.length} lecturers`);
    res.json({ success: true, data: progressList });
  } catch (error) {
    console.error('Error fetching lecturers progress:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 5000;

// Initialize database and start server
(async () => {
  try {
    console.log('Initializing database tables...');
    
    // Initialize BounceSteps tables first
    const { initializeTables } = require('./migrations/init-tables');
    const { runStartupMigrations } = require('./migrations/run-on-startup');
    
    await initializeTables();
    await runStartupMigrations();
    
    // Then initialize other tables
    await initializeDatabase();
    await initializeLiveClassesTable();
    await initializeAnnouncementsTable();
    await initializeShortTermProgramsTable();
    await initializeTimetableTable();
    await initializeVenuesTable();
    await createPasswordResetTable();
    console.log('✅ All database tables initialized successfully');
    
    // Start the server ONCE after database is ready
    const server = app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`API available at http://localhost:${PORT}/api`);
      console.log('🚀 Server is ready to accept requests');
    });
    
    // Start scheduler after database is ready
    console.log('🕒 Starting automatic live class scheduler...');
    setInterval(checkScheduledClasses, 60000); // 60000ms = 1 minute
    
    // Run scheduler immediately after database init
    setTimeout(() => {
      console.log('🚀 Starting initial scheduler check...');
      checkScheduledClasses();
    }, 2000); // Wait 2 seconds after database init
    
    console.log('📅 Scheduler will auto-start classes when their scheduled time arrives');

    // Keep server alive
    process.on('SIGINT', () => {
      console.log('Shutting down server...');
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    });
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    console.log('⚠️ Starting server anyway...');
    
    // Start server even if database init fails
    const server = app.listen(PORT, () => {
      console.log(`Server running on port ${PORT} (database may not be ready)`);
    });
  }
})();
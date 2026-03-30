# PostgreSQL Database Setup Guide

## Problem
Your backend server is trying to connect to PostgreSQL on `localhost:5432`, but the database is not running or not accessible.

## Solutions

### Option 1: Use Render PostgreSQL (Recommended for Production)

1. **Create PostgreSQL Database on Render:**
   - Go to [Render Dashboard](https://dashboard.render.com/)
   - Click "New +" → "PostgreSQL"
   - Choose **Free** tier
   - Name: `mbaya-lms-db` (or your preferred name)
   - Click "Create Database"

2. **Get Database URL:**
   - Once created, copy the **External Database URL**
   - It looks like: `postgresql://user:password@host:port/database`

3. **Configure Backend Service:**
   - Go to your backend service on Render
   - Navigate to "Environment" tab
   - Add environment variable:
     - **Key:** `DATABASE_URL`
     - **Value:** `<paste-your-database-url>`
   - Save changes

4. **Redeploy:**
   - Your service will automatically redeploy with the new database connection

### Option 2: Install PostgreSQL Locally (For Development)

#### Windows:

1. **Download PostgreSQL:**
   - Visit: https://www.postgresql.org/download/windows/
   - Download the installer (version 14 or higher)

2. **Install:**
   - Run the installer
   - Set password for `postgres` user (remember this!)
   - Default port: `5432`
   - Complete installation

3. **Create Database:**
   ```bash
   # Open Command Prompt or PowerShell
   psql -U postgres
   
   # Enter password when prompted
   # Then create database:
   CREATE DATABASE "LMS_MUST_DB_ORG";
   
   # Exit:
   \q
   ```

4. **Update Backend Configuration:**
   - Create `.env` file in `backend` folder:
   ```env
   DATABASE_URL=postgresql://postgres:your_password@localhost:5432/LMS_MUST_DB_ORG
   DB_USER=postgres
   DB_HOST=localhost
   DB_NAME=LMS_MUST_DB_ORG
   DB_PASSWORD=your_password
   DB_PORT=5432
   ```

5. **Start Backend:**
   ```bash
   cd backend
   npm start
   ```

### Option 3: Use Docker PostgreSQL (Alternative)

```bash
# Pull PostgreSQL image
docker pull postgres:14

# Run PostgreSQL container
docker run --name mbaya-postgres \
  -e POSTGRES_PASSWORD=@Jctnftr01 \
  -e POSTGRES_DB=LMS_MUST_DB_ORG \
  -p 5432:5432 \
  -d postgres:14

# Backend will connect automatically
```

## Verify Connection

After setup, check backend logs for:
```
✅ Connected to PostgreSQL database: LMS_MUST_DB_ORG
```

## Troubleshooting

### Error: ECONNREFUSED
- **Cause:** PostgreSQL not running or wrong connection details
- **Fix:** 
  - Ensure PostgreSQL service is running
  - Verify connection details in `.env` or Render environment variables
  - Check firewall settings

### Error: Authentication Failed
- **Cause:** Wrong password or user
- **Fix:** 
  - Verify password in `.env` matches PostgreSQL user password
  - Reset PostgreSQL password if needed

### Error: Database Does Not Exist
- **Cause:** Database not created
- **Fix:** 
  - Create database using `CREATE DATABASE "LMS_MUST_DB_ORG";`
  - Or let the backend auto-create tables (if database exists)

## Current Configuration

Your backend is configured to use:
- **Database:** `LMS_MUST_DB_ORG`
- **User:** `postgres` (default)
- **Port:** `5432` (default)
- **Host:** `localhost` (development) or environment variable (production)

## Next Steps

1. Choose your setup method (Render recommended for production)
2. Configure database connection
3. Restart backend service
4. Verify connection in logs
5. Database tables will be created automatically on first connection

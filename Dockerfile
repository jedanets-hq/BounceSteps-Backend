# Use Node.js LTS version
FROM node:18-alpine

# Install bash for scripts
RUN apk add --no-cache bash

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY . .

# Make scripts executable
RUN chmod +x deploy-admin-portal-fix.sh
RUN chmod +x run-admin-portal-migration.js

# Expose port
EXPOSE 8080

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "const http = require('http'); \
    const options = { hostname: 'localhost', port: 8080, path: '/api/admin/test', timeout: 5000 }; \
    const req = http.request(options, (res) => { \
      if (res.statusCode === 200) process.exit(0); else process.exit(1); \
    }); \
    req.on('error', () => process.exit(1)); \
    req.end();"

# Create startup script that runs migrations and starts server
RUN echo '#!/bin/bash\n\
echo "🚀 Starting BounceSteps Backend..."\n\
echo "📊 Running database migrations..."\n\
\n\
echo "1️⃣ Running Cloud SQL migration (is_active columns)..."\n\
if node run-cloud-sql-migration.js; then\n\
  echo "✅ Cloud SQL migration completed"\n\
else\n\
  echo "⚠️ Cloud SQL migration failed or already applied, continuing..."\n\
fi\n\
\n\
echo "2️⃣ Running admin portal migration..."\n\
if node run-admin-portal-migration.js; then\n\
  echo "✅ Admin portal migration completed"\n\
else\n\
  echo "⚠️ Admin portal migration failed or already applied, continuing..."\n\
fi\n\
\n\
echo "🌟 Starting server..."\n\
exec node server.js' > /app/start.sh

RUN chmod +x /app/start.sh

# Start the application with migration
CMD ["/app/start.sh"]
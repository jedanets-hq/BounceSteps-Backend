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

# Create startup script that runs migration and starts server
RUN echo '#!/bin/bash\n\
echo "🚀 Starting BounceSteps Backend with Admin Portal Fixes..."\n\
echo "📊 Running database migration for admin portal fixes..."\n\
if node run-admin-portal-migration.js; then\n\
  echo "✅ Migration completed successfully"\n\
else\n\
  echo "⚠️ Migration failed or already applied, continuing..."\n\
fi\n\
echo "🌟 Starting server..."\n\
exec node server.js' > /app/start.sh

RUN chmod +x /app/start.sh

# Start the application with migration
CMD ["/app/start.sh"]
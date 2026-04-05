#!/bin/bash

# 🚀 FIXED DEPLOYMENT SCRIPT FOR CLOUD RUN
# Properly handles environment variables with special characters

set -e

echo "🌍 ========================================"
echo "🚀 DEPLOYING TO GOOGLE CLOUD RUN"
echo "========================================"
echo ""

# Configuration
PROJECT_ID="project-df58b635-5420-42bc-809"
SERVICE_NAME="bouncesteps-backend"
REGION="us-central1"

# Colors
GREEN='\033[0;32m'
NC='\033[0m'

echo "📋 Configuration:"
echo "   Project: $PROJECT_ID"
echo "   Service: $SERVICE_NAME"
echo "   Region: $REGION"
echo ""

# Set project
echo "🔧 Setting project..."
gcloud config set project $PROJECT_ID

# Load environment variables from .env.production
if [ -f ".env.production" ]; then
    echo "📋 Loading environment variables from .env.production..."
    source .env.production
else
    echo "❌ .env.production not found!"
    exit 1
fi

# Deploy to Cloud Run with properly escaped environment variables
echo ""
echo -e "${GREEN}🚀 Deploying to Cloud Run...${NC}"
echo ""

gcloud run deploy $SERVICE_NAME \
    --image gcr.io/$PROJECT_ID/$SERVICE_NAME:latest \
    --platform managed \
    --region $REGION \
    --allow-unauthenticated \
    --port 8080 \
    --memory 2Gi \
    --cpu 1 \
    --min-instances 0 \
    --max-instances 10 \
    --timeout 300 \
    --set-env-vars "NODE_ENV=production" \
    --set-env-vars "PORT=8080" \
    --set-env-vars "DATABASE_URL=${DATABASE_URL}" \
    --set-env-vars "JWT_SECRET=${JWT_SECRET}" \
    --set-env-vars "SESSION_SECRET=${SESSION_SECRET}" \
    --set-env-vars "GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}" \
    --set-env-vars "GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}" \
    --set-env-vars "GOOGLE_CALLBACK_URL=${GOOGLE_CALLBACK_URL}" \
    --set-env-vars "FRONTEND_URL=${FRONTEND_URL}" \
    --set-env-vars "CORS_ORIGINS=${CORS_ORIGINS}" \
    --add-cloudsql-instances "project-df58b635-5420-42bc-809:us-central1:bouncesteps-db"

if [ $? -ne 0 ]; then
    echo "❌ Deployment failed!"
    exit 1
fi

# Get service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --platform managed --region $REGION --format 'value(status.url)')

echo ""
echo "🌍 ========================================"
echo -e "${GREEN}✅ DEPLOYMENT SUCCESSFUL!${NC}"
echo "========================================"
echo ""
echo -e "${GREEN}🌐 Your API is LIVE:${NC}"
echo "   $SERVICE_URL"
echo ""
echo "🧪 Test your API:"
echo "   curl $SERVICE_URL/health"
echo ""
echo -e "${GREEN}🎉 Done!${NC}"
echo ""

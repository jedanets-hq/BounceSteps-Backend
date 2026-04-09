#!/bin/bash

# 🚀 QUICK REDEPLOY TO CLOUD RUN (No rebuild needed if image exists)
# Use this to update environment variables or redeploy existing image

set -e

echo "🌍 ========================================"
echo "🚀 REDEPLOYING TO GOOGLE CLOUD RUN"
echo "========================================"
echo ""

# Configuration
PROJECT_ID="${GCLOUD_PROJECT_ID:-project-df58b635-5420-42bc-809}"
SERVICE_NAME="bouncesteps-backend"
REGION="${GCLOUD_REGION:-us-central1}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}📋 Configuration:${NC}"
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
    echo -e "${RED}❌ .env.production not found!${NC}"
    exit 1
fi

# Deploy to Cloud Run with environment variables
echo ""
echo -e "${GREEN}🚀 Deploying to Cloud Run...${NC}"
echo ""

gcloud run deploy $SERVICE_NAME \
    --image gcr.io/$PROJECT_ID/$SERVICE_NAME \
    --platform managed \
    --region $REGION \
    --allow-unauthenticated \
    --port 8080 \
    --memory 2Gi \
    --cpu 1 \
    --min-instances 0 \
    --max-instances 10 \
    --timeout 300 \
    --set-env-vars "NODE_ENV=production,PORT=8080,DATABASE_URL=${DATABASE_URL},JWT_SECRET=${JWT_SECRET},SESSION_SECRET=${SESSION_SECRET},GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID},GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET},GOOGLE_CALLBACK_URL=${GOOGLE_CALLBACK_URL},FRONTEND_URL=${FRONTEND_URL},CORS_ORIGINS=${CORS_ORIGINS},EMAIL_HOST=${EMAIL_HOST},EMAIL_PORT=${EMAIL_PORT},EMAIL_USER=${EMAIL_USER},EMAIL_PASS=${EMAIL_PASS},EMAIL_FROM=${EMAIL_FROM},EMAIL_FROM_NAME=${EMAIL_FROM_NAME}" \
    --add-cloudsql-instances "project-df58b635-5420-42bc-809:us-central1:bouncesteps-db"

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Deployment failed!${NC}"
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
echo "📋 View logs:"
echo "   gcloud run services logs read $SERVICE_NAME --region $REGION --limit 50"
echo ""
echo -e "${GREEN}🎉 Done!${NC}"
echo ""

#!/bin/bash

# 🚀 COMPLETE GOOGLE CLOUD DEPLOYMENT SCRIPT
# This does EVERYTHING: Build + Upload + Deploy

set -e

echo "🌍 ========================================"
echo "🚀 FULL DEPLOYMENT TO GOOGLE CLOUD"
echo "========================================"
echo ""

# Configuration
PROJECT_ID="project-df58b635-5420-42bc-809"
SERVICE_NAME="bouncesteps-backend"
REGION="${GCLOUD_REGION:-us-central1}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Check gcloud
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}❌ gcloud CLI haipo! Install kwanza${NC}"
    echo "https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Get project ID if not set
if [ -z "$PROJECT_ID" ]; then
    echo -e "${YELLOW}⚠️  Project ID not set, using default${NC}"
    PROJECT_ID="project-df58b635-5420-42bc-809"
fi

echo -e "${BLUE}📋 Configuration:${NC}"
echo "   Project: $PROJECT_ID"
echo "   Service: $SERVICE_NAME"
echo "   Region: $REGION"
echo ""

# Set project
echo "🔧 Setting project..."
gcloud config set project $PROJECT_ID

# Enable APIs
echo ""
echo "🔧 Enabling APIs..."
gcloud services enable cloudbuild.googleapis.com run.googleapis.com containerregistry.googleapis.com sqladmin.googleapis.com

# Submit build to Cloud Build (builds AND uploads automatically!)
echo ""
echo -e "${GREEN}🐳 STEP 1: Building & Uploading Docker Image...${NC}"
echo "   Cloud Build will handle everything!"
echo ""

gcloud builds submit --tag gcr.io/$PROJECT_ID/$SERVICE_NAME

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Build failed!${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Build & Upload complete!${NC}"

# Deploy to Cloud Run
echo ""
echo -e "${GREEN}🚀 STEP 2: Deploying to Cloud Run...${NC}"
echo ""

# Read environment variables from .env.production
if [ -f ".env.production" ]; then
    echo "📋 Loading environment variables from .env.production..."
    source .env.production
else
    echo -e "${YELLOW}⚠️  .env.production not found, using minimal config${NC}"
fi

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
echo -e "${YELLOW}⚠️  NEXT STEPS:${NC}"
echo ""
echo "1. Set environment variables:"
echo "   gcloud run services update $SERVICE_NAME --region $REGION \\"
echo "     --update-env-vars DB_HOST=your-db-host,DB_USER=your-user,DB_NAME=your-db,JWT_SECRET=your-secret"
echo ""
echo "2. Test your API:"
echo "   curl $SERVICE_URL/health"
echo ""
echo "3. View logs:"
echo "   gcloud run services logs read $SERVICE_NAME --region $REGION --limit 50"
echo ""
echo -e "${GREEN}🎉 Done!${NC}"
echo ""

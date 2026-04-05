#!/bin/bash

# BounceSteps Backend - Google Cloud Deployment Script
# This script deploys the backend to Google Cloud Run using Docker

set -e  # Exit on error

echo "🌍 ========================================"
echo "🚀 BounceSteps Backend - Google Cloud Deploy"
echo "========================================"
echo ""

# Configuration
PROJECT_ID="${GCLOUD_PROJECT_ID:-your-project-id}"
SERVICE_NAME="bouncesteps-backend"
REGION="${GCLOUD_REGION:-us-central1}"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"
PORT=8080

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}❌ Error: gcloud CLI is not installed${NC}"
    echo "Install it from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Check if user is logged in
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" &> /dev/null; then
    echo -e "${YELLOW}⚠️  Not logged in to gcloud${NC}"
    echo "Running: gcloud auth login"
    gcloud auth login
fi

# Check if project ID is set
if [ "$PROJECT_ID" = "your-project-id" ]; then
    echo -e "${YELLOW}⚠️  Project ID not set${NC}"
    echo "Please set GCLOUD_PROJECT_ID environment variable or edit this script"
    echo ""
    echo "Available projects:"
    gcloud projects list
    echo ""
    read -p "Enter your Google Cloud Project ID: " PROJECT_ID
    IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"
fi

echo -e "${GREEN}📋 Configuration:${NC}"
echo "   Project ID: $PROJECT_ID"
echo "   Service Name: $SERVICE_NAME"
echo "   Region: $REGION"
echo "   Image: $IMAGE_NAME"
echo ""

# Set the project
echo "🔧 Setting active project..."
gcloud config set project $PROJECT_ID

# Enable required APIs
echo ""
echo "🔧 Enabling required Google Cloud APIs..."
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable containerregistry.googleapis.com

# Build the Docker image
echo ""
echo "🐳 Building Docker image..."
echo "   This may take a few minutes..."
docker build -t $IMAGE_NAME:latest .

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Docker build failed${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Docker image built successfully${NC}"

# Configure Docker to use gcloud as credential helper
echo ""
echo "🔧 Configuring Docker authentication..."
gcloud auth configure-docker

# Push the image to Google Container Registry
echo ""
echo "📤 Pushing image to Google Container Registry..."
echo "   This may take a few minutes..."
docker push $IMAGE_NAME:latest

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Docker push failed${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Image pushed successfully${NC}"

# Deploy to Cloud Run
echo ""
echo "🚀 Deploying to Google Cloud Run..."
echo "   This may take a few minutes..."

# Check if .env.production exists
if [ -f ".env.production" ]; then
    echo -e "${YELLOW}⚠️  Found .env.production file${NC}"
    echo "   Environment variables should be set via gcloud command or Cloud Console"
    echo "   For security, use Secret Manager for sensitive data"
fi

# Deploy with basic configuration
gcloud run deploy $SERVICE_NAME \
    --image $IMAGE_NAME:latest \
    --platform managed \
    --region $REGION \
    --allow-unauthenticated \
    --port $PORT \
    --memory 2Gi \
    --cpu 1 \
    --min-instances 1 \
    --max-instances 10 \
    --timeout 300 \
    --set-env-vars "NODE_ENV=production,PORT=$PORT"

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Deployment failed${NC}"
    exit 1
fi

# Get the service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --platform managed --region $REGION --format 'value(status.url)')

echo ""
echo "🌍 ========================================"
echo -e "${GREEN}✅ Deployment Successful!${NC}"
echo "========================================"
echo ""
echo "🌐 Service URL: $SERVICE_URL"
echo "📊 View logs: gcloud run services logs read $SERVICE_NAME --region $REGION"
echo "🔧 Manage service: https://console.cloud.google.com/run"
echo ""
echo -e "${YELLOW}⚠️  IMPORTANT: Set environment variables!${NC}"
echo ""
echo "Set environment variables using:"
echo "  gcloud run services update $SERVICE_NAME \\"
echo "    --region $REGION \\"
echo "    --set-env-vars \"DB_HOST=your-db-host,DB_USER=your-db-user\" \\"
echo "    --set-secrets \"DB_PASSWORD=db-password:latest,JWT_SECRET=jwt-secret:latest\""
echo ""
echo "Or use the Cloud Console:"
echo "  https://console.cloud.google.com/run/detail/$REGION/$SERVICE_NAME/variables"
echo ""
echo -e "${GREEN}🎉 Deployment complete!${NC}"
echo ""

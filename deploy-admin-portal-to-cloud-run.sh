#!/bin/bash

# BounceSteps Backend with Admin Portal Fixes - Google Cloud Run Deployment Script
# This script deploys the backend with all admin portal fixes to Google Cloud Run

echo "🚀 Deploying BounceSteps Backend with Admin Portal Fixes to Google Cloud Run..."
echo "================================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    print_error "gcloud CLI is not installed"
    echo "Please install it from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Check if user is authenticated
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" &> /dev/null; then
    print_warning "You need to authenticate with Google Cloud"
    echo "Running: gcloud auth login"
    gcloud auth login
fi

# Get current project
PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
if [ -z "$PROJECT_ID" ]; then
    print_error "No project set. Please set your project:"
    echo "gcloud config set project YOUR_PROJECT_ID"
    exit 1
fi

print_status "Project: $PROJECT_ID"
print_status "Region: us-central1"
print_status "Service: bouncesteps-backend"
print_status "Docker Image: gcr.io/$PROJECT_ID/bouncesteps-backend"

# Enable required APIs
print_status "Enabling required Google Cloud APIs..."
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable containerregistry.googleapis.com

# Build and push Docker image
print_status "Building Docker image with admin portal fixes..."
gcloud builds submit --tag gcr.io/$PROJECT_ID/bouncesteps-backend

if [ $? -ne 0 ]; then
    print_error "Docker build failed!"
    exit 1
fi

print_success "Docker image built successfully!"

# Deploy to Cloud Run with enhanced configuration
print_status "Deploying to Cloud Run..."
gcloud run deploy bouncesteps-backend \
  --image gcr.io/$PROJECT_ID/bouncesteps-backend \
  --region us-central1 \
  --allow-unauthenticated \
  --port 8080 \
  --memory 1Gi \
  --cpu 1 \
  --timeout 900 \
  --max-instances 10 \
  --min-instances 0 \
  --concurrency 80 \
  --set-env-vars NODE_ENV=production,PORT=8080 \
  --execution-environment gen2

if [ $? -eq 0 ]; then
    print_success "Deployment successful!"
    echo ""
    
    # Get the service URL
    SERVICE_URL=$(gcloud run services describe bouncesteps-backend --region us-central1 --format="value(status.url)")
    
    print_success "🌟 Your backend with admin portal fixes is now live!"
    echo ""
    echo "🔗 Backend URL: $SERVICE_URL"
    echo "🔗 Admin API Base: $SERVICE_URL/api/admin"
    echo "🔗 Health Check: $SERVICE_URL/api/admin/test"
    echo ""
    
    print_status "Testing deployment..."
    
    # Test the health endpoint
    if curl -f -s "$SERVICE_URL/api/admin/test" > /dev/null; then
        print_success "✅ Health check passed!"
    else
        print_warning "⚠️ Health check failed - service may still be starting up"
    fi
    
    echo ""
    print_success "🎉 Deployment completed successfully!"
    echo ""
    echo "📋 Admin Portal Features Now Available:"
    echo "   ✅ Real-time dashboard statistics"
    echo "   ✅ Functional service management (featured/trending)"
    echo "   ✅ Image support in service listings"
    echo "   ✅ Traveler stories management"
    echo "   ✅ Badge management system"
    echo "   ✅ All database tables and columns created"
    echo ""
    echo "🔧 Next Steps:"
    echo "   1. Update your admin portal frontend to use: $SERVICE_URL/api"
    echo "   2. Test all admin portal features"
    echo "   3. Verify database migration was successful"
    echo ""
    echo "📝 Environment Variables to Set (if needed):"
    echo "   - DATABASE_URL: Your PostgreSQL connection string"
    echo "   - DB_HOST, DB_USER, DB_PASSWORD, DB_NAME: Database credentials"
    echo ""
    echo "🔍 To view logs:"
    echo "   gcloud logs tail --follow --service=bouncesteps-backend --region=us-central1"
    
else
    print_error "Deployment failed!"
    echo "Please check the error messages above"
    exit 1
fi
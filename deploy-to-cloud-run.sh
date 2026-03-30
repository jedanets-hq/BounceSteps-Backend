#!/bin/bash

# BounceSteps Backend - Google Cloud Run Deployment Script
# This script deploys the backend to Google Cloud Run

echo "🚀 Deploying BounceSteps Backend to Google Cloud Run..."
echo ""

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "❌ Error: gcloud CLI is not installed"
    echo "Please install it from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Check if user is authenticated
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" &> /dev/null; then
    echo "⚠️  You need to authenticate with Google Cloud"
    echo "Running: gcloud auth login"
    gcloud auth login
fi

# Get current project
PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
if [ -z "$PROJECT_ID" ]; then
    echo "❌ No project set. Please set your project:"
    echo "gcloud config set project YOUR_PROJECT_ID"
    exit 1
fi

echo "📦 Project: $PROJECT_ID"
echo "🌍 Region: us-central1"
echo "🔧 Service: bouncesteps-backend"
echo ""

# Deploy to Cloud Run
echo "🚀 Deploying..."
gcloud run deploy bouncesteps-backend \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --port 8080 \
  --memory 512Mi \
  --cpu 1 \
  --timeout 300 \
  --max-instances 10 \
  --min-instances 0

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Deployment successful!"
    echo ""
    echo "🔗 Your backend is now live at:"
    gcloud run services describe bouncesteps-backend --region us-central1 --format="value(status.url)"
else
    echo ""
    echo "❌ Deployment failed!"
    echo "Please check the error messages above"
    exit 1
fi

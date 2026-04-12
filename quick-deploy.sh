#!/bin/bash

# Quick deploy script for backend updates
set -e

PROJECT_ID="project-df58b635-5420-42bc-809"
SERVICE_NAME="bouncesteps-backend"
REGION="us-central1"

echo "🚀 Building and deploying backend..."

# Build and submit to Cloud Build
gcloud builds submit --tag gcr.io/$PROJECT_ID/$SERVICE_NAME --project=$PROJECT_ID

# Deploy to Cloud Run
gcloud run deploy $SERVICE_NAME \
    --image gcr.io/$PROJECT_ID/$SERVICE_NAME \
    --platform managed \
    --region $REGION \
    --allow-unauthenticated \
    --port 8080 \
    --memory 2Gi \
    --cpu 1 \
    --project=$PROJECT_ID

echo "✅ Backend deployed successfully!"

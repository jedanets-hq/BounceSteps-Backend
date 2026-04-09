#!/bin/bash

# Simple deployment script with proper environment variable handling

set -e

echo "🚀 Deploying BounceSteps Backend to Cloud Run..."

PROJECT_ID="project-df58b635-5420-42bc-809"
SERVICE_NAME="bouncesteps-backend"
REGION="us-central1"

# Set project
gcloud config set project $PROJECT_ID

# Load environment variables
source .env.production

echo "📋 Deploying with email functionality..."

# Deploy to Cloud Run
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
    --update-env-vars NODE_ENV=production \
    --update-env-vars PORT=8080 \
    --update-env-vars DATABASE_URL="$DATABASE_URL" \
    --update-env-vars JWT_SECRET="$JWT_SECRET" \
    --update-env-vars SESSION_SECRET="$SESSION_SECRET" \
    --update-env-vars GOOGLE_CLIENT_ID="$GOOGLE_CLIENT_ID" \
    --update-env-vars GOOGLE_CLIENT_SECRET="$GOOGLE_CLIENT_SECRET" \
    --update-env-vars GOOGLE_CALLBACK_URL="$GOOGLE_CALLBACK_URL" \
    --update-env-vars FRONTEND_URL="$FRONTEND_URL" \
    --update-env-vars CORS_ORIGINS="$CORS_ORIGINS" \
    --update-env-vars EMAIL_HOST="$EMAIL_HOST" \
    --update-env-vars EMAIL_PORT="$EMAIL_PORT" \
    --update-env-vars EMAIL_USER="$EMAIL_USER" \
    --update-env-vars EMAIL_PASS="$EMAIL_PASS" \
    --update-env-vars EMAIL_FROM="$EMAIL_FROM" \
    --update-env-vars EMAIL_FROM_NAME="$EMAIL_FROM_NAME" \
    --add-cloudsql-instances "project-df58b635-5420-42bc-809:us-central1:bouncesteps-db"

# Get service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --platform managed --region $REGION --format 'value(status.url)')

echo ""
echo "✅ Deployment successful!"
echo "🌐 API URL: $SERVICE_URL"
echo ""
echo "🧪 Test forgot password:"
echo "curl -X POST $SERVICE_URL/api/auth/forgot-password -H 'Content-Type: application/json' -d '{\"email\":\"test@example.com\"}'"
echo ""
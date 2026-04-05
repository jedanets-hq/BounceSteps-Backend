#!/bin/bash
set -e

echo "🚀 Deploying to Cloud Run..."

# Deploy to Cloud Run using env-vars file
gcloud run deploy bouncesteps-backend \
    --image us-central1-docker.pkg.dev/project-df58b635-5420-42bc-809/bouncesteps-repo/bouncesteps-backend:latest \
    --platform managed \
    --region us-central1 \
    --allow-unauthenticated \
    --port 8080 \
    --memory 2Gi \
    --cpu 1 \
    --min-instances 0 \
    --max-instances 10 \
    --timeout 300 \
    --env-vars-file env-vars.yaml \
    --service-account bouncesteps-svc@project-df58b635-5420-42bc-809.iam.gserviceaccount.com \
    --add-cloudsql-instances "project-df58b635-5420-42bc-809:us-central1:bouncesteps-db"

echo "✅ Deployment complete!"

#!/bin/bash
# deploy.sh - Build the backend image with Cloud Build and deploy it to Cloud Run (asia-south1).
#
# Usage:
#   ./deploy.sh -p dhristi-ai-buildathon [-t v3] [-r asia-south1] [-s crowd-monitoring-api]
#               [-i <project>:<region>:dristhi-fdc] [-a https://<attendee-site>] [-c "<origin>,<origin>"]
#
# Needs (one-time, see README "Deployment"): the Cloud SQL instance, the Secret Manager secret
# `dristhi-database-url` holding the socket-form DATABASE_URL, and the Artifact Registry repo.
# No secret is passed on the command line: Cloud Run reads DATABASE_URL from Secret Manager.

set -euo pipefail

PROJECT_ID=""
REGION="asia-south1"
SERVICE_NAME="crowd-monitoring-api"
REPO_NAME="crowd-monitoring"
TAG=""
SQL_INSTANCE=""
PUBLIC_APP_URL=""
CORS_ORIGINS=""
DB_SECRET="dristhi-database-url"

while getopts "p:r:s:t:i:a:c:" opt; do
  case $opt in
    p) PROJECT_ID="$OPTARG" ;;
    r) REGION="$OPTARG" ;;
    s) SERVICE_NAME="$OPTARG" ;;
    t) TAG="$OPTARG" ;;
    i) SQL_INSTANCE="$OPTARG" ;;
    a) PUBLIC_APP_URL="$OPTARG" ;;
    c) CORS_ORIGINS="$OPTARG" ;;
    \?) echo "Invalid option -$OPTARG" >&2; exit 1 ;;
  esac
done

if [ -z "$PROJECT_ID" ]; then
  read -r -p "GCP project ID: " PROJECT_ID
  [ -z "$PROJECT_ID" ] && { echo "Project ID is required." >&2; exit 1; }
fi

# Defaults that follow from the project: the admin site is the project's default Hosting site,
# the attendee site is dhristi-ai-attendee (frontend/.firebaserc.example).
TAG="${TAG:-$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M)}"
SQL_INSTANCE="${SQL_INSTANCE:-${PROJECT_ID}:${REGION}:dristhi-fdc}"
PUBLIC_APP_URL="${PUBLIC_APP_URL:-https://dhristi-ai-attendee.web.app}"
CORS_ORIGINS="${CORS_ORIGINS:-https://${PROJECT_ID}.web.app,https://${PROJECT_ID}.firebaseapp.com,${PUBLIC_APP_URL}}"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${SERVICE_NAME}:${TAG}"

echo "Project:      $PROJECT_ID"
echo "Region:       $REGION"
echo "Image:        $IMAGE"
echo "Cloud SQL:    $SQL_INSTANCE"
echo "CORS origins: $CORS_ORIGINS"
echo

gcloud config set project "$PROJECT_ID" >/dev/null

echo "Building with Cloud Build (a few minutes)..."
gcloud builds submit --tag "$IMAGE" .

echo "Deploying to Cloud Run..."
# One instance only: crowd counts live in process memory until task 03 moves them out.
# --timeout 3600 keeps MJPEG camera streams open for up to an hour; --concurrency 1000 because
# open streams are cheap async tasks (shared frames) but each one still holds a request slot.
# ^@^ makes "@" the list separator, because CORS_ORIGINS itself contains commas.
gcloud run deploy "$SERVICE_NAME" \
  --image "$IMAGE" \
  --region "$REGION" \
  --platform managed \
  --cpu 2 \
  --memory 4Gi \
  --min-instances 1 \
  --max-instances 1 \
  --no-cpu-throttling \
  --timeout 3600 \
  --concurrency 1000 \
  --port 8080 \
  --allow-unauthenticated \
  --add-cloudsql-instances "$SQL_INSTANCE" \
  --set-secrets "DATABASE_URL=${DB_SECRET}:latest" \
  --set-env-vars "^@^ENV=production@FIREBASE_PROJECT_ID=${PROJECT_ID}@PUBLIC_APP_URL=${PUBLIC_APP_URL}@CORS_ORIGINS=${CORS_ORIGINS}"

URL=$(gcloud run services describe "$SERVICE_NAME" --region "$REGION" --format="value(status.url)")
echo
echo "Deployed: $URL"
echo "Check:    $URL/api/health"
echo "Frontend: set NEXT_PUBLIC_BACKEND_URL=$URL in frontend/.env, then npm run deploy"

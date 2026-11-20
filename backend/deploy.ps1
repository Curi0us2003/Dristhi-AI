# deploy.ps1 - Build the backend image with Cloud Build and deploy it to Cloud Run (asia-south1).
#
# Usage:
#   .\deploy.ps1 -ProjectId dhristi-ai-buildathon [-Tag v3] [-Region asia-south1] [-ServiceName crowd-monitoring-api]
#                [-SqlInstance <project>:<region>:dristhi-fdc] [-PublicAppUrl https://<attendee-site>] [-CorsOrigins "<origin>,<origin>"]
#
# Same behaviour as deploy.sh. No secret is passed on the command line: Cloud Run reads DATABASE_URL
# from the Secret Manager secret `dristhi-database-url`.

param (
    [string]$ProjectId,
    [string]$Region = "asia-south1",
    [string]$ServiceName = "crowd-monitoring-api",
    [string]$Tag,
    [string]$SqlInstance,
    [string]$PublicAppUrl,
    [string]$CorsOrigins
)

$ErrorActionPreference = "Stop"
$RepoName = "crowd-monitoring"
$DbSecret = "dristhi-database-url"

if (-not $ProjectId) { $ProjectId = Read-Host "GCP project ID" }
if (-not $ProjectId) { Write-Error "Project ID is required."; exit 1 }

if (-not $Tag) {
    $Tag = (git rev-parse --short HEAD 2>$null)
    if (-not $Tag) { $Tag = Get-Date -Format "yyyyMMddHHmm" }
}
if (-not $SqlInstance) { $SqlInstance = "${ProjectId}:${Region}:dristhi-fdc" }
if (-not $PublicAppUrl) { $PublicAppUrl = "https://dhristi-ai-attendee.web.app" }
if (-not $CorsOrigins) { $CorsOrigins = "https://$ProjectId.web.app,https://$ProjectId.firebaseapp.com,$PublicAppUrl" }
$Image = "$Region-docker.pkg.dev/$ProjectId/$RepoName/${ServiceName}:$Tag"

Write-Host "Project:      $ProjectId"
Write-Host "Image:        $Image"
Write-Host "Cloud SQL:    $SqlInstance"
Write-Host "CORS origins: $CorsOrigins"

gcloud config set project $ProjectId | Out-Null

Write-Host "Building with Cloud Build (a few minutes)..."
gcloud builds submit --tag $Image .
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host "Deploying to Cloud Run..."
# One instance only (crowd counts live in memory); --timeout 3600 keeps camera streams open.
# ^@^ makes "@" the list separator, because CorsOrigins itself contains commas.
gcloud run deploy $ServiceName `
    --image $Image `
    --region $Region `
    --platform managed `
    --cpu 2 `
    --memory 4Gi `
    --min-instances 1 `
    --max-instances 1 `
    --no-cpu-throttling `
    --timeout 3600 `
    --port 8080 `
    --allow-unauthenticated `
    --add-cloudsql-instances $SqlInstance `
    --set-secrets "DATABASE_URL=${DbSecret}:latest" `
    --set-env-vars "^@^ENV=production@FIREBASE_PROJECT_ID=$ProjectId@PUBLIC_APP_URL=$PublicAppUrl@CORS_ORIGINS=$CorsOrigins"
if ($LASTEXITCODE -ne 0) { exit 1 }

$Url = gcloud run services describe $ServiceName --region $Region --format="value(status.url)"
Write-Host ""
Write-Host "Deployed: $Url"
Write-Host "Check:    $Url/api/health"
Write-Host "Frontend: set NEXT_PUBLIC_BACKEND_URL=$Url in frontend/.env, then npm run deploy"

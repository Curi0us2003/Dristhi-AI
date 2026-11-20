# scale.ps1 up|down - Keep one backend instance running (up) or let it scale to zero (down).
#   .\scripts\scale.ps1 up [-Service crowd-monitoring-api] [-Region asia-south1]
param (
    [Parameter(Mandatory = $true)][ValidateSet("up", "down")][string]$Action,
    [string]$Service = "crowd-monitoring-api",
    [string]$Region = "asia-south1"
)
$Min = if ($Action -eq "up") { 1 } else { 0 }
gcloud run services update $Service --region $Region --min-instances $Min
Write-Host "${Service}: min instances = $Min"

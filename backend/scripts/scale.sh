#!/bin/bash
# scale.sh up|down - Keep one backend instance running (up, before events) or let it scale to zero
# (down, between events, so the always-on CPU stops costing money).
#   ./scripts/scale.sh up [service] [region]
set -euo pipefail
ACTION="${1:-}"; SERVICE="${2:-crowd-monitoring-api}"; REGION="${3:-asia-south1}"
case "$ACTION" in
  up) MIN=1 ;;
  down) MIN=0 ;;
  *) echo "Usage: $0 up|down [service] [region]" >&2; exit 1 ;;
esac
gcloud run services update "$SERVICE" --region "$REGION" --min-instances "$MIN"
echo "$SERVICE: min instances = $MIN"

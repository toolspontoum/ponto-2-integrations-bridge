#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-https://panel.pontoenterprise.com.br}"
ENDPOINTS=(
  "/api/canva/oauth/dev/callback"
  "/api/canva/oauth/stage/callback"
  "/api/canva/oauth/callback"
  "/api/canva/oauth/dev/authorize"
  "/api/canva/oauth/stage/authorize"
  "/api/canva/oauth/authorize"
)

for endpoint in "${ENDPOINTS[@]}"; do
  url="${BASE_URL}${endpoint}"
  code="$(curl -sS -o /tmp/canva_oauth_smoke_body -w "%{http_code}" "$url")"
  echo "${code} ${url}"

  if [[ "$endpoint" == *"/authorize" ]]; then
    [[ "$code" == "200" ]] || { echo "Expected 200 for authorize endpoint: $url" >&2; exit 1; }
  else
    [[ "$code" == "400" ]] || { echo "Expected 400 for callback without query params: $url" >&2; exit 1; }
  fi
done

echo "smoke_passed"

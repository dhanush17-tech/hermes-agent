#!/usr/bin/env bash
# Wire Hermes + Personal OS to Cloudflare Workers AI using wrangler account + project token.
set -euo pipefail

ACCOUNT_ID=$(wrangler whoami 2>/dev/null | awk '/Account ID/ { print $NF; exit }' | tr -d '│ ')
if [[ -z "$ACCOUNT_ID" ]]; then
  echo "Run: wrangler login"
  exit 1
fi

TOKEN="${CLOUDFLARE_API_TOKEN:-}"
if [[ -z "$TOKEN" ]]; then
  for f in "$HOME/Desktop/devlabs/hackazona/.env" "$HOME/Desktop/devlabs/devhacks/server/.env"; do
    if [[ -f "$f" ]]; then
      TOKEN=$(grep -m1 '^CLOUDFLARE_API_TOKEN=' "$f" | cut -d= -f2- | tr -d '"')
      break
    fi
  done
fi

if [[ -z "$TOKEN" ]]; then
  echo "Set CLOUDFLARE_API_TOKEN or add token to a project .env"
  exit 1
fi

BASE="https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/v1"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

grep -q '^CLOUDFLARE_ACCOUNT_ID=' "$HOME/.hermes/.env" 2>/dev/null || {
  cat >> "$HOME/.hermes/.env" <<EOF

CLOUDFLARE_ACCOUNT_ID=${ACCOUNT_ID}
CLOUDFLARE_API_TOKEN=${TOKEN}
CLOUDFLARE_AI_BASE_URL=${BASE}
EOF
}

grep -q '^CLOUDFLARE_ACCOUNT_ID=' "$ROOT/.env" 2>/dev/null || {
  cat >> "$ROOT/.env" <<EOF

CLOUDFLARE_ACCOUNT_ID=${ACCOUNT_ID}
CLOUDFLARE_API_TOKEN=${TOKEN}
CLOUDFLARE_AI_BASE_URL=${BASE}
EOF
}

echo "Account: $ACCOUNT_ID"
echo "Base URL: $BASE"
echo "Restart: source ~/.hermes/hermes-agent/venv/bin/activate && hermes gateway"

#!/usr/bin/env bash
# Phase 0: Install/configure NousResearch Hermes for Personal OS
set -euo pipefail

HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
HERMES_REPO="${HERMES_REPO:-$HERMES_HOME/hermes-agent}"
ENV_FILE="$HERMES_HOME/.env"

echo "==> Hermes install directory: $HERMES_REPO"

if [[ ! -d "$HERMES_REPO/.git" ]]; then
  echo "==> Cloning hermes-agent..."
  mkdir -p "$HERMES_HOME"
  git clone --depth 1 https://github.com/NousResearch/hermes-agent.git "$HERMES_REPO"
fi

if ! command -v uv >/dev/null 2>&1; then
  echo "==> Installing uv..."
  curl -fsSL https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
fi

cd "$HERMES_REPO"
if [[ ! -d venv ]]; then
  echo "==> Creating venv and installing package..."
  uv venv venv
  source venv/bin/activate
  uv pip install -e ".[dev]" 2>/dev/null || uv pip install -e .
else
  source venv/bin/activate
fi

mkdir -p "$(dirname "$ENV_FILE")"
touch "$ENV_FILE"

if ! grep -q '^API_SERVER_ENABLED=' "$ENV_FILE" 2>/dev/null; then
  KEY="${API_SERVER_KEY:-$(openssl rand -hex 32)}"
  cat >> "$ENV_FILE" <<EOF

# Personal OS — API server (added by setup-hermes.sh)
API_SERVER_ENABLED=true
API_SERVER_PORT=8642
API_SERVER_HOST=127.0.0.1
API_SERVER_KEY=$KEY
EOF
  echo "==> Wrote API_SERVER_* to $ENV_FILE"
  echo "==> Copy API_SERVER_KEY to Personal OS .env as HERMES_API_KEY"
else
  echo "==> API server already configured in $ENV_FILE"
fi

if ! grep -q 'hermes-agent/venv/bin' <<< "${PATH:-}"; then
  echo 'export PATH="$HOME/.hermes/hermes-agent/venv/bin:$HOME/.local/bin:$PATH"' >> "$HOME/.zshrc" 2>/dev/null || true
fi

echo "==> Run: source $HERMES_REPO/venv/bin/activate && hermes setup"
echo "==> Then: hermes gateway"
echo "==> Verify: curl http://127.0.0.1:8642/health"

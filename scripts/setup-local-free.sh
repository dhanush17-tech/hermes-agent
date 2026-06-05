#!/usr/bin/env bash
# Configure zero-cost local inference: Ollama on this Mac + Hermes custom endpoint.
set -euo pipefail

BASE_MODEL="${LOCAL_LLM_BASE:-qwen2.5-coder:7b}"
MODEL="${LOCAL_LLM_MODEL:-qwen2.5-coder-64k}"

echo "==> Pulling local Ollama model: $BASE_MODEL (not Ollama Cloud)"
ollama pull "$BASE_MODEL"

echo "==> Creating $MODEL with 65536 context (Hermes minimum)"
cat > /tmp/hermes-local-modelfile <<EOF
FROM $BASE_MODEL
PARAMETER num_ctx 65536
EOF
ollama create "$MODEL" -f /tmp/hermes-local-modelfile 2>/dev/null || true

echo "==> Verifying Ollama API..."
curl -sf "http://127.0.0.1:11434/v1/models" >/dev/null || {
  echo "Start Ollama: ollama serve"
  exit 1
}

echo "==> Installing free web search dependency in Hermes venv..."
VENV="${HERMES_VENV:-$HOME/.hermes/hermes-agent/venv}"
if [[ -x "$VENV/bin/pip" ]]; then
  "$VENV/bin/pip" install -q ddgs
fi

echo "==> Done. Restart gateway:"
echo "    source $VENV/bin/activate && hermes gateway"
echo "Model in ~/.hermes/config.yaml should be: $MODEL"

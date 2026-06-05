# Local & free stack

Personal OS + Hermes can run **without paid cloud LLM APIs**.

## What costs money (disabled in your config)

| Service | Was | Now |
|---------|-----|-----|
| Nous Portal / inference-api | `provider: nous` | `provider: custom` → Ollama |
| OpenRouter | optional key in `.env` | removed from Personal OS `.env` |
| Nous Tool Gateway | `use_gateway: true` on web/browser/image | `false` |
| Ollama Cloud models (`*:cloud`) | remote | use local `ollama pull` only |

## What stays local

- **Personal OS** — SQLite, approvals, CLI (no cloud)
- **Hermes API** — `127.0.0.1:8642` (your Mac only)
- **LLM** — Ollama `http://localhost:11434/v1`
- **Web search** — DuckDuckGo via `ddgs` (free, no API key)
- **Browser tool** — local Chromium (no gateway)

## One-time setup

```bash
chmod +x scripts/setup-local-free.sh
./scripts/setup-local-free.sh

source ~/.hermes/hermes-agent/venv/bin/activate
hermes gateway
```

16GB M4 default model: `qwen2.5-coder-64k` (local `qwen2.5-coder:7b` + 65536 context — required by Hermes). For heavier work, try a larger base model only if you have spare RAM.

## Avoid accidental cloud use

- Do **not** use `ollama pull something:cloud` — that hits Ollama Cloud.
- Do **not** run `hermes setup --portal` if you want zero Nous billing.
- Personal OS high-risk actions still use **your** ApprovalBroker, not Hermes cloud.

## If you had cloud API keys in `.env`

Rotate any keys that were ever committed or shared (OpenRouter, etc.) in the provider dashboards.

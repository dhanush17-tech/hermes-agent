# Hermes + Cloudflare Workers AI ($5 plan)

Use Cloudflare instead of local Ollama when RAM is tight. Workers AI is **not** included in the $5 minimum by itself—you pay **neurons** on top of the Workers Paid plan.

## Pricing (what $5 actually buys)

| Item | Detail |
|------|--------|
| Workers Paid | **$5/month minimum** per account (compute, KV, etc.) |
| Workers AI free tier | **10,000 neurons/day** on Paid plan |
| Over quota | **$0.011 per 1,000 neurons** ([pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)) |

A heavy Hermes agent session can burn through 10k neurons quickly on large models. Prefer **smaller / flash** models for daily use.

## Best models for Hermes Personal OS

Hermes needs **tool calling** and ideally **≥64k context** (system prompt + tools).

| Model ID | Context | Tools | Notes |
|----------|---------|-------|--------|
| **`@cf/zai-org/glm-4.7-flash`** | 131k | Yes | **Recommended** — fast, cheap ($0.06/M in, $0.40/M out), fits agent context |
| `@cf/openai/gpt-oss-20b` | check catalog | Yes | Smaller OSS model, good latency |
| `@cf/openai/gpt-oss-120b` | large | Yes | Smarter, much higher neuron cost |
| `@hf/nousresearch/hermes-2-pro-mistral-7b` | 24k | Yes | Hermes-branded but **too small context** for full agent |
| `@cf/qwen/qwen2.5-coder-32b-instruct` | 32k | Yes | Great for code, may fail Hermes 64k minimum |

Full catalog: https://developers.cloudflare.com/workers-ai/models/

## Setup

1. [Workers Paid](https://developers.cloudflare.com/workers/platform/pricing/) on your account.
2. Create an API token with **Workers AI** permission.
3. Note your **Account ID** (dashboard sidebar).

Add to `~/.hermes/.env`:

```bash
CLOUDFLARE_ACCOUNT_ID=your_account_id
CLOUDFLARE_API_TOKEN=your_token
```

Edit `~/.hermes/config.yaml`:

```yaml
model:
  provider: custom
  base_url: https://api.cloudflare.com/client/v4/accounts/YOUR_ACCOUNT_ID/ai/v1
  default: "@cf/zai-org/glm-4.7-flash"
  context_length: 131072
```

Restart: `hermes gateway`

## Personal OS `.env`

```bash
HERMES_API_URL=http://127.0.0.1:8642
HERMES_API_KEY=<same as API_SERVER_KEY>
```

## Stop local Ollama (free RAM)

```bash
ollama stop qwen2.5-coder-64k
# optional — quit daemon entirely:
pkill ollama
```

## AI Gateway (optional)

Route through [AI Gateway](https://developers.cloudflare.com/ai-gateway/) for caching, rate limits, and observability—same models, extra control.

## Auto model routing (Personal OS + Hermes)

Task → model mapping lives in `configs/cloudflare-models.yaml`. The orchestrator picks a model per classification (research → reasoning, coding → Qwen coder, status → small Llama).

| Task | Model |
|------|--------|
| Default / tools | `@cf/zai-org/glm-4.7-flash` |
| `research` | `@cf/openai/gpt-oss-20b` |
| `coding` | `@cf/qwen/qwen2.5-coder-32b-instruct` |
| `status` / memory | `@cf/meta/llama-3.2-3b-instruct` |

Hermes chat aliases (switch mid-session):

```text
/model custom:cf-fast:@cf/zai-org/glm-4.7-flash
/model custom:cf-code:@cf/qwen/qwen2.5-coder-32b-instruct
/model custom:cf-reason:@cf/openai/gpt-oss-20b
```

CLI research: `pnpm --filter @hermes-os/cli dev` then `research <topic>` (uses Cloudflare when `.env` has account + token).

Sync credentials from wrangler + existing project env:

```bash
./scripts/configure-cloudflare.sh
```

## Cursor Cloudflare MCP

The Cloudflare plugin exposes OAuth MCP servers (docs, bindings, builds, observability). This repo includes `.cursor/mcp.json` with those endpoints—authenticate once in **Cursor Settings → MCP** if tools show as disconnected.

MCP OAuth does **not** export API tokens; Workers AI uses `CLOUDFLARE_API_TOKEN` from `~/.hermes/.env` (same token as wrangler-compatible projects).

# Supported intents

Routing is **model-based only** via `IntentClassifier` + `configs/intents.yaml`.

## Intent catalog

| Intent | Agent | Tools / backend |
|--------|-------|-----------------|
| `research` | ResearchAgent | Cloudflare Workers AI |
| `approval_response` | ApprovalAgent | ApprovalBroker |
| `status` | Orchestrator | pause / resume / emergency / status |
| `laptop_control` | LaptopControlAgent | `screen.observe`, `browser.goto`, gated `social.post`, … |
| `coding` | CodingAgent | Hermes gateway or Cloudflare |
| `writing` | WritingAgent | Cloudflare draft + `imessage.send` |
| `browser_task` | BrowserAgent → laptop | screen + open URL (not APIs) |
| `personal_ops` | PersonalOpsAgent / laptop | internal brief; external services → laptop |
| `memory_update` | MemoryAgent | SQLite memories |
| `unknown` | GeneralAgent | CF + memory context |

All intents are **implemented** in the orchestrator.

## Classifier entities

See `packages/shared/src/intent/types.ts` — `approvalAction`, `assistantControl`, `toolName`, `url`, `memoryAction`, `researchContinue`, etc.

## Requirements

- `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` for classifier and most agents
- `HERMES_API_URL` + `HERMES_API_KEY` optional for coding (preferred)

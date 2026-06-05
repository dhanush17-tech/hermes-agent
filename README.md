# Hermes Personal OS

Local-first proactive personal assistant. **Hermes Personal OS** is the control plane — it owns tools, credentials, approvals, audit, and policy. **Nous Hermes Agent** (via the Python gateway) is the primary cognitive runtime for serious tasks: it reasons and *proposes* tool calls in JSON; Personal OS *authorizes and executes* them.

Primary interfaces: **web chat** (`pnpm start`) and **iMessage** (`pnpm imessage`).

> **Architecture diagram:** open [`docs/architecture.excalidraw`](docs/architecture.excalidraw) in the [Excalidraw VS Code/Cursor extension](https://marketplace.visualstudio.com/items?itemName=pomdtr.excalidraw-editor) for an editable visual overview.

## Quick start

```bash
pnpm install
pnpm build
pnpm start
```

Open the chat UI at http://127.0.0.1:3847

Try in chat:

```
daily brief
check my gmail
research best pillow for a side sleeper and give me buy links
status
```

Copy `.env.example` to `.env` and fill in Cloudflare + optional Hermes gateway keys.

## Design principle

```
Hermes Agent proposes  →  Personal OS authorizes  →  ToolExecutor executes
```

The cognitive runtime **never** calls tools directly. Every side effect goes through:

1. **ToolExecutor** — registered tools only; unknown tools are denied
2. **PolicyEngine** — risk levels from `configs/risk-policy.yaml`
3. **ApprovalBroker** — capability leases for high-risk actions
4. **AuditLogger** — full trail in SQLite + `data/activity.jsonl`

Runtime tool payloads **cannot** include `approvalId` or capability-lease bypass fields.

## Architecture overview

```
You (Chat / iMessage)
  └─ UI Layer (chat-server, imessage-bridge)
       └─ Orchestrator (control plane)
            ├─ IntentClassifier (Cloudflare — cheap, fast)
            ├─ Specialized local agents (research, laptop, autonomous, …)
            └─ Serious tasks → RuntimeRouter
                 ├─ Hermes Gateway (primary) — JSON tool proposals
                 └─ Cloudflare Workers AI (fallback / classifier)
                      └─ Cognitive tool loop (≤8 rounds)
                           └─ ToolExecutor → Policy → Approval → Audit
                                └─ Gmail, browser, web, filesystem, terminal, memory, …
```

See also: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/SAFETY_MODEL.md`](docs/SAFETY_MODEL.md).

## Agent runtime (`packages/agent-runtime`)

New package that abstracts cognitive backends behind a single interface.

| Module | Role |
|--------|------|
| `AgentRuntime` | `run()` + `continue()` contract for all cognitive backends |
| `HermesGatewayRuntime` | Talks to Nous Hermes Python gateway (`:8642`) |
| `CloudflareRuntime` | Workers AI fallback when gateway is down |
| `RuntimeRouter` | Picks runtime: Hermes primary → CF fallback → local agents |
| `hermes-tool-protocol` | System prompt + JSON parse for `toolRequests`, `memoryCandidates`, `skillCandidates` |

### Runtime selection

```typescript
// RuntimeRouter.chooseKind()
local          → approval_response, status (handled in-process)
cloudflare     → classification, extraction (cheap utility)
hermes_primary → Hermes gateway available (research, coding, browser, personal_ops, …)
cloudflare     → Hermes unavailable
local          → no remote runtime; fall back to specialized agents
```

### Cognitive tool loop

For serious tasks (`handleSeriousTask` in the orchestrator):

1. Build `AgentRunInput` with memories, open loops, tasks, and the **tool catalog** (names + risk levels — no secrets).
2. Call `runtime.run(input)` with timeout (`HERMES_RUNTIME_TIMEOUT_MS`, default 45s).
3. For each `toolRequest` in the response:
   - Validate tool is registered; reject bypass payloads.
   - Execute via `ToolExecutor.invoke()`.
   - If `pending_approval`, return to user immediately.
4. Feed results to `runtime.continue(sessionId, …)` — up to **8 rounds**.
5. Process `memoryCandidates` (high-confidence, normal sensitivity only) and save `skillCandidates` as drafts under `data/skill-candidates/`.

### Tool catalog protocol

Hermes receives a structured catalog built from `ToolRegistry`. It returns JSON:

```json
{
  "final": "reply when done",
  "toolRequests": [{ "toolName": "web.fetch", "payload": {}, "reason": "...", "riskHint": "read" }],
  "memoryCandidates": [],
  "skillCandidates": [],
  "reasoningSummary": "brief"
}
```

## Orchestrator routing

| Intent | Primary path |
|--------|----------------|
| `research` (shopping/links) | Deterministic `ResearchAgent` |
| `research` (deep) | Cognitive runtime loop |
| `coding` | Cognitive runtime loop |
| `browser_task` / `laptop_control` | Cognitive loop, or `LaptopControlAgent` for explicit browser/login/Gmail-open |
| `personal_ops` | Cognitive runtime loop |
| `memory_update` | `MemoryAgent` |
| `writing` | `WritingAgent` |
| `approval_response` | `ApprovalAgent` |
| `unknown` | Cognitive loop or `AutonomousAgent` for multi-step browser work |

**Browser-controlled service requests** (open Gmail, log in, fill credentials) route early to `LaptopControlAgent` with headed Playwright — not the autonomous planner — to avoid JSON parse failures on credential replies.

## Specialized local agents

| Agent | When used |
|-------|-----------|
| `ResearchAgent` | Structured research plans; shopping/link queries |
| `LaptopControlAgent` | Screen observe, browser goto, credential fill, Arc integration |
| `AutonomousAgent` | Multi-step browser autonomy (think → tool → screen → replan) |
| `CodingAgent` | Direct code edits via Hermes gateway or pending-edits queue |
| `ChiefOfStaffAgent` | Morning/evening briefs, connector ingest, risk surfacing |
| `BrowserAgent` | Lightweight browser tasks |
| `GeneralAgent` | Memory recall, catch-all with recent context |

## Tool execution layer

Registered tools (see `packages/tool-executor`):

- **Memory:** `memory.remember`, `memory.forget`, `memory.search`
- **Filesystem:** `filesystem.read`, `filesystem.write` (gated)
- **Web:** `web.fetch`
- **Gmail:** `gmail.list`, `gmail.read`, `gmail.search` (OAuth tokens under `~/.hermes/secrets/`)
- **Browser:** `browser.open`, `browser.goto`, `browser.fill`, `browser.fill_credentials`, `browser.extract`, `browser.click` (Playwright headed by default; Arc fallback via AppleScript)
- **Terminal:** `terminal.run` (approval-gated)
- **Social:** `social.post` — opens compose in browser + `data/outbox/`
- **Screen:** `screen.observe`
- **Code:** `code.self_edit`
- **Messaging:** `imessage.send` (approval-gated)

### Browser dual-path

| Engine | Default | Use case |
|--------|---------|----------|
| Playwright (headed) | Yes | `browser.open`, `browser.fill_credentials`, DOM refs |
| Arc (AppleScript) | `HERMES_BROWSER_ENGINE=arc` | `browser.goto` opens URL in Arc |
| Headless | `HERMES_BROWSER_HEADLESS=1` | CI / background fetch only |

Connect to an existing browser: `HERMES_CDP_ENDPOINT=http://127.0.0.1:9222`

## Safety and policy

- Risk policy: `configs/risk-policy.yaml`
- Memory policy: `configs/memory-policy.yaml`
- Autonomy policy: `configs/autonomy-policy.yaml`
- Approvals expire after `APPROVAL_TTL_SECONDS` (default 300s)
- Denied tool calls include reasons in the activity log

High-risk actions (terminal, sends, posts, sensitive browser fills) pause for iMessage/web approval before execution.

## Hermes Python backend

Install and run [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) separately:

```bash
chmod +x scripts/setup-hermes.sh
./scripts/setup-hermes.sh
source ~/.hermes/hermes-agent/venv/bin/activate
hermes setup
hermes gateway
```

Copy `API_SERVER_KEY` from `~/.hermes/.env` into this repo's `.env` as `HERMES_API_KEY`.

**Cloudflare Workers AI** (recommended on tight RAM): `./scripts/configure-cloudflare.sh` — see [docs/CLOUDFLARE_WORKERS_AI.md](docs/CLOUDFLARE_WORKERS_AI.md).

## Environment variables

| Variable | Purpose |
|----------|---------|
| `HERMES_API_URL` | Hermes gateway URL (default `http://127.0.0.1:8642`) |
| `HERMES_API_KEY` | Gateway API key |
| `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` | Workers AI |
| `HERMES_RUNTIME_TIMEOUT_MS` | Cognitive runtime timeout (default `45000`) |
| `HERMES_BROWSER_HEADLESS` | Set `1` for headless Playwright |
| `HERMES_BROWSER_ENGINE` | `playwright` (default) or `arc` |
| `HERMES_CDP_ENDPOINT` | Connect Playwright to existing Chrome |
| `GOOGLE_ACCOUNTS` | Multi-account Gmail OAuth config |
| `SUPERMEMORY_API_KEY` | Optional semantic memory |

Full list: [`.env.example`](.env.example)

## Monorepo layout

```
apps/
  chat-server/       Web chat UI + control API
  imessage-bridge/   iMessage poll/reply
  orchestrator/      Intent routing, agents, cognitive loop
  daemon/            Background lifecycle
packages/
  agent-runtime/     Hermes + Cloudflare cognitive backends
  tool-executor/     Tool registry and execution
  approval-broker/   Capability leases
  policies/          YAML policy loaders
  context-graph/     SQLite data layer
  audit-log/         Activity trail
  browser-control/   Playwright + session manager
  connectors/        Screen capture → source_items
  memory/            Long-term memory CRUD
configs/             intents, risk, memory, autonomy, models
docs/                Architecture, setup, safety
```

## Phase 2: iMessage + proactive

```bash
pnpm imessage   # poll chat.db, reply via Messages.app, proactive scans
```

**Observe:** periodic Arc presence scans (Gmail, X, LinkedIn, Calendar screenshots). **Act:** `AutonomousAgent` multi-step loops; pauses for login/CAPTCHA/ambiguous UI. See [docs/PHASE2.md](docs/PHASE2.md), [docs/PRODUCT.md](docs/PRODUCT.md).

## Development

```bash
pnpm build      # compile all packages
pnpm test       # vitest across packages
pnpm logs       # tail activity log
```

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — component reference
- [docs/architecture.excalidraw](docs/architecture.excalidraw) — visual diagram (Excalidraw)
- [docs/SETUP.md](docs/SETUP.md) — full setup guide
- [docs/SAFETY_MODEL.md](docs/SAFETY_MODEL.md) — approval and risk model
- [docs/INTENTS.md](docs/INTENTS.md) — intent catalog
- [docs/MONITORING.md](docs/MONITORING.md) — activity and health

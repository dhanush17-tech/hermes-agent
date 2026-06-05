# Architecture

Hermes Personal OS is a TypeScript **control plane** around a local SQLite context graph. **Nous Hermes Agent** (Python gateway) is the primary **cognitive runtime** for serious tasks. The agent proposes tool calls in JSON; Personal OS authorizes and executes them — never the other way around.

Visual diagram: [`architecture.excalidraw`](./architecture.excalidraw) (open with the Excalidraw Cursor/VS Code extension).

## Components

| Layer | Package / App | Role |
|-------|----------------|------|
| UI | `apps/chat-server`, `apps/imessage-bridge` | Web chat + iMessage poll/reply |
| Ingest | `packages/connectors` | Screen → `source_items` |
| Laptop UI | `LaptopControlAgent` | `screen.observe`, `browser.goto`, credential fill |
| Proactive | `apps/orchestrator/proactive-scheduler` | Cron-style scans + policy scoring |
| Control | `apps/orchestrator` | Intent classifier, routing, cognitive tool loop |
| Cognitive | `packages/agent-runtime` | Hermes gateway + Cloudflare runtimes, `RuntimeRouter` |
| Safety | `packages/policies`, `packages/approval-broker`, `packages/tool-executor` | Risk policy, approvals, execution |
| Memory | `packages/memory` | Long-term memory CRUD + policy |
| Data | `packages/context-graph`, `packages/audit-log` | SQLite graph + audit trail |
| Reasoning | Hermes gateway `:8642` (primary), Cloudflare (classifier + fallback) | Intent, serious tasks |

## Agent runtime (`packages/agent-runtime`)

| Type | Implementation | When |
|------|----------------|------|
| `hermes_primary` | `HermesGatewayRuntime` | Gateway reachable; research, coding, browser, personal_ops |
| `cloudflare` | `CloudflareRuntime` | Gateway down; also classifier/extraction utility |
| `local` | Specialized agents in orchestrator | Approvals, status, shopping research, laptop control |

### Cognitive tool loop

`Orchestrator.handleSeriousTask()`:

1. `RuntimeRouter.choose(intent)` → pick runtime
2. `runtime.run(AgentRunInput)` — memories, open loops, tool catalog, constraints
3. For each `toolRequest`: validate → `ToolExecutor.invoke()` → collect results
4. `runtime.continue(sessionId, toolResults)` — repeat up to 8 rounds
5. Process `memoryCandidates` / `skillCandidates`; audit every step

Constraints enforced on every tool request:

- Tool must be in `ToolRegistry`
- No `approvalId` or capability-lease fields in payload
- High-risk → `ApprovalBroker` before execution
- Timeout per call: `HERMES_RUNTIME_TIMEOUT_MS` (default 45s)

## Agents (`apps/orchestrator`)

| Agent | Intent(s) | Backend |
|-------|-----------|---------|
| Router | all | `IntentClassifier` (CF model) |
| ResearchAgent | `research` (shopping/links) | Deterministic structured plan |
| Cognitive loop | `research`, `coding`, `browser_task`, `personal_ops`, `unknown` | Hermes primary → CF fallback |
| MemoryAgent | `memory_update` | SQLite + CF type inference |
| ChiefOfStaffAgent | `personal_ops` | Briefs, open loops, connector ingest, risks |
| RiskPredictionAgent | proactive scan | `@hermes-os/risk-engine` detectors |
| CodingAgent | `coding` (fallback) | Hermes gateway, else Cloudflare |
| AutonomousAgent | multi-step browser | CF planner + ToolExecutor loop |
| BrowserAgent | `browser_task` | Laptop control (screen + open URL) |
| LaptopControlAgent | `laptop_control`, explicit browser/login | Playwright headed + Arc fallback |
| WritingAgent | `writing` | CF draft + `imessage.send` tool |
| ApprovalAgent | `approval_response` | ApprovalBroker |
| GeneralAgent | `unknown` (recall) | CF + recent memories |

## Message flow

```
User → Orchestrator → IntentClassifier (CF)
                    → Agent for intent OR handleSeriousTask()
                    → RuntimeRouter → HermesGateway / CloudflareRuntime
                    → toolRequests[] (JSON proposals)
                    → ToolExecutor (validate + execute)
                    → ApprovalBroker (if high risk)
                    → runtime.continue() (up to 8 rounds)
                    → AuditLogger
```

Custom capabilities: `tools.author` / `tools.define` save macros in `data/custom-tools/`; `code.self_edit` + `filesystem.write` change the repo.

## Tools (registered)

- `memory.remember` / `memory.forget` / `memory.search`
- `filesystem.read`
- `web.fetch`
- `terminal.run` (approval per policy)
- `social.post` — open X compose in browser + `data/outbox/` (no X API)
- `screen.observe` / `browser.goto` — Mac screen + `open` URL
- `code.self_edit` — Hermes gateway if up, else `data/pending-edits/`
- `imessage.send` — AppleScript → Messages.app (after approval)

## Connectors & proactive loop

```
ConnectorHub → source_items (SQLite)
ProactiveScanner → score (proactivity-policy.yaml)
startProactiveScheduler → notify (iMessage or stdout)
```

Started automatically with `pnpm imessage`. See [PHASE2.md](./PHASE2.md).

## Data stores

- **Personal OS**: `data/local.sqlite`
- **Hermes**: `~/.hermes/` — optional gateway

## Config

- `configs/intents.yaml` — intent catalog for classifier
- `configs/risk-policy.yaml` — tool risks
- `configs/memory-policy.yaml` — what to store
- `configs/proactivity-policy.yaml` — notify thresholds
- `configs/cloudflare-models.yaml` — per-task models

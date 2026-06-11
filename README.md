# Hermes — your personal Poke agent

A local-first personal AI agent that lives on your Mac. One agent, real tools, real memory. It reads your inbox and calendar, searches the live web, controls your computer, books rides, drafts email, remembers things about you, and proactively looks out for you.

Talk to it via **web chat** (`pnpm start`) or **iMessage** (`pnpm imessage`).

## How it works

```
You (chat / iMessage)
  └─ Orchestrator  — owns history, memory, audit, approvals
       └─ Poke agent — ONE agentic loop on OpenRouter (native tool calling)
            ├─ inbox      gmail.check_inbox / search / summarize / send_draft
            ├─ calendar   calendar.list
            ├─ live web   web.search / web.fetch
            ├─ computer   screen.observe / browser.open / terminal.run
            ├─ rides      ride.uber / ride.lyft   (prefilled deep links)
            ├─ memory     memory.remember / search
            ├─ ping you   message_user
            └─ self-edit  filesystem.read + code.self_edit + code.run_tests + code.rollback
                 └─ ToolExecutor → risk policy → approval (if needed) → audit
```

There is no intent classifier, no router, no sub-agents. The model decides what to do with its tools. Every side effect goes through the `ToolExecutor`: registered tools only, risk levels from `configs/risk-policy.yaml`, high-risk actions pause for your approval, everything is audited.

## The brain: OpenRouter

The agent runs on [OpenRouter](https://openrouter.ai) so the model is a config value, not code. Defaults balance cost and quality:

| Tier | Default model | Used for |
|------|---------------|----------|
| primary | `google/gemini-2.5-flash` | day-to-day chat + tool calls (cheap, reliable tool use) |
| reasoning | `anthropic/claude-sonnet-4.5` | hard reasoning / coding / self-edits |
| cheap | `google/gemini-2.5-flash-lite` | throwaway classification |

Override any of them with `LLM_PRIMARY_MODEL` / `LLM_REASONING_MODEL` / `LLM_CHEAP_MODEL`.

## Quick start

```bash
pnpm install
pnpm build
cp .env.example .env      # add OPENROUTER_API_KEY (required)
pnpm start                # web chat at http://127.0.0.1:3847
```

Try in chat:

```
check my email
what's on my calendar today
where can I park free near Munger 1 at Stanford — give me the maps link
book me an uber to SFO
add a tool that tells me the current bitcoin price
daily brief
```

## Self-editing

Ask it to extend itself and it does — no manual coding. It reads the relevant file (`filesystem.read`), writes the complete new contents (`code.self_edit`), and can verify (`code.run_tests`). Every edit is checkpoint-backed and reversible (`code.rollback`). Protected paths (`.env`, `secrets/`, `.git/`, `node_modules/`) are refused.

## Proactive care

`pnpm start` runs a scheduler that:

- **Forecasts** your day — morning brief from calendar + inbox, plus a risk scan (`configs/proactivity-policy.yaml` thresholds).
- **Looks out for you** — if you're messaging in the small hours, it sends one gentle late-night nudge (tune with `PROACTIVE_WELLBEING` / `PROACTIVE_LATE_NIGHT_*`).
- **Pings you** via iMessage when something crosses the notification threshold.

## Optional integrations

- **Gmail / Calendar**: `node scripts/google-oauth.mjs` (tokens under `~/.hermes/secrets/`). Calendar reads the local macOS Calendar.
- **Supermemory**: set `SUPERMEMORY_API_KEY` for semantic long-term memory.
- **Cloudflare Workers AI**: optional, only for vision/screen utilities — not the brain.

## Monorepo layout

```
apps/
  chat-server/       Web chat UI + control API
  imessage-bridge/   iMessage poll/reply
  orchestrator/      Poke agent loop, control plane, proactive scheduler
  daemon/            Background lifecycle
packages/
  llm-client/        OpenRouter client (native tool calling)
  tool-executor/     Tool registry + execution
  approval-broker/   Capability leases for high-risk actions
  policies/          Risk / proactivity policy loaders
  context-graph/     SQLite data layer
  audit-log/         Activity trail
  browser-control/   Playwright + session manager
  connectors/        Gmail, Calendar, screen, files
  memory/            Long-term memory
  risk-engine/       Proactive risk detectors
  code-tools/        Patch apply / rollback / test runner
configs/             risk, proactivity, memory policies
```

## Development

```bash
pnpm build      # compile everything (scripts/build-all.mjs, dependency order)
pnpm test       # vitest across packages
pnpm logs       # tail activity log
```

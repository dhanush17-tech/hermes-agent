# Monolithic runtime

Hermes runs as **one process** with a single entrypoint:

```bash
pnpm build
pnpm start          # full stack: scheduler + chat UI + health + notifications
pnpm chat           # chat UI only
pnpm imessage       # iMessage bridge only
```

Or after build: `hermes start` (via `bin` in root `package.json`).

## What runs in `hermes start`

| Subsystem | Source |
|-----------|--------|
| Orchestrator + ToolExecutor | `bootstrapPersonalOs()` |
| Proactive scheduler | `startProactiveScheduler()` |
| Chat web UI (port 3847) | `startChatServer()` |
| Health (port 3850) | daemon health server |
| Notification center | daemon |
| iMessage bridge | optional: `HERMES_ENABLE_IMESSAGE=1` |

## Layout

- **`src/main.ts`** — unified CLI (`hermes <command>`)
- **`packages/`** — internal libraries (compiled to `packages/*/dist`)
- **`apps/`** — former standalone apps, now library modules + optional legacy bins

Internal imports resolve via root `package.json` → `"imports"` map (`@hermes-os/*`).

## Env

```bash
HERMES_DISABLE_CHAT=1        # scheduler-only, no web UI
HERMES_ENABLE_IMESSAGE=1     # include iMessage poll loop in `hermes start`
```

## Legacy commands

Still work during transition:

- `pnpm --filter @hermes-os/daemon start` — daemon only (no chat unless updated)
- Prefer `pnpm start` for the monolith.

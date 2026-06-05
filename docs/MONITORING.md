# Activity monitoring

Hermes logs every agent invocation, planner step, tool call, and proactive scan.

## Where logs live

| Sink | Location |
|------|----------|
| SQLite | `audit_logs` table in `data/local.sqlite` |
| JSONL | `data/activity.jsonl` (one JSON object per line, enabled by default) |
| Console | stderr when `HERMES_ACTIVITY_CONSOLE=1` |

## View activity

**iMessage / chat**

```
logs
logs 80
status
```

**Terminal**

```bash
pnpm logs
tail -f data/activity.jsonl
```

## Line format (console / `logs` command)

```
16:30:01  AGENT ▶ AutonomousAgent  intent=laptop_control  "check my gmail"
16:30:02  TOOL ? browser.goto  [low]
16:30:04  TOOL ✓ browser.goto  ok
16:30:07  STEP   AutonomousAgent  screen: 3 unread threads about Demo Day
16:30:10  AGENT ✓ AutonomousAgent — Opened Gmail and summarized inbox
```

## Event types

- `agent_invoked` / `agent_step` / `agent_finished` / `agent_blocked` — agent lifecycle
- `intent_classified` — router decision
- `tool_call_requested` / `tool_call_executed` / `tool_call_denied` — tools
- `presence_scan` — Gmail / X / LinkedIn / Calendar browser scan
- `risk_detected`, `proactive_notification_sent`, `research_*`, approvals

## Hindrances (pause once, ask user)

When chat.db, vision, or another blocker occurs, Hermes **notifies once** and pauses (no log spam). State: `data/pending-hindrance.json`.

Reply `continue` or `done` via CLI/iMessage to resume proactive scans.

Chat.db bridge: silent retry every 5 min (`IMESSAGE_CHAT_DB_RETRY_MS`).

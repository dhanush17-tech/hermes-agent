# Hermes Personal OS — product map

Five jobs the assistant is built for:

| Job | Status | Implementation |
|-----|--------|----------------|
| Reactive assistant | **Strong** | `ResearchAgent` + research plan, memory, Arc links |
| Personal chief of staff | **Partial** | `ChiefOfStaffAgent` — briefs, open loops, connector ingest |
| Digital presence monitor | **Implemented** | `DigitalPresenceMonitor` — Arc opens Gmail, X, LinkedIn, Calendar + vision |
| Personal risk prediction | **Partial** | `@hermes-os/risk-engine` + `RiskPredictionAgent` |
| Operator | **Strong** | `AutonomousAgent` think→act→observe; blocked → ask user; `code.self_edit` when stuck |

## Control plane agents

| Agent | File |
|-------|------|
| Router | `router-agent.ts` |
| Research | `research-agent.ts` |
| Chief of staff | `chief-of-staff-agent.ts` |
| Risk prediction | `risk-prediction-agent.ts` |
| Memory | `memory-agent.ts` |
| Operator | `operator-agent.ts` + `laptop-control-agent.ts` |
| Approval | `approval-agent.ts` |

## Commands (iMessage or CLI)

- `status` / `pause` / `resume` / `emergency stop`
- `daily brief` / `morning brief`
- `evening review`
- `research <topic>`
- `approve <id>` / `deny <id>`

## Proactivity

- Scan every 15m by default (`PROACTIVE_SCAN_INTERVAL_MS=900000`)
- Morning brief hour: `PROACTIVE_MORNING_BRIEF_HOUR` (default 7)
- Evening review hour: `PROACTIVE_EVENING_REVIEW_HOUR` (default 21)
- Score = impact × urgency × confidence − annoyance (`configs/proactivity-policy.yaml`)

## Not yet built (see `docs/NEXT.md`)

- Playwright browser workbench (`browser.click` / `browser.submit` in policy only)
- Gmail send / calendar write tools
- Full people/projects graph UI
- Habit hypothesis learner with evidence store
- WhatsApp bridge

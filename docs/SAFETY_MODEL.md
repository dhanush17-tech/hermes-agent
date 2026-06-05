# Safety Model

## Principles

1. **Default deny** — unknown tools are rejected (`deny_if_unknown` in `configs/risk-policy.yaml`).
2. **Single execution path** — all side effects go through `ToolExecutor`.
3. **Approval broker is mandatory** — high-risk actions require user approval with exact payload hash match.
4. **No self-approval** — actors `assistant`, `system`, and `hermes` cannot resolve approvals.
5. **No bypass** — blocked tools include `disable_approval_broker`, `bypass_user_approval`, `grant_self_permissions`.
6. **Secrets** — never stored in memory graph; redacted in audit logs.
7. **Self-code edit** — `code.self_edit` always requires approval, even inside the monorepo workspace.
8. **Hermes isolation** — Hermes gateway tools are not directly exposed to iMessage; Personal OS policy is authoritative.

## Approval rules

| Rule | Behavior |
|------|----------|
| TTL | 5 minutes default (`APPROVAL_TTL_SECONDS`) |
| Payload | SHA-256 of canonical JSON; mismatch denies execution |
| Format | `approve <id>` / `deny <id>` |
| Expiry | Lazy expiration on read |

## Risk policy

See `configs/risk-policy.yaml`. Examples:

- `social.post` — high, always approve
- `gmail.read` — read, no approval
- `filesystem.delete` — high, always approve
- `terminal.run` — dynamic, approve if destructive (see `classifyTerminalCommand`)

## Audit

All significant events are written to `audit_logs` with redacted payloads.

## Hermes gateway hardening

- Bind `127.0.0.1` only
- Strong `API_SERVER_KEY`
- Restrict toolsets via `hermes tools` / dedicated profile

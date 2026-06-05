# Phase 2 — iMessage, screen observation, laptop control

## Design principle

**No service API tokens by default.** Gmail, calendar, X, Amazon, and everything else are handled by:

1. **`screen.observe`** — `screencapture` of your Mac
2. **`browser.goto`** — opens URLs in **Arc** (`HERMES_DEFAULT_BROWSER`, default `Arc`)
3. **Login pause** — if the screen shows sign-in, the assistant stops and asks for credentials; then `browser.fill_credentials` fills Arc via UI automation and continues
4. **Approval-gated actions** — e.g. `social.post` opens compose in Arc; you finish or approve follow-up steps

macOS permissions: **Accessibility** + **Automation** for Terminal/Cursor and Arc.

Optional API connectors (`GMAIL_ACCESS_TOKEN`, `X_BEARER_TOKEN`) are **not** used in the default path.

## iMessage bridge

```bash
pnpm imessage
```

Requirements (macOS): Full Disk Access + Messages automation. See `.env.example` for `APPROVED_IMESSAGE_SENDERS`.

## Proactive scans

- **Ingest:** screen captures only → `source_items`
- **Interval:** `PROACTIVE_SCAN_INTERVAL_MS` (default 5 min)
- **Alerts:** iMessage or stdout via `configs/proactivity-policy.yaml`

## Tools

| Tool | Behavior |
|------|----------|
| `screen.observe` | PNG → `data/screen-captures/` |
| `browser.goto` | Open URL/app locally |
| `social.post` | Only when you explicitly ask to tweet — opens X compose in Arc |
| `imessage.send` | AppleScript → Messages.app |
| `code.self_edit` | Hermes gateway or `data/pending-edits/` |

Headless `web.fetch` only if `HERMES_HEADLESS_FETCH=1`.

## Laptop control agent

Intent `laptop_control` (and `browser_task`, plus `personal_ops` when the message mentions an external service) runs `LaptopControlAgent`:

1. Capture screen
2. Infer service URL or use provided link
3. Open in browser
4. Capture screen again
5. Run gated tools when needed (`social.post`, etc.)

# @hermes-os/connectors

**Screen-only** proactive ingest. Third-party services (Gmail, calendar, etc.) are not polled via API—use laptop control (`screen.observe` + `browser.goto`) in the orchestrator.

`GmailConnector` and `CalendarConnector` remain in the package for optional custom wiring but are **not** registered by `ConnectorHub` by default.

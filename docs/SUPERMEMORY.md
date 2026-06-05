# Supermemory

Hermes Personal OS uses **Supermemory** for semantic long-term memory (sleep preferences, shopping constraints, etc.), with **SQLite as backup**.

## Setup (recommended)

1. Create an API key at [app.supermemory.ai](https://app.supermemory.ai) (starts with `sm_`).
2. Add to repo `.env`:

```bash
SUPERMEMORY_API_KEY=sm_your_key_here
# Optional: isolate memories per machine/user
SUPERMEMORY_CONTAINER_TAG=hermes_dhanush
# Optional: project header (same as MCP x-sm-project)
SUPERMEMORY_PROJECT=hermes-personal-os
```

3. Restart `pnpm cli` or `pnpm imessage`.

## How it works

| Action | Behavior |
|--------|----------|
| **Remember** | Writes to SQLite + syncs to Supermemory (`/v3/documents`) |
| **Search / recall** | Supermemory semantic search first, then local keyword search |
| **Research** | Injects recalled preferences into every research turn |
| **Auto-capture** | Phrases like “I'm a side sleeper” are stored as `preferences` |

## Cursor MCP (optional)

For Cursor itself (separate from the CLI runtime), add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "supermemory": {
      "url": "https://mcp.supermemory.ai/mcp",
      "headers": {
        "Authorization": "Bearer sm_your_key_here"
      }
    }
  }
}
```

The Personal OS **runtime does not call MCP** — it uses the REST API directly (same data as the MCP server).

## Verify

```text
remember I am a side sleeper and want a medium-soft pillow
```

Then start research:

```text
research the best pillow and give me links to buy
```

Follow-up:

```text
which one is right for me — send the link
```

The bot should use your stored preference and repeat/refine **https://** links from the research thread.

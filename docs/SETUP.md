# Setup

## 1. Personal OS monorepo

Requirements: Node.js 20+, pnpm 9+.

```bash
cd /path/to/hermes-personal-os
pnpm install
export HERMES_OS_ROOT=$(pwd)
pnpm db:migrate
pnpm build
pnpm test
```

Copy `.env.example` to `.env` and set:

- `DATABASE_PATH=./data/local.sqlite`
- `APPROVAL_TTL_SECONDS=300`
- `HERMES_API_URL` / `HERMES_API_KEY` (after Hermes gateway is running)

Chat UI:

```bash
pnpm start
# open http://127.0.0.1:3847
```

For **Cloudflare Workers AI** (low RAM vs Ollama) with per-task model routing, see [CLOUDFLARE_WORKERS_AI.md](./CLOUDFLARE_WORKERS_AI.md) and run `./scripts/configure-cloudflare.sh`.

For a **fully local, zero API-cost** stack (Ollama + free web search), see [LOCAL_FREE.md](./LOCAL_FREE.md).

## 2. Hermes agent (Python backend)

Hermes installs **outside** this repo at `~/.hermes/hermes-agent/`.

### Install

```bash
./scripts/setup-hermes.sh
source ~/.hermes/hermes-agent/venv/bin/activate
hermes doctor
hermes setup
# or: hermes setup --portal
```

### API server

Ensure `~/.hermes/.env` contains:

```bash
API_SERVER_ENABLED=true
API_SERVER_PORT=8642
API_SERVER_HOST=127.0.0.1
API_SERVER_KEY=<random secret>
```

### Run gateway

```bash
hermes gateway
```

Verify:

```bash
curl http://127.0.0.1:8642/health
curl http://127.0.0.1:8642/v1/capabilities \
  -H "Authorization: Bearer $API_SERVER_KEY"
```

### Optional restricted profile

```bash
hermes profile create personal-os
hermes -p personal-os gateway
```

Use `hermes tools` to disable risky toolsets on the profile Personal OS uses.

### Wire Personal OS

Set in this repo's `.env`:

```bash
HERMES_API_URL=http://127.0.0.1:8642
HERMES_API_KEY=<same as API_SERVER_KEY>
```

## 3. macOS permissions (later phases)

- iMessage bridge: Full Disk Access for `chat.db` (Phase 2)
- Desktop control: Accessibility (Phase 9)

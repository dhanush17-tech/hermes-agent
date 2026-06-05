# What’s next / current capabilities

## Multi-tool + thinking (implemented)

The **AgentPlanner** (`apps/orchestrator/src/agent-planner.ts`) runs a loop (up to 8 steps, `configs/agent-loop.yaml`):

1. **Think** — Cloudflare model returns JSON with `think` + next action  
2. **Act** — one tool call via `ToolExecutor` (policy + approvals)  
3. **Observe** — tool result fed back into the next planning step  
4. **Finish** — `action: "finish"` with a final answer  

Used automatically for:

- **`coding`** — always uses the planner (`code.self_edit`, `filesystem.write`, `tools.author`, …)  
- **`unknown`** — planner when the message looks like a multi-step task  

`LaptopControlAgent` still runs a fixed screen → Arc → login sequence for service UI tasks.

## Write its own tools (implemented)

| Tool | Purpose |
|------|---------|
| `tools.author` | LLM drafts a **macro** (sequence of existing tools), saved under `data/custom-tools/*.macro.json` |
| `tools.define` | You (or the planner) define `custom.*` macros explicitly |
| `tools.run` | Execute a saved macro step-by-step through the approval broker |

Macros only chain **registered** tools — no arbitrary remote code execution.

## Write its own code (implemented)

| Tool | Purpose |
|------|---------|
| `code.self_edit` | Hermes gateway applies edits in the monorepo (approval-gated) |
| `filesystem.write` | Write new files inside the workspace (approval-gated) |

## Suggested next milestones

1. **Playwright browser workbench** — `browser.click` / `browser.submit` (policy stubs exist)  
2. **Gmail/Calendar write tools** — draft/send email, create events (approval-gated)  
3. **Habit learner** — evidence-backed `habits` table updates from conversation patterns  
4. **Vision-guided planner** — pass latest `screen.observe` into each plan step  
5. **GitHub connector** — PRs, unpushed work, failing builds  
6. **People/projects graph** — auto-link from email/calendar to `people` / `projects` nodes  

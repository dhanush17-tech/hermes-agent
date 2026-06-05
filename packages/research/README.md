# @hermes-os/research

Decision-grade research pipeline for Hermes Personal OS.

## Pipeline

```
question → plan → source selection → internal retrieval → web retrieval
  → evidence extraction → conflict detection → synthesis → memory update
```

Internal sources (memory, context graph, local files, email, calendar) are queried before web.

## Usage

```ts
import { ResearchEngine } from "@hermes-os/research";

const engine = new ResearchEngine({ cf, memory, workspaceRoot, contextGraph });
const answer = await engine.run("What is the best implementation plan for DevLabs OS?");
```

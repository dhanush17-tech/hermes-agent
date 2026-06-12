import type { ToolSpec } from "@hermes-os/llm-client";

/**
 * The curated tool set the poke agent sees. These map 1:1 to tools registered
 * in the ToolExecutor registry. We deliberately expose a focused set (not the
 * full registry) so the model picks the right tool instead of drowning in
 * near-duplicates.
 */
export const POKE_TOOLS: ToolSpec[] = [
  // ---- Inbox ----
  {
    name: "gmail.check_inbox",
    description:
      "Read the user's recent Gmail inbox (newest first). Use for 'check my email', 'what's in my inbox', daily briefs.",
    parameters: {
      type: "object",
      properties: {
        maxResults: { type: "number", description: "How many recent messages (default 15)" },
        accountId: { type: "string", description: "Optional account id; omit for default" },
      },
    },
  },
  {
    name: "gmail.search",
    description:
      "Search Gmail with a Gmail query string (e.g. 'from:boss newer_than:7d', 'is:unread'). Returns matching emails.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Gmail search query" },
        maxResults: { type: "number" },
      },
      required: ["query"],
    },
  },
  {
    name: "gmail.summarize_threads",
    description: "Summarize specific Gmail threads by their thread ids.",
    parameters: {
      type: "object",
      properties: { threadIds: { type: "array", items: { type: "string" } } },
      required: ["threadIds"],
    },
  },
  {
    name: "gmail.send_draft",
    description:
      "Send an email. Requires user approval before it actually sends. Use after you've written a draft the user approved.",
    parameters: {
      type: "object",
      properties: {
        to: { type: "string" },
        subject: { type: "string" },
        body: { type: "string" },
        accountId: { type: "string" },
      },
      required: ["to", "subject", "body"],
    },
  },

  // ---- Calendar ----
  {
    name: "calendar.list",
    description:
      "Read upcoming events from the user's Google Calendar (via OAuth). days=1 is today. Use for schedule questions and to forecast what's coming up. Optional accountId selects which connected Google account.",
    parameters: {
      type: "object",
      properties: {
        days: { type: "number", description: "Days ahead, 1-30 (default 1)" },
        accountId: { type: "string", description: "Optional Google account id; omit for default" },
      },
    },
  },

  // ---- Connections (auth to external services) ----
  {
    name: "connection.list",
    description:
      "List which external services can be connected and which accounts are already connected. Use before connection.request to check what's available.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "connection.connect",
    description:
      "Connect one of the user's external accounts (e.g. github, slack, notion, linear). OAuth providers open a browser sign-in; apikey providers take an apiKey. Tell the user to complete the browser approval when prompted.",
    parameters: {
      type: "object",
      properties: {
        provider: { type: "string", description: "Provider id, e.g. github, slack, notion" },
        account: { type: "string", description: "A label for this account (e.g. an email)" },
        apiKey: { type: "string", description: "For apikey providers only" },
      },
      required: ["provider"],
    },
  },
  {
    name: "connection.request",
    description:
      "Make an authenticated API call to a connected service. Use this to read or act on any connected provider (GitHub issues, Slack messages, Notion pages, etc.) without a dedicated tool. url may be a path relative to the provider's API base.",
    parameters: {
      type: "object",
      properties: {
        provider: { type: "string" },
        account: { type: "string", description: "Optional; omit for the default account" },
        method: { type: "string", description: "GET (default), POST, PATCH, DELETE..." },
        url: { type: "string", description: "Absolute URL or path like /user/repos" },
        query: { type: "object", description: "Optional query params" },
        body: { type: "object", description: "Optional JSON body for writes" },
      },
      required: ["provider", "url"],
    },
  },

  // ---- Live web ----
  {
    name: "web.search",
    description:
      "Search the live web. ALWAYS use this for anything time-sensitive or factual you're unsure of: prices, places, hours, parking, weather, news, addresses, links. Never answer such things from memory.",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
  {
    name: "web.fetch",
    description: "Fetch a specific URL and return its readable text. Use to read a page found via web.search.",
    parameters: {
      type: "object",
      properties: { url: { type: "string" } },
      required: ["url"],
    },
  },

  // ---- Memory (knows the user) ----
  {
    name: "memory.remember",
    description:
      "Persist a durable fact, preference, or detail about the user (home address, sleep schedule, dietary needs, relationships, goals). Use whenever the user reveals something worth remembering.",
    parameters: {
      type: "object",
      properties: {
        content: { type: "string" },
        memoryType: { type: "string", description: "e.g. preference, fact, relationship, habit" },
      },
      required: ["content"],
    },
  },
  {
    name: "memory.search",
    description: "Look up what you already know about the user.",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },

  // ---- Computer / desktop ----
  {
    name: "screen.observe",
    description: "Take a screenshot of the user's screen and read what's on it. Use to see what the user is looking at.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "browser.open",
    description: "Open a URL in the user's browser.",
    parameters: {
      type: "object",
      properties: { url: { type: "string" } },
      required: ["url"],
    },
  },
  {
    name: "terminal.run",
    description:
      "Run a shell command on the user's Mac. Destructive commands require approval. Use for real computer tasks the user asks for.",
    parameters: {
      type: "object",
      properties: { command: { type: "string" } },
      required: ["command"],
    },
  },

  // ---- Rides ----
  {
    name: "ride.uber",
    description:
      "Open Uber with pickup + destination prefilled (user confirms in the app). Provide the destination address or 'lat,lng'.",
    parameters: {
      type: "object",
      properties: {
        dropoff: { type: "string", description: "Destination address or 'lat,lng'" },
        pickup: { type: "string", description: "Optional pickup; defaults to current location" },
      },
      required: ["dropoff"],
    },
  },
  {
    name: "ride.lyft",
    description: "Open Lyft with destination prefilled (user confirms in the app).",
    parameters: {
      type: "object",
      properties: {
        dropoff: { type: "string", description: "Destination address or 'lat,lng'" },
        pickup: { type: "string" },
      },
      required: ["dropoff"],
    },
  },

  // ---- Messaging ----
  {
    name: "message_user",
    description:
      "Send a proactive iMessage to the user themselves (a nudge/ping). Use ONLY in proactive/background contexts to get their attention; in a normal reply just answer directly.",
    parameters: {
      type: "object",
      properties: { body: { type: "string" } },
      required: ["body"],
    },
  },

  // ---- Self-edit (extend own capabilities) ----
  {
    name: "filesystem.read",
    description: "Read a file from the Hermes codebase (relative path) so you can edit it.",
    parameters: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
  },
  {
    name: "code.self_edit",
    description:
      "Edit your own source code to add a tool, fix a bug, or change behavior. PREFERRED: edits:[{path, find, replace}] — give the exact existing text to find and what to replace it with (read the file first to copy the text exactly). Use files:[{path, content}] only for brand-new files or full rewrites. Reversible via code.rollback. Always run code.run_tests after.",
    parameters: {
      type: "object",
      properties: {
        instruction: { type: "string", description: "What you're changing and why" },
        edits: {
          type: "array",
          description: "Preferred: surgical find/replace edits to existing files.",
          items: {
            type: "object",
            properties: {
              path: { type: "string" },
              find: { type: "string", description: "Exact existing text to replace" },
              replace: { type: "string", description: "New text" },
              replaceAll: { type: "boolean", description: "Replace every occurrence (default first)" },
            },
            required: ["path", "find", "replace"],
          },
        },
        files: {
          type: "array",
          description: "For new files / full rewrites: complete file contents.",
          items: {
            type: "object",
            properties: { path: { type: "string" }, content: { type: "string" } },
            required: ["path", "content"],
          },
        },
      },
      required: ["instruction"],
    },
  },
  {
    name: "code.run_tests",
    description: "Run the workspace test suite to verify a self-edit didn't break anything.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "code.rollback",
    description: "Undo a self-edit using the checkpointId returned by code.self_edit.",
    parameters: {
      type: "object",
      properties: { checkpointId: { type: "string" } },
      required: ["checkpointId"],
    },
  },
];

export const POKE_TOOL_NAMES = new Set(POKE_TOOLS.map((t) => t.name));

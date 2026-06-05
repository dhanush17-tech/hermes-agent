export type HermesRunEvent =
  | { type: "run.started"; runId: string }
  | { type: "tool.progress"; name: string; detail?: string }
  | { type: "text.delta"; text: string }
  | { type: "run.completed"; output: string }
  | { type: "run.failed"; error: string };

export interface HermesModelProvider {
  chat(input: string, opts?: { sessionKey?: string }): Promise<string>;
  runWithEvents(input: string, opts?: { sessionKey?: string }): AsyncIterable<HermesRunEvent>;
  healthCheck(): Promise<boolean>;
}

export class HermesGatewayClient implements HermesModelProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/health`);
      return res.ok;
    } catch {
      return false;
    }
  }

  async chat(input: string, opts?: { sessionKey?: string }): Promise<string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
    if (opts?.sessionKey) {
      headers["X-Hermes-Session-Key"] = opts.sessionKey;
    }
    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: "hermes-agent",
        messages: [{ role: "user", content: input }],
        stream: false,
      }),
    });
    if (!res.ok) {
      throw new Error(`Hermes chat failed: ${res.status}`);
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content ?? "";
  }

  async *runWithEvents(
    input: string,
    opts?: { sessionKey?: string },
  ): AsyncIterable<HermesRunEvent> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
    if (opts?.sessionKey) {
      headers["X-Hermes-Session-Key"] = opts.sessionKey;
    }
    const createRes = await fetch(`${this.baseUrl}/v1/runs`, {
      method: "POST",
      headers,
      body: JSON.stringify({ input }),
    });
    if (!createRes.ok) {
      yield { type: "run.failed", error: `Failed to create run: ${createRes.status}` };
      return;
    }
    const { run_id: runId } = (await createRes.json()) as { run_id: string };
    yield { type: "run.started", runId };

    const eventsRes = await fetch(`${this.baseUrl}/v1/runs/${runId}/events`, { headers });
    if (!eventsRes.ok || !eventsRes.body) {
      yield { type: "run.failed", error: "Failed to stream run events" };
      return;
    }
    const reader = eventsRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const event = JSON.parse(line.slice(6)) as Record<string, unknown>;
            if (event.type === "tool.start") {
              yield {
                type: "tool.progress",
                name: String(event.name ?? "tool"),
              };
            }
            if (event.type === "text.delta") {
              yield { type: "text.delta", text: String(event.text ?? "") };
            }
          } catch {
            /* ignore parse errors in SSE chunks */
          }
        }
      }
    }
    yield { type: "run.completed", output: "" };
  }
}

export class MockHermesModelProvider implements HermesModelProvider {
  async healthCheck(): Promise<boolean> {
    return true;
  }

  async chat(input: string): Promise<string> {
    return `[mock] Received: ${input.slice(0, 200)}`;
  }

  async *runWithEvents(input: string): AsyncIterable<HermesRunEvent> {
    yield { type: "run.started", runId: "mock_run" };
    yield { type: "text.delta", text: `[mock research] ${input}` };
    yield { type: "run.completed", output: `[mock research] ${input}` };
  }
}

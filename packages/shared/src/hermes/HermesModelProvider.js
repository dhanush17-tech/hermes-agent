export class HermesGatewayClient {
    baseUrl;
    apiKey;
    constructor(baseUrl, apiKey) {
        this.baseUrl = baseUrl;
        this.apiKey = apiKey;
    }
    async healthCheck() {
        try {
            const res = await fetch(`${this.baseUrl}/health`);
            return res.ok;
        }
        catch {
            return false;
        }
    }
    async chat(input, opts) {
        const headers = {
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
        const data = (await res.json());
        return data.choices?.[0]?.message?.content ?? "";
    }
    async *runWithEvents(input, opts) {
        const headers = {
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
        const { run_id: runId } = (await createRes.json());
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
            if (done)
                break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
                if (line.startsWith("data: ")) {
                    try {
                        const event = JSON.parse(line.slice(6));
                        if (event.type === "tool.start") {
                            yield {
                                type: "tool.progress",
                                name: String(event.name ?? "tool"),
                            };
                        }
                        if (event.type === "text.delta") {
                            yield { type: "text.delta", text: String(event.text ?? "") };
                        }
                    }
                    catch {
                        /* ignore parse errors in SSE chunks */
                    }
                }
            }
        }
        yield { type: "run.completed", output: "" };
    }
}
export class MockHermesModelProvider {
    async healthCheck() {
        return true;
    }
    async chat(input) {
        return `[mock] Received: ${input.slice(0, 200)}`;
    }
    async *runWithEvents(input) {
        yield { type: "run.started", runId: "mock_run" };
        yield { type: "text.delta", text: `[mock research] ${input}` };
        yield { type: "run.completed", output: `[mock research] ${input}` };
    }
}
//# sourceMappingURL=HermesModelProvider.js.map
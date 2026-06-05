import { RiskEngine } from "@hermes-os/risk-engine";
export class ChiefOfStaffAgent {
    tasks;
    openLoops;
    sourceItems;
    risksRepo;
    stateRepo;
    policy;
    hub;
    cf;
    contextGraph;
    riskEngine = new RiskEngine();
    constructor(tasks, openLoops, sourceItems, risksRepo, stateRepo, policy, hub, cf, contextGraph = null) {
        this.tasks = tasks;
        this.openLoops = openLoops;
        this.sourceItems = sourceItems;
        this.risksRepo = risksRepo;
        this.stateRepo = stateRepo;
        this.policy = policy;
        this.hub = hub;
        this.cf = cf;
        this.contextGraph = contextGraph;
    }
    async syncContextFromConnectors() {
        if (this.hub) {
            await this.hub.scanAll();
        }
        await this.stateRepo.setLastScanAt(new Date().toISOString());
        if (this.contextGraph) {
            await this.contextGraph.syncFromSources();
        }
        else {
            await this.extractOpenLoopsFromSources();
        }
        const risks = await this.runRiskPrediction();
        return { ingested: 0, risks };
    }
    async runMorningBrief(userMessage = "") {
        await this.syncContextFromSources();
        return this.formatBrief("Morning brief", userMessage, true);
    }
    async runEveningReview(userMessage = "") {
        await this.syncContextFromSources();
        return this.formatBrief("Evening review", userMessage, false);
    }
    /** @deprecated use runMorningBrief */
    async runBrief(userMessage) {
        return this.runMorningBrief(userMessage);
    }
    async syncContextFromSources() {
        if (this.hub)
            await this.hub.scanAll();
        await this.stateRepo.setLastScanAt(new Date().toISOString());
        if (this.contextGraph) {
            await this.contextGraph.syncFromSources();
        }
        else {
            await this.extractOpenLoopsFromSources();
        }
        await this.runRiskPrediction();
    }
    async extractOpenLoopsFromSources() {
        const items = await this.sourceItems.listRecent(30);
        for (const item of items) {
            if (item.sourceType !== "gmail")
                continue;
            const blob = `${item.title ?? ""}\n${item.content ?? ""}`;
            if (!/\b(reply|follow.?up|confirm|waiting|rsvp|logistics|deadline)\b/i.test(blob))
                continue;
            const desc = `Email: ${item.title ?? "follow-up"} — ${(item.content ?? "").split("\n")[0]?.slice(0, 80)}`;
            const existing = await this.openLoops.listOpen(50);
            if (existing.some((l) => l.description === desc))
                continue;
            await this.openLoops.createFromMessage(desc, "email");
        }
    }
    async runRiskPrediction() {
        const [items, loops, taskRows] = await Promise.all([
            this.sourceItems.listRecent(40),
            this.openLoops.listOpen(20),
            this.tasks.listOpen(20),
        ]);
        const detected = await this.riskEngine.detect({
            sourceItems: items,
            openLoops: loops.map((l) => ({
                description: l.description,
                dueDate: l.dueDate ?? null,
                importanceScore: l.importanceScore ?? null,
                status: l.status ?? null,
            })),
            tasks: taskRows.map((t) => ({
                title: t.title,
                dueDate: t.dueDate,
                status: t.status,
            })),
        });
        const keep = new Set();
        for (const r of detected) {
            keep.add(r.description);
            await this.risksRepo.upsertDetected({
                category: r.category,
                description: r.description,
                impact: r.impact,
                urgency: r.urgency,
                confidence: r.confidence,
                score: r.score,
            });
        }
        await this.risksRepo.resolveStale(keep);
        return detected;
    }
    async formatBrief(title, userMessage, morning) {
        const openTasks = await this.tasks.listOpen(10);
        const loops = await this.openLoops.listOpen(10);
        const waiting = this.contextGraph ?
            await this.contextGraph.getWhoIsWaitingOnYou()
            : [];
        const recent = await this.sourceItems.listRecent(30);
        const calendar = recent.filter((i) => i.sourceType === "calendar");
        const gmail = recent.filter((i) => i.sourceType === "gmail");
        const github = recent.filter((i) => i.sourceType === "github");
        const localFiles = recent.filter((i) => i.sourceType === "local_files");
        const risks = await this.runRiskPrediction();
        const riskLines = this.riskEngine.formatForBrief(risks, 5);
        const date = new Date().toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
        });
        const lines = [
            `${title} — ${date}`,
            "",
            morning ? "Top priorities:" : "Still open:",
            ...openTasks.slice(0, 3).map((t, i) => `${i + 1}. [task] ${t.title}${t.dueDate ? ` (due ${t.dueDate})` : ""}`),
            ...loops.slice(0, 3).map((l, i) => `${openTasks.length + i + 1}. [loop] ${l.description.slice(0, 100)}`),
        ];
        if (morning && waiting.length > 0) {
            lines.push("", "People waiting on you:");
            for (const w of waiting.slice(0, 3)) {
                lines.push(`- ${w.person.name}: ${w.reason.slice(0, 80)}`);
            }
        }
        if (morning) {
            lines.push("", "Calendar (next 48h):");
            if (calendar.length === 0) {
                lines.push("- (no events — enable macOS Calendar access or run connector sync)");
            }
            else {
                calendar.slice(0, 5).forEach((e) => lines.push(`- ${e.title} — ${e.content ?? ""}`));
            }
            lines.push("", "Email (Gmail connector):");
            if (gmail.length === 0) {
                lines.push("- (no unread important — set GMAIL_ACCESS_TOKEN for API ingest)");
            }
            else {
                gmail.slice(0, 5).forEach((e) => {
                    lines.push(`- ${e.title}: ${(e.content ?? "").slice(0, 100)}`);
                });
            }
            if (github.length > 0) {
                lines.push("", "GitHub:");
                github.slice(0, 3).forEach((e) => lines.push(`- ${e.title}`));
            }
            if (localFiles.length > 0) {
                lines.push("", "Recent files:");
                localFiles.slice(0, 3).forEach((e) => lines.push(`- ${e.title}`));
            }
        }
        else {
            lines.push("", "Done today: (track manually or via future activity log)");
            lines.push("", "Missed or at-risk:");
        }
        lines.push("", "Risks:");
        if (riskLines.length)
            riskLines.forEach((r) => lines.push(r));
        else
            lines.push("- None above threshold");
        lines.push("", "Prepared actions:", risks[0]?.preparedWork ?? "Say what to draft (reply, checklist, tweet fix).", "", morning ? "Recommended first action:" : "Suggested tomorrow:", risks[0]?.recommendedAction ?? "Pick highest-score risk above.", "", `Notify threshold: ${this.policy.immediate_score_min} | Brief min: ${this.policy.daily_brief_score_min}`);
        if (this.cf && userMessage.trim()) {
            const advice = await this.cf.chat(userMessage, {
                maxTokens: 500,
                classification: "personal_ops",
                system: "Chief of staff. Given brief data, suggest 3 concrete next steps with prepared work. Short iMessage style.",
            });
            lines.push("\n## CoS notes\n", advice);
        }
        if (loops.length === 0 && userMessage.length > 20 && morning) {
            const id = await this.openLoops.createFromMessage(userMessage.slice(0, 500));
            lines.push(`\nCaptured open loop: ${id}`);
        }
        return lines.join("\n");
    }
}
//# sourceMappingURL=chief-of-staff-agent.js.map
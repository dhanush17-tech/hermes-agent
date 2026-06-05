import { RiskEngine } from "@hermes-os/risk-engine";
export class RiskPredictionAgent {
    sourceItems;
    openLoops;
    tasks;
    risksRepo;
    audit;
    engine = new RiskEngine();
    constructor(sourceItems, openLoops, tasks, risksRepo, audit) {
        this.sourceItems = sourceItems;
        this.openLoops = openLoops;
        this.tasks = tasks;
        this.risksRepo = risksRepo;
        this.audit = audit;
    }
    async scanAndPersist() {
        const items = await this.sourceItems.listRecent(40);
        const loops = await this.openLoops.listOpen(20);
        const taskRows = await this.tasks.listOpen(20);
        const risks = await this.engine.detect({
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
        for (const r of risks) {
            keep.add(r.description);
            await this.risksRepo.upsertDetected({
                category: r.category,
                description: r.description,
                impact: r.impact,
                urgency: r.urgency,
                confidence: r.confidence,
                score: r.score,
            });
            await this.audit.log({
                eventType: "risk_detected",
                actor: "system",
                payload: {
                    category: r.category,
                    description: r.description,
                    score: r.score,
                },
            });
        }
        await this.risksRepo.resolveStale(keep);
        return risks;
    }
    formatTopAlerts(risks, limit = 3) {
        return risks
            .filter((r) => r.score >= 40)
            .slice(0, limit)
            .map((r) => this.engine.formatProactiveAlert(r).body);
    }
}
//# sourceMappingURL=risk-prediction-agent.js.map
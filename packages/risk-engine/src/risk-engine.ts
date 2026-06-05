import { runAllDetectors } from "./detectors/index.js";
import type { DetectedRisk, RiskScanInput } from "./types.js";

export type RiskEngineOptions = {
  workspaceRoot?: string;
};

export class RiskEngine {
  constructor(private readonly options: RiskEngineOptions = {}) {}

  async detect(input: RiskScanInput): Promise<DetectedRisk[]> {
    return runAllDetectors(input, { workspaceRoot: this.options.workspaceRoot });
  }

  formatForBrief(risks: DetectedRisk[], limit = 5): string[] {
    return risks.slice(0, limit).map((r, i) => {
      const lines = [
        `${i + 1}. [${r.category}] ${r.description} (score ${r.score})`,
        `   Why: ${r.whyItMatters}`,
        `   Evidence: ${r.evidence.slice(0, 120)}`,
        `   Action: ${r.recommendedAction}`,
      ];
      if (r.preparedWork) lines.push(`   Prepared: ${r.preparedWork}`);
      return lines.join("\n");
    });
  }

  formatProactiveAlert(risk: DetectedRisk): { title: string; body: string; score: number } {
    return {
      score: risk.score,
      title: `[Risk] ${risk.description}`,
      body: [
        risk.whyItMatters,
        "",
        `Evidence: ${risk.evidence.slice(0, 160)}`,
        "",
        `Recommended: ${risk.recommendedAction}`,
        risk.preparedWork ? `\n${risk.preparedWork}` : "",
        "",
        "Reply: show draft | approve | ignore",
      ]
        .filter(Boolean)
        .join("\n")
        .slice(0, 500),
    };
  }

  toNotification(risk: DetectedRisk) {
    const alert = this.formatProactiveAlert(risk);
    return {
      type: "risk" as const,
      title: alert.title,
      body: alert.body,
      priority: risk.score >= 85 ? ("urgent" as const) : risk.score >= 70 ? ("high" as const) : ("medium" as const),
      score: alert.score,
      dedupeKey: `risk:${risk.category}:${risk.sourceId ?? risk.description.slice(0, 40)}`,
    };
  }
}

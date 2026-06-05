export type BrowserActionKind = "click" | "fill" | "submit" | "navigate";

export type BrowserActionDescriptor = {
  kind: BrowserActionKind;
  selector?: string;
  label?: string;
  url?: string;
  value?: string;
};

const RISKY =
  /\b(post|tweet|publish|send|submit|pay|purchase|checkout|confirm|delete|remove|archive|authorize|allow|grant|transfer|withdraw|install|deploy)\b/i;

export type RiskAssessment = {
  risky: boolean;
  riskLevel: "low" | "medium" | "high" | "critical";
  reason: string;
};

export function assessBrowserAction(action: BrowserActionDescriptor): RiskAssessment {
  const blob = `${action.label ?? ""} ${action.selector ?? ""} ${action.value ?? ""} ${action.url ?? ""}`;
  if (RISKY.test(blob)) {
    const isCritical = /\b(pay|purchase|delete|remove|authorize|transfer|withdraw|deploy)\b/i.test(blob);
    return {
      risky: true,
      riskLevel: isCritical ? "critical" : "high",
      reason: `Action matches high-risk pattern: ${blob.slice(0, 120)}`,
    };
  }
  if (action.kind === "submit") {
    return {
      risky: true,
      riskLevel: "high",
      reason: "Form submit requires explicit approval before execution.",
    };
  }
  return { risky: false, riskLevel: "low", reason: "No risky keywords detected." };
}

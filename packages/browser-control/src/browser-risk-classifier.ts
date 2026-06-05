import type { BrowserRiskAssessment, ElementRisk, InteractiveElement } from "./types.js";

const HIGH_RISK_WORDS =
  /\b(send|submit|post|tweet|publish|pay|purchase|checkout|confirm|delete|remove|archive|authorize|allow|grant access|transfer|withdraw|install|deploy)\b/i;

const CRITICAL_WORDS = /\b(delete permanently|confirm delete|pay now|authorize payment|transfer funds)\b/i;

const SENSITIVE_FIELD =
  /\b(password|passwd|otp|2fa|two-factor|verification code|ssn|credit card|cvv|secret)\b/i;

const SENSITIVE_DOMAINS =
  /(?:gmail\.com|mail\.google\.com|x\.com|twitter\.com|linkedin\.com|github\.com\/settings|vercel\.com|cloudflare\.com|console\.aws\.amazon\.com|console\.cloud\.google\.com|stripe\.com|paypal\.com)/i;

const PROMPT_INJECTION =
  /\b(ignore (all )?(previous|prior) instructions|system prompt|you are now|disregard|new instructions)\b/i;

export function classifyElementRisk(
  el: Pick<InteractiveElement, "tag" | "name" | "text" | "ariaLabel" | "placeholder" | "type">,
): ElementRisk {
  const blob = [el.name, el.text, el.ariaLabel, el.placeholder, el.type].filter(Boolean).join(" ");
  if (CRITICAL_WORDS.test(blob) || /\bdelete\b/i.test(blob)) return "critical";
  if (SENSITIVE_FIELD.test(blob)) return "high";
  if (/\bcompose\b/i.test(blob)) return "none";
  if (HIGH_RISK_WORDS.test(blob)) return "high";
  if (el.type === "password") return "high";
  if (el.tag === "textarea" || el.type === "email" || el.type === "search") return "medium";
  return "none";
}

export function classifyBrowserAction(input: {
  action: "click" | "fill" | "press" | "select" | "runScript";
  element?: InteractiveElement | null;
  url: string;
  value?: string;
  key?: string;
  script?: string;
}): BrowserRiskAssessment {
  const url = input.url.toLowerCase();
  const el = input.element;
  const label = el ? [el.name, el.text, el.ariaLabel].filter(Boolean).join(" ") : "";

  if (input.action === "runScript") {
    const code = input.script ?? "";
    if (/\b(localStorage|sessionStorage|cookie|document\.cookie)\b/i.test(code)) {
      return { risk: "critical", reason: "Script may access secrets", requiresApproval: true };
    }
    return { risk: "medium", reason: "Arbitrary script execution", requiresApproval: true };
  }

  if (input.action === "fill") {
    if (SENSITIVE_FIELD.test(`${label} ${input.value ?? ""}`)) {
      return { risk: "high", reason: "Sensitive field — use credential flow", requiresApproval: true };
    }
    if (el?.risk === "medium" || el?.tag === "textarea") {
      return { risk: "medium", reason: "Filling form field", requiresApproval: false };
    }
    return { risk: el?.risk ?? "none", reason: "Fill input", requiresApproval: false };
  }

  if (input.action === "click") {
    const risk = el ? classifyElementRisk(el) : "none";
    const onSensitiveDomain = SENSITIVE_DOMAINS.test(url);
    const submitLike = HIGH_RISK_WORDS.test(label);
    if (risk === "critical") {
      return { risk: "critical", reason: `Critical action: ${label.slice(0, 80)}`, requiresApproval: true };
    }
    if (risk === "high" || (onSensitiveDomain && submitLike)) {
      return { risk: "high", reason: `High-risk click: ${label.slice(0, 80) || "element"}`, requiresApproval: true };
    }
    return { risk, reason: label.slice(0, 80) || "click", requiresApproval: false };
  }

  if (input.action === "press") {
    if (input.key === "Enter" && SENSITIVE_DOMAINS.test(url)) {
      return { risk: "high", reason: "Enter may submit form on sensitive site", requiresApproval: true };
    }
    return { risk: "none", reason: `key ${input.key}`, requiresApproval: false };
  }

  return { risk: "none", reason: input.action, requiresApproval: false };
}

/** Strip page text that looks like prompt injection from agent context. */
export function sanitizePageTextForAgent(text: string): string {
  const lines = text.split("\n");
  return lines
    .filter((line) => !PROMPT_INJECTION.test(line))
    .join("\n")
    .slice(0, 12_000);
}

export class BrowserRiskClassifier {
  classifyElement = classifyElementRisk;
  classifyAction = classifyBrowserAction;
  sanitizePageText = sanitizePageTextForAgent;
}

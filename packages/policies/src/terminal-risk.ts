export type TerminalRisk = "safe" | "destructive" | "high";

const DESTRUCTIVE_PATTERNS: Array<{ pattern: RegExp; risk: TerminalRisk }> = [
  { pattern: /\brm\s+-rf\b/i, risk: "destructive" },
  { pattern: /\bsudo\b/i, risk: "high" },
  { pattern: /\bchmod\s+-R\b/i, risk: "destructive" },
  { pattern: /\bchown\s+-R\b/i, risk: "destructive" },
  { pattern: /curl\s+[^\n|]*\|\s*sh\b/i, risk: "high" },
  { pattern: /\bnpm\s+publish\b/i, risk: "high" },
  { pattern: /\bgit\s+push\b/i, risk: "high" },
  { pattern: /\bgit\s+reset\s+--hard\b/i, risk: "destructive" },
  { pattern: /\bdocker\s+system\s+prune\b/i, risk: "destructive" },
  { pattern: /\bdrop\s+(table|database)\b/i, risk: "destructive" },
  { pattern: /\bdelete\s+from\b/i, risk: "destructive" },
  { pattern: /\bdeploy\b/i, risk: "high" },
  { pattern: /\b(npm|pnpm|yarn)\s+(install|add)\b/i, risk: "high" },
  { pattern: /\b(cat|grep|less)\s+.*\.env\b/i, risk: "high" },
];

export function classifyTerminalCommand(command: string): TerminalRisk {
  const trimmed = command.trim();
  for (const { pattern, risk } of DESTRUCTIVE_PATTERNS) {
    if (pattern.test(trimmed)) {
      return risk;
    }
  }
  return "safe";
}

export function isDestructiveTerminalCommand(command: string): boolean {
  const risk = classifyTerminalCommand(command);
  return risk === "destructive" || risk === "high";
}

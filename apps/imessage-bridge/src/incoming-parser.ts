export type ParsedIncoming = {
  command?: string;
  raw: string;
  topic?: string;
  approvalId?: string;
  criticalExecute?: boolean;
  editInstruction?: string;
};

const COMMAND_PATTERNS: Array<{ re: RegExp; command: string }> = [
  { re: /^\s*status\s*$/i, command: "status" },
  { re: /^\s*pause\s*$/i, command: "pause" },
  { re: /^\s*resume\s*$/i, command: "resume" },
  { re: /^\s*emergency\s+stop\s*$/i, command: "emergency_stop" },
  { re: /^\s*(daily|morning)\s+brief\s*$/i, command: "morning_brief" },
  { re: /^\s*evening\s+review\s*$/i, command: "evening_review" },
  { re: /^\s*show\s+approvals\s*$/i, command: "show_approvals" },
  { re: /^\s*what\s+could\s+go\s+wrong\s+today\??\s*$/i, command: "risks_today" },
  { re: /^\s*research\s+(.+)/is, command: "research" },
];

export function parseIncomingMessage(text: string): ParsedIncoming {
  const raw = text.trim();
  const result: ParsedIncoming = { raw };

  const approveExec = /^\s*approve\s+(\S+)\s+execute\s*$/i.exec(raw);
  if (approveExec) {
    result.command = "approve";
    result.approvalId = approveExec[1];
    result.criticalExecute = true;
    return result;
  }

  const approve = /^\s*approve\s+(\S+)\s*$/i.exec(raw);
  if (approve) {
    result.command = "approve";
    result.approvalId = approve[1];
    return result;
  }

  const deny = /^\s*deny\s+(\S+)\s*$/i.exec(raw);
  if (deny) {
    result.command = "deny";
    result.approvalId = deny[1];
    return result;
  }

  const edit = /^\s*edit\s+(\S+)\s*:\s*(.+)$/is.exec(raw);
  if (edit) {
    result.command = "edit";
    result.approvalId = edit[1];
    result.editInstruction = edit[2]!.trim();
    return result;
  }

  for (const { re, command } of COMMAND_PATTERNS) {
    const m = re.exec(raw);
    if (m) {
      result.command = command;
      if (command === "research" && m[1]) result.topic = m[1].trim();
      return result;
    }
  }

  return result;
}

export function formatParsedForOrchestrator(parsed: ParsedIncoming): string {
  if (parsed.command === "research" && parsed.topic) return `research ${parsed.topic}`;
  if (parsed.command === "approve" && parsed.approvalId) {
    return parsed.criticalExecute ?
        `approve ${parsed.approvalId} execute`
      : `approve ${parsed.approvalId}`;
  }
  if (parsed.command === "deny" && parsed.approvalId) return `deny ${parsed.approvalId}`;
  if (parsed.command === "edit" && parsed.approvalId) {
    return `edit ${parsed.approvalId}: ${parsed.editInstruction ?? ""}`;
  }
  if (parsed.command === "show_approvals") return "show approvals";
  if (parsed.command === "risks_today") return "what could go wrong today";
  if (parsed.command === "morning_brief") return "daily brief";
  if (parsed.command === "evening_review") return "evening review";
  if (parsed.command === "emergency_stop") return "emergency stop";
  return parsed.raw;
}

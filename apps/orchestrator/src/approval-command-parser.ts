import type { IntentEntities } from "@hermes-os/shared";

export type ParsedApprovalCommand = {
  approvalAction: "approve" | "deny" | "edit";
  approvalId: string;
  criticalConfirmed?: boolean;
  editText?: string;
};

/** Casual consent — not a formal approve <id>, but means "yes" to the pending step. */
export function isCasualConsent(text: string): boolean {
  const raw = text.trim();
  if (!raw || raw.length > 80) return false;
  return /^(go ahead|goa ahead|yeah|yes|yep|yup|ok|okay|sure|approve|proceed|continue|try again|try agan)$/i.test(
    raw,
  );
}

/** Deterministic approval replies — do not rely on LLM classifier. */
export function parseApprovalCommand(text: string): ParsedApprovalCommand | null {
  const raw = text.trim();

  if (isCasualConsent(raw)) {
    return { approvalAction: "approve", approvalId: "__latest__" };
  }

  const critical = /^\s*approve\s+(\S+)\s+execute\s*$/i.exec(raw);
  if (critical) {
    return {
      approvalAction: "approve",
      approvalId: critical[1]!,
      criticalConfirmed: true,
    };
  }

  const approve = /^\s*approve\s+(\S+)\s*$/i.exec(raw);
  if (approve) {
    return { approvalAction: "approve", approvalId: approve[1]! };
  }

  const deny = /^\s*deny\s+(\S+)\s*$/i.exec(raw);
  if (deny) {
    return { approvalAction: "deny", approvalId: deny[1]! };
  }

  const edit = /^\s*edit\s+(\S+)\s*:\s*(.+)$/is.exec(raw);
  if (edit) {
    return {
      approvalAction: "edit",
      approvalId: edit[1]!,
      editText: edit[2]!.trim(),
    };
  }

  return null;
}

export function parsedApprovalToEntities(parsed: ParsedApprovalCommand): IntentEntities {
  return {
    approvalAction: parsed.approvalAction,
    approvalId: parsed.approvalId,
    criticalConfirmed: parsed.criticalConfirmed,
    editText: parsed.editText,
  };
}

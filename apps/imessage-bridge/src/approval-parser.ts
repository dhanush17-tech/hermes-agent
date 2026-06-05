export type ApprovalCommand =
  | { type: "approve"; id: string; critical?: boolean }
  | { type: "deny"; id: string }
  | { type: "edit"; id: string; instruction: string };

export function parseApprovalCommand(text: string): ApprovalCommand | null {
  const raw = text.trim();
  const critical = /^\s*approve\s+(\S+)\s+execute\s*$/i.exec(raw);
  if (critical) return { type: "approve", id: critical[1]!, critical: true };

  const approve = /^\s*approve\s+(\S+)\s*$/i.exec(raw);
  if (approve) return { type: "approve", id: approve[1]! };

  const deny = /^\s*deny\s+(\S+)\s*$/i.exec(raw);
  if (deny) return { type: "deny", id: deny[1]! };

  const edit = /^\s*edit\s+(\S+)\s*:\s*(.+)$/is.exec(raw);
  if (edit) return { type: "edit", id: edit[1]!, instruction: edit[2]!.trim() };

  return null;
}

export class BrowserControlError extends Error {
  constructor(
    message: string,
    readonly code:
      | "NO_SESSION"
      | "NO_PAGE"
      | "NO_REF"
      | "PLAYWRIGHT_UNAVAILABLE"
      | "OBSERVE_FAILED"
      | "ACTION_DENIED"
      | "APPROVAL_REQUIRED",
  ) {
    super(message);
    this.name = "BrowserControlError";
  }
}

export function approvalRequiredReason(summary: string): string {
  return `[requiresApproval] ${summary}`;
}

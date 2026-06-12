export type WorkflowMatch = {
  workflowId: string;
  inputs: Record<string, unknown>;
  confidence: number;
  reason: string;
};

export function matchWorkflow(text: string): WorkflowMatch | null {
  const t = text.trim();

  if (/\b(morning\s+brief|daily\s+brief)\b/i.test(t)) {
    return { workflowId: "daily.morning_brief", inputs: {}, confidence: 0.95, reason: "morning brief" };
  }
  if (/\bevening\s+review\b/i.test(t)) {
    return { workflowId: "daily.evening_review", inputs: {}, confidence: 0.95, reason: "evening review" };
  }
  if (/\b(who\s+is\s+waiting\s+on\s+me|open\s+loops?|waiting\s+on\s+me)\b/i.test(t)) {
    return {
      workflowId: "gmail.extract_open_loops",
      inputs: {},
      confidence: 0.9,
      reason: "open loops query",
    };
  }
  if (/\b(unread\s+emails?|read\s+my\s+unread)\b/i.test(t)) {
    return {
      workflowId: "gmail.summarize_unread",
      inputs: {},
      confidence: 0.9,
      reason: "unread email summary",
    };
  }
  if (
    /\b(fill|complete)\b.*\bform\b/i.test(t) &&
    /\b(don't|do not|without)\s+submit\b/i.test(t)
  ) {
    return {
      workflowId: "browser.fill_form_without_submit",
      inputs: { text: t },
      confidence: 0.85,
      reason: "form fill without submit",
    };
  }
  if (/\b(send|ship)\b.*\b(draft|reply|email)\b/i.test(t) || /\bsend\s+the\s+(draft|reply)\b/i.test(t)) {
    return {
      workflowId: "gmail.send_draft",
      inputs: { text: t },
      confidence: 0.9,
      reason: "send gmail draft",
    };
  }
  if (/\bsubmit\b.*\bform\b/i.test(t) || /\bsubmit\s+the\s+form\b/i.test(t)) {
    return {
      workflowId: "browser.submit_form",
      inputs: { text: t },
      confidence: 0.88,
      reason: "form submit",
    };
  }
  if (/\b(fix|resolve|repair)\b.*\b(bug|error|issue|repo|typescript|ts|selector)\b/i.test(t)) {
    return {
      workflowId: "code.propose_and_test_patch",
      inputs: { text: t },
      confidence: 0.75,
      reason: "code fix request",
    };
  }

  const isGmailCheck =
    (/\b(check|read|summarize|scan|review|log\s*on\s*to)\b.*\b(gmail|emails?|inbox|mail)\b/i.test(t) ||
      /\b(check|read|summarize|scan|review)\b.*@[\w.-]+\.\w+/i.test(t) ||
      /\b(gmail|emails?|inbox|mail)\b.*\b(check|read|summarize|unread)\b/i.test(t) ||
      /\blog\s*on\s*to\b.*@[\w.-]+\.\w+/i.test(t)) &&
    !/\b(open|launch|show|use)\b.*\b(browser|arc|playwright)\b/i.test(t);

  if (isGmailCheck) {
    return {
      workflowId: "gmail.check_inbox_with_fallback",
      inputs: { text: t },
      confidence: 0.92,
      reason: "gmail inbox check",
    };
  }

  return null;
}

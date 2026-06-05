import type { DetectedRisk, RiskScanInput } from "../types.js";
import {
  detectDirectQuestionNoReply,
  detectPersonWaitingForReply,
  detectPromisedFollowUp,
  detectUnansweredImportantEmails,
} from "./email-risk-detector.js";
import { detectOverloadedCalendar, detectUpcomingMeetingsWithoutPrep } from "./calendar-risk-detector.js";
import { detectDeadlinePressure, detectGitWorkRisks } from "./work-risk-detector.js";
import {
  detectInconsistentPublicCopy,
  detectWeakOrRiskyPublicCopy,
} from "./reputation-risk-detector.js";

export type RunDetectorsOptions = {
  workspaceRoot?: string;
};

export async function runAllDetectors(
  input: RiskScanInput,
  options: RunDetectorsOptions = {},
): Promise<DetectedRisk[]> {
  const gitRisks =
    options.workspaceRoot ? await detectGitWorkRisks(options.workspaceRoot) : [];

  return [
    ...detectUnansweredImportantEmails(input),
    ...detectPersonWaitingForReply(input),
    ...detectPromisedFollowUp(input),
    ...detectDirectQuestionNoReply(input),
    ...detectUpcomingMeetingsWithoutPrep(input),
    ...detectDeadlinePressure(input),
    ...detectOverloadedCalendar(input),
    ...detectInconsistentPublicCopy(input),
    ...detectWeakOrRiskyPublicCopy(input),
    ...gitRisks,
  ].sort((a, b) => b.score - a.score);
}

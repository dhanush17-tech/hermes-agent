import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { DetectedRisk, RiskScanInput } from "../types.js";
import { buildRisk } from "./shared.js";

const execFileAsync = promisify(execFile);

export function detectDeadlinePressure(input: RiskScanInput): DetectedRisk[] {
  const found: DetectedRisk[] = [];
  const now = Date.now();
  const windowMs = 72 * 60 * 60 * 1000;

  for (const loop of input.openLoops) {
    if (loop.status !== "open" || !loop.dueDate) continue;
    const due = Date.parse(loop.dueDate);
    if (Number.isNaN(due) || due < now || due > now + windowMs) continue;
    const hours = Math.round((due - now) / (60 * 60 * 1000));
    found.push(
      buildRisk({
        category: "work",
        description: `Open loop due within 72h: ${loop.description.slice(0, 120)}`,
        whyItMatters: "Promised follow-ups near deadline are high miss risk.",
        evidence: `Due: ${loop.dueDate} (~${hours}h)`,
        impact: 8,
        urgency: hours < 24 ? 9 : 7,
        confidence: 0.9,
        recommendedAction: "Complete or delegate this loop today.",
      }),
    );
  }

  for (const task of input.tasks) {
    if (task.status !== "open" || !task.dueDate) continue;
    const due = Date.parse(task.dueDate);
    if (Number.isNaN(due) || due < now || due > now + windowMs) continue;
    found.push(
      buildRisk({
        category: "work",
        description: `Task due within 72h: ${task.title}`,
        whyItMatters: "Calendar task may slip without a focus block.",
        evidence: `Due: ${task.dueDate}`,
        impact: 7,
        urgency: 7,
        confidence: 0.85,
        recommendedAction: `Schedule focus time for: ${task.title}`,
      }),
    );
  }
  return found;
}

export async function detectGitWorkRisks(workspaceRoot: string): Promise<DetectedRisk[]> {
  const found: DetectedRisk[] = [];
  try {
    const { stdout: status } = await execFileAsync("git", ["status", "--porcelain"], {
      cwd: workspaceRoot,
      timeout: 5000,
    });
    const dirty = status.trim().split("\n").filter(Boolean);
    if (dirty.length > 20) {
      found.push(
        buildRisk({
          category: "work",
          description: `Large uncommitted change set (${dirty.length} files)`,
          whyItMatters: "Big dirty trees are easy to lose or ship by accident.",
          evidence: dirty.slice(0, 3).join("; "),
          impact: 6,
          urgency: 5,
          confidence: 0.8,
          recommendedAction: "Commit or stash in focused chunks before more agent edits.",
        }),
      );
    }

    const { stdout: branch } = await execFileAsync(
      "git",
      ["rev-parse", "--abbrev-ref", "HEAD"],
      { cwd: workspaceRoot, timeout: 3000 },
    );
    const { stdout: ahead } = await execFileAsync(
      "git",
      ["rev-list", "--count", "@{u}..HEAD"],
      { cwd: workspaceRoot, timeout: 3000 },
    ).catch(() => ({ stdout: "0" }));
    const aheadCount = Number(ahead.trim()) || 0;
    if (aheadCount > 0) {
      found.push(
        buildRisk({
          category: "work",
          description: `Unpushed commits on ${branch.trim()} (${aheadCount} ahead)`,
          whyItMatters: "Local-only work is not backed up or reviewable by teammates.",
          evidence: `${aheadCount} commits not on remote`,
          impact: 5,
          urgency: 4,
          confidence: 0.85,
          recommendedAction: "Push or open a PR when ready.",
        }),
      );
    }
  } catch {
    /* not a git repo or git unavailable */
  }
  return found;
}

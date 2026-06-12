import { z } from "zod";

export const skillStepSchema = z.object({
  tool: z.string().min(1),
  payload: z.unknown().optional(),
  summary: z.string().optional(),
});

export const skillTestCaseSchema = z.object({
  description: z.string(),
  input: z.unknown().optional(),
  expectTools: z.array(z.string()).optional(),
});

export const skillPermissionSchema = z.enum([
  "gmail.read",
  "gmail.write",
  "calendar.read",
  "calendar.write",
  "browser.read",
  "browser.write",
  "filesystem.read",
  "filesystem.write",
  "terminal.safe",
  "terminal.run",
  "memory.read",
  "memory.write",
  "web.fetch",
  "code.edit",
]);

export const skillRiskSchema = z.enum(["read_only", "low", "medium", "high"]);

export const skillStatusSchema = z.enum(["draft", "sandbox", "active", "deprecated"]);

export const skillDefinitionSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  version: z.string().default("1.0.0"),
  permissions: z.array(skillPermissionSchema).default([]),
  risk: skillRiskSchema.default("low"),
  triggerExamples: z.array(z.string()).default([]),
  inputSchema: z.record(z.unknown()).optional(),
  steps: z.array(skillStepSchema).min(1),
  testCases: z.array(skillTestCaseSchema).optional(),
  owner: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  status: skillStatusSchema.default("draft"),
  lastSuccessfulRun: z.string().optional(),
  failureCount: z.number().int().nonnegative().optional(),
  repairScope: z.enum(["skill", "core"]).default("skill"),
  preferred: z.boolean().optional(),
});

export type SkillStep = z.infer<typeof skillStepSchema>;
export type SkillTestCase = z.infer<typeof skillTestCaseSchema>;
export type SkillPermission = z.infer<typeof skillPermissionSchema>;
export type SkillRisk = z.infer<typeof skillRiskSchema>;
export type SkillStatus = z.infer<typeof skillStatusSchema>;
export type SkillDefinition = z.infer<typeof skillDefinitionSchema>;

export type SkillCandidateDraft = {
  name: string;
  description: string;
  triggerExamples: string[];
  steps: Array<{ toolName: string; payload?: unknown; reason?: string }>;
  safetyNotes?: string[];
  status?: string;
  createdAt?: string;
};

export type SkillMatch = {
  skill: SkillDefinition;
  score: number;
  matchedTrigger: string;
};

export type SkillRunRecord = {
  skillName: string;
  startedAt: string;
  finishedAt: string;
  success: boolean;
  stepsCompleted: number;
  error?: string;
};

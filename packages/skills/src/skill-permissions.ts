import type { SkillPermission } from "./types.js";

/** Maps built-in tool names to skill permission classes required to invoke them. */
export const TOOL_PERMISSION_MAP: Record<string, SkillPermission[]> = {
  "memory.remember": ["memory.write"],
  "memory.forget": ["memory.write"],
  "memory.search": ["memory.read"],
  "memory.semantic_search": ["memory.read"],
  "filesystem.read": ["filesystem.read"],
  "filesystem.write": ["filesystem.write"],
  "filesystem.delete": ["filesystem.write"],
  "web.fetch": ["web.fetch"],
  "terminal.run": ["terminal.run"],
  "terminal.run_safe": ["terminal.safe"],
  "terminal.propose_command": ["terminal.safe"],
  "terminal.run_after_approval": ["terminal.run"],
  "gmail.read": ["gmail.read"],
  "gmail.search": ["gmail.read"],
  "gmail.check_inbox": ["gmail.read"],
  "gmail.resolve_access": ["gmail.read"],
  "gmail.browser_check_inbox": ["gmail.read", "browser.read"],
  "gmail.browser_check_all_inboxes": ["gmail.read", "browser.read"],
  "browser.arc_read": ["browser.read"],
  "gmail.summarize_threads": ["gmail.read"],
  "gmail.extract_open_loops": ["gmail.read"],
  "gmail.draft": ["gmail.write"],
  "gmail.send": ["gmail.write"],
  "gmail.send_draft": ["gmail.write"],
  "calendar.read": ["calendar.read"],
  "calendar.create": ["calendar.write"],
  "calendar.update": ["calendar.write"],
  "browser.goto": ["browser.write"],
  "browser.open": ["browser.write"],
  "browser.observe": ["browser.read"],
  "browser.cdp_observe": ["browser.read"],
  "browser.extract": ["browser.read"],
  "browser.fill": ["browser.write"],
  "browser.cdp_fill": ["browser.write"],
  "browser.click": ["browser.write"],
  "browser.cdp_click": ["browser.write"],
  "browser.press": ["browser.write"],
  "browser.submit": ["browser.write"],
  "browser.run_script": ["browser.write"],
  "browser.ai_observe": ["browser.read"],
  "browser.ai_extract": ["browser.read"],
  "browser.ai_act": ["browser.write"],
  "screen.observe": ["browser.read"],
  "desktop.run_command": ["terminal.run"],
  "desktop.open_app": ["browser.write"],
  "desktop.observe_screen": ["browser.read"],
  "desktop.observe_app": ["browser.read"],
  "desktop.act": ["browser.write"],
  "desktop.type": ["browser.write"],
  "desktop.press": ["browser.write"],
  "desktop.click": ["browser.write"],
  "desktop.list_apps": ["browser.read"],
  "code.self_edit": ["code.edit"],
  "code.propose_patch": ["code.edit"],
  "code.apply_patch_after_approval": ["code.edit"],
  "code.run_tests": ["code.edit"],
  "social.post": ["browser.write"],
  "imessage.send": ["browser.write"],
  "skill.run": [],
  "skill.list": [],
  "tools.run": [],
};

export function permissionsForTool(toolName: string): SkillPermission[] {
  if (toolName.startsWith("custom.")) return [];
  return TOOL_PERMISSION_MAP[toolName] ?? [];
}

export function skillAllowsTool(
  skillPermissions: SkillPermission[],
  toolName: string,
): { allowed: boolean; missing?: SkillPermission[] } {
  const required = permissionsForTool(toolName);
  if (required.length === 0) return { allowed: true };
  const missing = required.filter((p) => !skillPermissions.includes(p));
  return missing.length === 0 ? { allowed: true } : { allowed: false, missing };
}

export function inferPermissionsFromSteps(
  steps: Array<{ tool: string }>,
): SkillPermission[] {
  const set = new Set<SkillPermission>();
  for (const step of steps) {
    for (const p of permissionsForTool(step.tool)) {
      set.add(p);
    }
  }
  return [...set];
}

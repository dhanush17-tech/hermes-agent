import type { ServerResponse } from "node:http";
import { RisksRepository } from "@hermes-os/context-graph";
import type { PersonalOsSystem } from "@hermes-os/orchestrator/system";

export async function handleControlApi(
  pathname: string,
  method: string,
  system: PersonalOsSystem,
  risksRepo: RisksRepository,
  res: ServerResponse,
): Promise<boolean> {
  if (method !== "GET") return false;

  res.setHeader("Content-Type", "application/json");

  if (pathname === "/api/approvals") {
    const pending = await system.broker.getPendingApprovals();
    res.end(JSON.stringify({ approvals: pending }));
    return true;
  }

  if (pathname === "/api/risks") {
    const risks = await risksRepo.listActive(30);
    res.end(JSON.stringify({ risks }));
    return true;
  }

  if (pathname === "/api/open-loops") {
    const loops = await system.openLoopsRepo.listOpen(30);
    res.end(JSON.stringify({ openLoops: loops }));
    return true;
  }

  if (pathname === "/api/memories") {
    const memories = await system.memory.search("", 30);
    res.end(JSON.stringify({ memories }));
    return true;
  }

  if (pathname === "/api/people") {
    const people = await system.contextGraph.findPeople("");
    res.end(JSON.stringify({ people: people.slice(0, 30) }));
    return true;
  }

  if (pathname === "/api/projects") {
    const projects = await system.contextGraph.findProjects("");
    res.end(JSON.stringify({ projects: projects.slice(0, 30) }));
    return true;
  }

  if (pathname === "/api/logs") {
    const lines = await system.orchestrator.getActivityLog(50);
    res.end(JSON.stringify({ lines: lines.split("\n") }));
    return true;
  }

  if (pathname === "/api/daemon-health") {
    const port = process.env.HERMES_DAEMON_PORT ?? "3850";
    try {
      const r = await fetch(`http://127.0.0.1:${port}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      res.end(await r.text());
    } catch {
      res.end(JSON.stringify({ status: "unreachable" }));
    }
    return true;
  }

  return false;
}

import { unlink } from "node:fs/promises";

export function isArcRecoverableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /osascript|Arc got an error|-10006|window \d+|Can't get|Can't set|execution error|Hermes Arc window not initialized/i.test(
    msg,
  );
}

type HealState = {
  resetWindow: () => Promise<void>;
  reconcileWindow: () => Promise<number>;
  validateWindow: (index: number) => Promise<number>;
};

let healState: HealState | null = null;

/** Wire arc-workspace hooks to avoid circular imports at module load. */
export function registerArcHealState(state: HealState): void {
  healState = state;
}

export async function healArcWorkspace(): Promise<number> {
  if (!healState) return 1;
  await healState.resetWindow();
  return healState.reconcileWindow();
}

export async function withArcRetry<T>(
  fn: () => Promise<T>,
  options?: { fallback?: () => Promise<T> | T },
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!isArcRecoverableError(err)) throw err;
    await healArcWorkspace();
    try {
      return await fn();
    } catch (retryErr) {
      if (options?.fallback) return await options.fallback();
      throw retryErr;
    }
  }
}

export async function clearArcWorkspaceStateFile(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch {
    /* missing file is fine */
  }
}

/** Thrown / returned when a run is cancelled for user steering. */
export const HERMES_INTERRUPTED = "HERMES_INTERRUPTED";
export function throwIfAborted(signal) {
    if (signal?.aborted) {
        const err = new Error(HERMES_INTERRUPTED);
        err.name = "HermesInterruptedError";
        throw err;
    }
}
//# sourceMappingURL=types.js.map
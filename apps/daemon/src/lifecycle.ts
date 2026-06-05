export type ShutdownHandle = {
  register: (name: string, fn: () => void | Promise<void>) => void;
  shutdown: (signal?: string) => Promise<void>;
};

export function createLifecycle(): ShutdownHandle {
  const hooks: Array<{ name: string; fn: () => void | Promise<void> }> = [];
  let shuttingDown = false;

  const shutdown = async (signal?: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    if (signal) {
      console.log(`Received ${signal}, shutting down...`);
    }
    for (const hook of [...hooks].reverse()) {
      try {
        await hook.fn();
      } catch (err) {
        console.error(`Shutdown hook '${hook.name}' failed:`, err);
      }
    }
  };

  process.on("SIGINT", () => void shutdown("SIGINT").then(() => process.exit(0)));
  process.on("SIGTERM", () => void shutdown("SIGTERM").then(() => process.exit(0)));

  return {
    register(name, fn) {
      hooks.push({ name, fn });
    },
    shutdown,
  };
}

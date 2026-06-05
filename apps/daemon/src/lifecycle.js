export function createLifecycle() {
    const hooks = [];
    let shuttingDown = false;
    const shutdown = async (signal) => {
        if (shuttingDown)
            return;
        shuttingDown = true;
        if (signal) {
            console.log(`Received ${signal}, shutting down...`);
        }
        for (const hook of [...hooks].reverse()) {
            try {
                await hook.fn();
            }
            catch (err) {
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
//# sourceMappingURL=lifecycle.js.map
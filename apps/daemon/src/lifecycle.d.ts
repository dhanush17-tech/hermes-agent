export type ShutdownHandle = {
    register: (name: string, fn: () => void | Promise<void>) => void;
    shutdown: (signal?: string) => Promise<void>;
};
export declare function createLifecycle(): ShutdownHandle;
//# sourceMappingURL=lifecycle.d.ts.map
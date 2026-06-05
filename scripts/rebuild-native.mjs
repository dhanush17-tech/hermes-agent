/**
 * Rebuild native addons (better-sqlite3) for the active Node.js version.
 * pnpm's prebuild can be skipped when a cached binary exists; this forces a compile for the active Node.
 */
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function rebuildPackage(name) {
  const resolvers = [
    join(root, "package.json"),
    join(root, "packages/context-graph/package.json"),
    join(root, "apps/imessage-bridge/package.json"),
  ];

  for (const pkgJson of resolvers) {
    try {
      const require = createRequire(pkgJson);
      const resolved = require.resolve(`${name}/package.json`);
      const dir = dirname(resolved);
      console.log(`[postinstall] rebuilding ${name} for Node ${process.version}…`);
      // Use npm only inside the native package dir (does not re-enter workspace postinstall).
      execSync("npm run build-release", {
        cwd: dir,
        stdio: "inherit",
        env: process.env,
      });
      return;
    } catch {
      /* try next resolver */
    }
  }

  console.warn(`[postinstall] skipped ${name} — not found in workspace`);
}

rebuildPackage("better-sqlite3");

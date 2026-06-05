const major = Number(process.versions.node.split(".")[0]);

if (typeof Promise === "undefined") {
  console.error("\n[hermes] This Node build has no Promise — install Node 20+ from https://nodejs.org or nvm.\n");
  process.exit(1);
}

if (major < 20) {
  console.error(
    `\n[hermes] Node ${process.version} is too old. Hermes requires Node >= 20 (you have ${major}.x).\n` +
      "  nvm install 22 && nvm use 22\n" +
      "  node -v && pnpm install\n",
  );
  process.exit(1);
}

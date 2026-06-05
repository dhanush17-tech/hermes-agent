const agent = process.env.npm_config_user_agent ?? "";
if (!agent.includes("pnpm")) {
  console.error("\nHermes uses pnpm (not npm). Run:\n");
  console.error("  corepack enable");
  console.error("  pnpm install\n");
  process.exit(1);
}

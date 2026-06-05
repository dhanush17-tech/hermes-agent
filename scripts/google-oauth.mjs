#!/usr/bin/env node
/**
 * One-time Google OAuth for Hermes Gmail + Calendar connectors.
 * Saves tokens to ~/.hermes/secrets/google-oauth-tokens.json
 *
 * Usage: node scripts/google-oauth.mjs
 */
import { createServer } from "node:http";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";

const SECRETS_DIR = join(homedir(), ".hermes", "secrets");
const CLIENT_PATH =
  process.env.GOOGLE_OAUTH_CLIENT_PATH ?? join(SECRETS_DIR, "google-oauth-client.json");
const TOKEN_PATH =
  process.env.GOOGLE_OAUTH_TOKEN_PATH ?? join(SECRETS_DIR, "google-oauth-tokens.json");

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

const PORT = Number(process.env.GOOGLE_OAUTH_PORT ?? 8765);

function loadClient() {
  if (!existsSync(CLIENT_PATH)) {
    console.error(`Missing OAuth client file: ${CLIENT_PATH}`);
    process.exit(1);
  }
  const raw = JSON.parse(readFileSync(CLIENT_PATH, "utf8"));
  const cfg = raw.installed ?? raw.web;
  if (!cfg?.client_id || !cfg?.client_secret) {
    console.error("Invalid OAuth client JSON — expected installed or web credentials");
    process.exit(1);
  }
  return cfg;
}

function redirectUri(cfg) {
  const registered = cfg.redirect_uris?.[0];
  if (registered === "http://localhost") {
    return `http://localhost:${PORT}`;
  }
  if (registered?.includes("localhost") || registered?.includes("127.0.0.1")) {
    return registered.replace(/:\d+$/, "") === "http://localhost"
      ? `http://localhost:${PORT}`
      : registered;
  }
  return `http://localhost:${PORT}`;
}

async function exchangeCode(cfg, code, redirect) {
  const body = new URLSearchParams({
    code,
    client_id: cfg.client_id,
    client_secret: cfg.client_secret,
    redirect_uri: redirect,
    grant_type: "authorization_code",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error_description ?? data.error ?? `Token exchange failed (${res.status})`);
  }
  return data;
}

function saveTokens(data) {
  const expiresAt = new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString();
  const tokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    scope: data.scope ?? SCOPES,
    token_type: data.token_type ?? "Bearer",
    expires_at: expiresAt,
    obtained_at: new Date().toISOString(),
  };
  writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2), { mode: 0o600 });
  console.log(`\nTokens saved to ${TOKEN_PATH}`);
  return tokens;
}

function printEnvHint(tokens) {
  console.log("\nAdd to your .env (or rely on auto-load from token file):");
  console.log(`GOOGLE_OAUTH_TOKEN_PATH=${TOKEN_PATH}`);
  console.log(`GOOGLE_OAUTH_CLIENT_PATH=${CLIENT_PATH}`);
  console.log(`GMAIL_ACCESS_TOKEN=${tokens.access_token.slice(0, 20)}...`);
}

async function runBrowserFlow(cfg, redirect) {
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", cfg.client_id);
  authUrl.searchParams.set("redirect_uri", redirect);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", SCOPES);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");

  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
      if (url.pathname !== "/") {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");

      if (error) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(`<h1>Authorization failed</h1><p>${error}</p>`);
        server.close();
        reject(new Error(error));
        return;
      }

      if (!code) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end("<h1>Missing authorization code</h1>");
        return;
      }

      try {
        const tokens = await exchangeCode(cfg, code, redirect);
        saveTokens(tokens);
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          "<h1>Hermes Google OAuth complete</h1><p>You can close this tab and return to the terminal.</p>",
        );
        server.close();
        resolve(tokens);
      } catch (err) {
        res.writeHead(500, { "Content-Type": "text/html" });
        res.end(`<h1>Token exchange failed</h1><pre>${err.message}</pre>`);
        server.close();
        reject(err);
      }
    });

    server.listen(PORT, "127.0.0.1", () => {
      console.log(`Listening on ${redirect}`);
      console.log("\nOpen this URL in your browser:\n");
      console.log(authUrl.toString());
      console.log("");
      try {
        execSync(`open "${authUrl.toString()}"`);
        console.log("(Opened in default browser — sign in and approve access)\n");
      } catch {
        console.log("(Could not auto-open browser — paste URL manually)\n");
      }
    });

    server.on("error", reject);
    setTimeout(() => {
      server.close();
      reject(new Error("OAuth timed out after 5 minutes"));
    }, 5 * 60 * 1000);
  });
}

async function main() {
  const cfg = loadClient();
  const redirect = redirectUri(cfg);

  console.log("Hermes Google OAuth");
  console.log(`Client: ${CLIENT_PATH}`);
  console.log(`Scopes: ${SCOPES}`);
  console.log(`Redirect URI: ${redirect}`);
  console.log(
    "\nIf Google shows 'redirect_uri_mismatch', add this URI in Google Cloud Console:",
  );
  console.log(`  APIs & Services → Credentials → OAuth client → Authorized redirect URIs`);
  console.log(`  → ${redirect}\n`);

  const tokens = await runBrowserFlow(cfg, redirect);
  printEnvHint(tokens);
}

main().catch((err) => {
  console.error("\nOAuth failed:", err.message);
  process.exit(1);
});

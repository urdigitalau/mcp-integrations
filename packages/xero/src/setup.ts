#!/usr/bin/env node
import http from "node:http";
import fs from "node:fs";
import { requireEnv, optionalEnv } from "@urdigital/mcp-server-shared";

/**
 * ONE-TIME setup. Run this manually (npm run setup, or node dist/setup.js)
 * before ever running the actual MCP server. It performs the interactive
 * browser OAuth login Xero requires, then saves the resulting tokens to a
 * local file the server reads on every run.
 *
 * Why this is a separate script rather than something the server does
 * itself: MCP servers are typically headless stdio processes started by
 * an AI client (Claude Desktop, etc.) — there's no good way to pop open a
 * browser window and wait for a login *during* a tool call. So the
 * interactive part happens once, here, and the server itself only ever
 * needs the refresh token this produces.
 */

const clientId = requireEnv("XERO_CLIENT_ID");
const clientSecret = requireEnv("XERO_CLIENT_SECRET");
const port = Number(optionalEnv("XERO_SETUP_PORT") ?? 5000);
const redirectUri = `http://localhost:${port}/callback`;
const tokenPath = optionalEnv("XERO_TOKEN_PATH") ?? "./.xero-tokens.json";

// SCOPES — confirmed current as of this writing (Sept 2026). Xero
// replaced the old broad "accounting.transactions" scope with granular
// ones on March 2, 2026; any app created after that date (which this one
// is) can ONLY use the new names — the old broad names are rejected
// outright with "invalid_scope", which is exactly what an earlier
// version of this script hit. Mapping used here, matched to what this
// server's tools actually need (write access only where we have a write
// tool — currently just invoices):
//   accounting.contacts            - unchanged, contacts list/get (read use here)
//   accounting.invoices            - write-capable (we have a create-invoice tool)
//   accounting.banktransactions.read - read-only (no write tool for these)
//   accounting.settings.read       - read-only (chart of accounts, organisation)
const scopes = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "accounting.contacts",
  "accounting.invoices",
  "accounting.banktransactions.read",
  "accounting.settings.read",
].join(" ");

const authUrl =
  `https://login.xero.com/identity/connect/authorize?response_type=code` +
  `&client_id=${encodeURIComponent(clientId)}` +
  `&redirect_uri=${encodeURIComponent(redirectUri)}` +
  `&scope=${encodeURIComponent(scopes)}` +
  `&state=xero-mcp-setup`;

console.log("\n=== Xero MCP server: one-time setup ===\n");
console.log("Open this URL in your browser and log in to Xero:\n");
console.log(authUrl);
console.log(`\nWaiting for you to complete login (listening on ${redirectUri})...\n`);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${port}`);
  if (url.pathname !== "/callback") {
    res.writeHead(200);
    res.end("Waiting for Xero login to complete...");
    return;
  }

  const code = url.searchParams.get("code");
  const errorParam = url.searchParams.get("error");
  if (errorParam) {
    res.writeHead(400);
    res.end(`Xero returned an error: ${errorParam}`);
    console.error(`Xero returned an error: ${errorParam}`);
    server.close();
    return;
  }
  if (!code) {
    res.writeHead(400);
    res.end("No authorization code received.");
    return;
  }

  try {
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const tokenRes = await fetch("https://identity.xero.com/connect/token", {
      method: "POST",
      headers: { Authorization: `Basic ${basicAuth}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
    });
    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok) {
      throw new Error(`Token exchange failed: ${JSON.stringify(tokenJson)}`);
    }

    const tokens = {
      access_token: tokenJson.access_token as string,
      refresh_token: tokenJson.refresh_token as string,
      expires_at: Date.now() + Number(tokenJson.expires_in) * 1000,
    };
    fs.writeFileSync(tokenPath, JSON.stringify(tokens, null, 2));

    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("<h1>Connected!</h1><p>You can close this tab and return to the terminal.</p>");
    console.log(`Success. Tokens saved to: ${tokenPath}`);
    console.log("You can now run the MCP server normally — it will use this file automatically.");
  } catch (e) {
    res.writeHead(500);
    res.end("Something went wrong — check the terminal for details.");
    console.error(e instanceof Error ? e.message : e);
  } finally {
    server.close();
  }
});

server.listen(port);

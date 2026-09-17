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

// SCOPES — expanded to cover every scope Xero currently offers, per a
// direct request to build full coverage. Confirmed against Xero's own
// official scope reference table (pasted directly from their docs during
// testing), which also revealed the actual bug that caused an earlier
// "Requested wrong apps scopes" error: "app.connections" is explicitly a
// NON-TENANTED scope restricted to the Client Credentials grant type —
// it cannot be requested through this interactive Authorization Code
// flow at all, regardless of which other scopes accompany it. It's
// removed below for exactly that reason. It was never actually needed:
// tenant discovery via GET /connections works fine without it, as proven
// by this server's very first successful setup run.
const scopes = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "accounting.settings",
  "accounting.contacts",
  "accounting.attachments",
  "accounting.budgets.read",
  "accounting.payments",
  "accounting.invoices",
  "accounting.banktransactions",
  "accounting.manualjournals",
  "accounting.reports.aged.read",
  "accounting.reports.balancesheet.read",
  "accounting.reports.banksummary.read",
  "accounting.reports.budgetsummary.read",
  "accounting.reports.executivesummary.read",
  "accounting.reports.profitandloss.read",
  "accounting.reports.trialbalance.read",
  "accounting.reports.taxreports.read",
  "accounting.reports.tenninetynine.read",
  "payroll.employees",
  "payroll.payruns",
  "payroll.payslip",
  "payroll.settings",
  "payroll.timesheets",
  "files",
  "assets",
  "projects",
].join(" ");
// Every scope name above is confirmed valid against Xero's own official
// scope reference table. If any single one is still rejected, it's more
// likely a plan/product-availability issue on this specific organisation
// (e.g. Payroll requires a Payroll-enabled plan, per Xero's developer
// FAQ) than a wrong scope name.

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

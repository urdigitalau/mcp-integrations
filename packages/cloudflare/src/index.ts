#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { CloudflareClient } from "./client.js";

const server = new McpServer({ name: "mcp-server-cloudflare", version: "0.1.0" });
const cloudflare = new CloudflareClient();

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}
function err(e: unknown) {
  const message = e instanceof Error ? e.message : String(e);
  return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
}

server.registerTool(
  "cloudflare_get_traffic_stats",
  {
    title: "Get Cloudflare zone traffic stats",
    description:
      "Get daily traffic stats for the configured Cloudflare zone: requests, cached requests, bandwidth, page views, unique visitors, and threats blocked — one row per day over the given date range.",
    inputSchema: {
      since: z.string().describe("Start date, YYYY-MM-DD (inclusive)"),
      until: z.string().describe("End date, YYYY-MM-DD (inclusive)"),
      limit: z.number().int().min(1).max(100).optional().describe("Max number of daily rows to return, default 30"),
    },
  },
  async ({ since, until, limit }) => {
    try {
      return ok(await cloudflare.getTrafficStats(since, until, limit));
    } catch (e) {
      return err(e);
    }
  }
);

server.registerTool(
  "cloudflare_get_hourly_traffic_stats",
  {
    title: "Get hourly Cloudflare zone traffic stats",
    description:
      "Same metrics as cloudflare_get_traffic_stats but at hourly granularity — use this to pinpoint when within a day something unusual happened (e.g. a threat spike), rather than just which day. IMPORTANT, confirmed by testing: hourly data on this account's plan is only retained for about 3 days 1 hour back from now — requesting older data returns an error like 'cannot request data older than 3d1h'. Use cloudflare_get_traffic_stats (daily granularity) for anything further back.",
    inputSchema: {
      since: z.string().describe("Start datetime, ISO-8601 (e.g. 2026-08-24T00:00:00Z). Must be within roughly the last 3 days."),
      until: z.string().describe("End datetime, ISO-8601. Must be within roughly the last 3 days."),
      limit: z.number().int().min(1).max(200).optional().describe("Max number of hourly rows, default 48"),
    },
  },
  async ({ since, until, limit }) => {
    try {
      return ok(await cloudflare.getHourlyTrafficStats(since, until, limit));
    } catch (e) {
      return err(e);
    }
  }
);

server.registerTool(
  "cloudflare_get_security_events",
  {
    title: "Get Cloudflare security/firewall events",
    description:
      "Get firewall/WAF events grouped by action taken (block, challenge, allow, etc.), client country, and ASN. Use this as a follow-up when cloudflare_get_traffic_stats shows an unusual spike in threats, to see what actually triggered it. NOTE, confirmed by testing: this dataset is not available on all Cloudflare plans (e.g. it returns a 'does not have access to the path' error on Free-tier zones) — a failure here may mean plan restriction, not a bug or bad input.",
    inputSchema: {
      since: z.string().describe("Start datetime, ISO-8601"),
      until: z.string().describe("End datetime, ISO-8601"),
      limit: z.number().int().min(1).max(200).optional().describe("Max number of grouped rows, default 50"),
    },
  },
  async ({ since, until, limit }) => {
    try {
      return ok(await cloudflare.getSecurityEvents(since, until, limit));
    } catch (e) {
      return err(e);
    }
  }
);

server.registerTool(
  "cloudflare_get_traffic_by_country",
  {
    title: "Get Cloudflare traffic by country",
    description: "Get visit counts and bandwidth broken down by client country, sorted by traffic volume. IMPORTANT, confirmed by testing: this dataset's query window is capped at 1 day on this account's plan — a wider since/until range returns an error rather than more data. Call once per day and aggregate client-side if you need a longer trend.",
    inputSchema: {
      since: z.string().describe("Start datetime, ISO-8601. Keep the (since, until) span to 1 day or less."),
      until: z.string().describe("End datetime, ISO-8601. Keep the (since, until) span to 1 day or less."),
      limit: z.number().int().min(1).max(200).optional().describe("Max number of countries to return, default 50"),
    },
  },
  async ({ since, until, limit }) => {
    try {
      return ok(await cloudflare.getTrafficByCountry(since, until, limit));
    } catch (e) {
      return err(e);
    }
  }
);

server.registerTool(
  "cloudflare_get_traffic_by_status_code",
  {
    title: "Get Cloudflare traffic by HTTP status code",
    description: "Get visit counts broken down by HTTP response status code — useful for spotting a spike in 4xx/5xx errors. IMPORTANT, confirmed by testing: this dataset's query window is capped at 1 day on this account's plan — a wider since/until range returns an error rather than more data. Call once per day and aggregate client-side if you need a longer trend.",
    inputSchema: {
      since: z.string().describe("Start datetime, ISO-8601. Keep the (since, until) span to 1 day or less."),
      until: z.string().describe("End datetime, ISO-8601. Keep the (since, until) span to 1 day or less."),
      limit: z.number().int().min(1).max(200).optional().describe("Max number of status codes to return, default 50"),
    },
  },
  async ({ since, until, limit }) => {
    try {
      return ok(await cloudflare.getTrafficByStatusCode(since, until, limit));
    } catch (e) {
      return err(e);
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("mcp-server-cloudflare running on stdio");
}

main().catch((e) => {
  console.error("Fatal error starting mcp-server-cloudflare:", e);
  process.exit(1);
});

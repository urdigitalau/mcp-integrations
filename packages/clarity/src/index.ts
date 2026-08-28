#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ClarityClient } from "./client.js";

const server = new McpServer({ name: "mcp-server-clarity", version: "0.1.0" });
const clarity = new ClarityClient();

const dimensionEnum = z.enum(["Browser", "Device", "Country", "OS", "Source", "Medium", "Campaign", "Channel", "URL"]);

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}
function err(e: unknown) {
  const message = e instanceof Error ? e.message : String(e);
  return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
}

server.registerTool(
     "clarity_get_insights",
     {
       title: "Get Clarity project insights",
       description:
         "Get behavioral analytics for the configured Clarity project: traffic, engagement time, scroll depth, and frustration signals (rage clicks, dead clicks, quickback clicks, script errors). Only the last 1-3 days of data are available, and the project has a small daily request quota, so choose numOfDays and dimensions deliberately per call rather than probing. " +
         "IMPORTANT trade-off, confirmed by testing: calling with NO dimensions returns a broad snapshot (16 categories including Browser/Device/OS/Country/PageTitle/ReferrerUrl/PopularPages breakdowns). Specifying ANY dimension swaps this out entirely for a narrower set of metrics (frustration + engagement + traffic only), broken down by the dimension(s) given instead — you get depth on one axis, not both breadth and depth at once. Use no dimensions for a general health check; use dimensions when you already know which axis (e.g. per-page, per-browser) you want to slice by.",
       inputSchema: {
         numOfDays: z.union([z.literal(1), z.literal(2), z.literal(3)]).describe("1 = last 24h, 2 = last 48h, 3 = last 72h. Any other value returns an HTTP 400 with an empty body — Clarity gives no error detail, so stay within 1-3."),
         dimension1: dimensionEnum.optional().describe("Clarity does NOT validate this server-side — an invalid dimension name is silently ignored and returns the no-dimension default snapshot instead of an error, confirmed by testing. Only use the enum values listed here."),
         dimension2: dimensionEnum.optional(),
         dimension3: dimensionEnum.optional(),
       },
     },
     async (args) => {
       try {
         return ok(await clarity.getProjectInsights(args));
       } catch (e) {
         return err(e);
       }
     }
   );

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("mcp-server-clarity running on stdio");
}

main().catch((e) => {
  console.error("Fatal error starting mcp-server-clarity:", e);
  process.exit(1);
});

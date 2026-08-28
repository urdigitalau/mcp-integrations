#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ClarityClient } from "./client.js";
const server = new McpServer({ name: "mcp-server-clarity", version: "0.1.0" });
const clarity = new ClarityClient();
const dimensionEnum = z.enum(["Browser", "Device", "Country", "OS", "Source", "Medium", "Campaign", "Channel", "URL"]);
function ok(data) {
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}
function err(e) {
    const message = e instanceof Error ? e.message : String(e);
    return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
}
server.registerTool("clarity_get_insights", {
    title: "Get Clarity project insights",
    description: "Get behavioral analytics (traffic, engagement, rage clicks, dead clicks, etc.) for the configured Clarity project, broken down by up to 3 dimensions. Only the last 1-3 days of data are available via this API, and the project has a small daily request quota — batch your dimension choices per call.",
    inputSchema: {
        numOfDays: z.union([z.literal(1), z.literal(2), z.literal(3)]).describe("1 = last 24h, 2 = last 48h, 3 = last 72h"),
        dimension1: dimensionEnum.optional(),
        dimension2: dimensionEnum.optional(),
        dimension3: dimensionEnum.optional(),
    },
}, async (args) => {
    try {
        return ok(await clarity.getProjectInsights(args));
    }
    catch (e) {
        return err(e);
    }
});
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("mcp-server-clarity running on stdio");
}
main().catch((e) => {
    console.error("Fatal error starting mcp-server-clarity:", e);
    process.exit(1);
});

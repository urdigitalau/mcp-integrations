#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { BingWebmasterClient } from "./client.js";
const server = new McpServer({ name: "mcp-server-bing-webmaster", version: "0.1.0" });
const bing = new BingWebmasterClient();
function ok(data) {
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}
function err(e) {
    const message = e instanceof Error ? e.message : String(e);
    return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
}
server.registerTool("bing_list_sites", { title: "List verified Bing Webmaster sites", description: "List all sites verified under this Bing Webmaster account.", inputSchema: {} }, async () => {
    try {
        return ok(await bing.listSites());
    }
    catch (e) {
        return err(e);
    }
});
server.registerTool("bing_get_traffic_stats", {
    title: "Get rank & traffic stats",
    description: "Get impressions, clicks, and rank position stats for a verified site.",
    inputSchema: { siteUrl: z.string().url() },
}, async ({ siteUrl }) => {
    try {
        return ok(await bing.getRankAndTrafficStats(siteUrl));
    }
    catch (e) {
        return err(e);
    }
});
server.registerTool("bing_get_query_stats", {
    title: "Get search query stats",
    description: "Get the queries driving impressions/clicks to a verified site.",
    inputSchema: { siteUrl: z.string().url() },
}, async ({ siteUrl }) => {
    try {
        return ok(await bing.getQueryStats(siteUrl));
    }
    catch (e) {
        return err(e);
    }
});
server.registerTool("bing_get_page_stats", {
    title: "Get per-page stats",
    description: "Get impressions/clicks broken down by page for a verified site.",
    inputSchema: { siteUrl: z.string().url() },
}, async ({ siteUrl }) => {
    try {
        return ok(await bing.getPageStats(siteUrl));
    }
    catch (e) {
        return err(e);
    }
});
server.registerTool("bing_get_crawl_issues", {
    title: "Get crawl issues",
    description: "List crawl errors/issues Bing has found on a verified site.",
    inputSchema: { siteUrl: z.string().url() },
}, async ({ siteUrl }) => {
    try {
        return ok(await bing.getCrawlIssues(siteUrl));
    }
    catch (e) {
        return err(e);
    }
});
server.registerTool("bing_get_url_info", {
    title: "Get URL info",
    description: "Get indexing/crawl info Bing has for a single URL.",
    inputSchema: { siteUrl: z.string().url(), url: z.string().url() },
}, async ({ siteUrl, url }) => {
    try {
        return ok(await bing.getUrlInfo(siteUrl, url));
    }
    catch (e) {
        return err(e);
    }
});
server.registerTool("bing_submit_url", {
    title: "Submit a URL for crawling",
    description: "Ask Bing to crawl/index a specific URL (IndexNow-style single URL submission).",
    inputSchema: { siteUrl: z.string().url(), url: z.string().url() },
}, async ({ siteUrl, url }) => {
    try {
        return ok(await bing.submitUrl(siteUrl, url));
    }
    catch (e) {
        return err(e);
    }
});
server.registerTool("bing_submit_sitemap", {
    title: "Submit a sitemap",
    description: "Register/resubmit a sitemap feed URL for a verified site.",
    inputSchema: { siteUrl: z.string().url(), feedUrl: z.string().url() },
}, async ({ siteUrl, feedUrl }) => {
    try {
        return ok(await bing.submitSitemap(siteUrl, feedUrl));
    }
    catch (e) {
        return err(e);
    }
});
server.registerTool("bing_get_keyword_stats", {
    title: "Get keyword stats",
    description: "Get Bing's search volume/estimate data for a keyword.",
    inputSchema: { query: z.string(), country: z.string().optional(), language: z.string().optional() },
}, async ({ query, country, language }) => {
    try {
        return ok(await bing.getKeywordStats(query, country, language));
    }
    catch (e) {
        return err(e);
    }
});
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("mcp-server-bing-webmaster running on stdio");
}
main().catch((e) => {
    console.error("Fatal error starting mcp-server-bing-webmaster:", e);
    process.exit(1);
});

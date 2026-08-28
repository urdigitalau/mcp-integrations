#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { WordPressClient } from "./client.js";
const server = new McpServer({ name: "mcp-server-wordpress", version: "0.1.0" });
const wp = new WordPressClient();
function ok(data) {
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}
function err(e) {
    const message = e instanceof Error ? e.message : String(e);
    return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
}
server.registerTool("wp_list_posts", {
    title: "List WordPress posts",
    description: "List/search posts on the configured WordPress site, optionally filtered by status.",
    inputSchema: {
        search: z.string().optional().describe("Free-text search term"),
        status: z.string().optional().describe("Comma separated: publish,draft,pending,future"),
        perPage: z.number().int().min(1).max(100).optional(),
        page: z.number().int().min(1).optional(),
    },
}, async (args) => {
    try {
        return ok(await wp.listPosts(args));
    }
    catch (e) {
        return err(e);
    }
});
server.registerTool("wp_get_post", {
    title: "Get a WordPress post",
    description: "Fetch a single post by ID.",
    inputSchema: { id: z.number().int() },
}, async ({ id }) => {
    try {
        return ok(await wp.getPost(id));
    }
    catch (e) {
        return err(e);
    }
});
server.registerTool("wp_create_post", {
    title: "Create a WordPress post",
    description: "Create a new post. Defaults to draft status so nothing publishes unintentionally.",
    inputSchema: {
        title: z.string(),
        content: z.string().describe("Post body. Accepts HTML/Gutenberg block markup."),
        status: z.enum(["draft", "publish", "pending", "future", "private"]).optional(),
        excerpt: z.string().optional(),
        categories: z.array(z.number().int()).optional(),
        tags: z.array(z.number().int()).optional(),
    },
}, async (args) => {
    try {
        return ok(await wp.createPost(args));
    }
    catch (e) {
        return err(e);
    }
});
server.registerTool("wp_update_post", {
    title: "Update a WordPress post",
    description: "Partially update an existing post (e.g. change status to publish, edit content).",
    inputSchema: {
        id: z.number().int(),
        title: z.string().optional(),
        content: z.string().optional(),
        status: z.enum(["draft", "publish", "pending", "future", "private"]).optional(),
        excerpt: z.string().optional(),
    },
}, async ({ id, ...data }) => {
    try {
        return ok(await wp.updatePost(id, data));
    }
    catch (e) {
        return err(e);
    }
});
server.registerTool("wp_delete_post", {
    title: "Delete a WordPress post",
    description: "Move a post to trash, or permanently delete if force=true. Irreversible when force=true.",
    inputSchema: { id: z.number().int(), force: z.boolean().optional() },
}, async ({ id, force }) => {
    try {
        return ok(await wp.deletePost(id, force));
    }
    catch (e) {
        return err(e);
    }
});
server.registerTool("wp_list_pages", {
    title: "List WordPress pages",
    description: "List/search static pages.",
    inputSchema: {
        search: z.string().optional(),
        perPage: z.number().int().min(1).max(100).optional(),
        page: z.number().int().min(1).optional(),
    },
}, async (args) => {
    try {
        return ok(await wp.listPages(args));
    }
    catch (e) {
        return err(e);
    }
});
server.registerTool("wp_upload_media", {
    title: "Upload media to WordPress",
    description: "Fetch a file from a URL and upload it to the WordPress media library.",
    inputSchema: {
        fileUrl: z.string().url().describe("Publicly accessible URL of the file to upload"),
        filename: z.string(),
        altText: z.string().optional(),
    },
}, async ({ fileUrl, filename, altText }) => {
    try {
        return ok(await wp.uploadMedia(fileUrl, filename, altText));
    }
    catch (e) {
        return err(e);
    }
});
server.registerTool("wp_search", {
    title: "Search WordPress content",
    description: "Search across posts, pages, and other public content types.",
    inputSchema: { term: z.string(), type: z.string().optional().describe("post, page, etc.") },
}, async ({ term, type }) => {
    try {
        return ok(await wp.search(term, type));
    }
    catch (e) {
        return err(e);
    }
});
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("mcp-server-wordpress running on stdio");
}
main().catch((e) => {
    console.error("Fatal error starting mcp-server-wordpress:", e);
    process.exit(1);
});

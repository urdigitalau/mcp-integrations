#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { WordPressClient } from "./client.js";

const server = new McpServer({ name: "mcp-server-wordpress", version: "0.1.0" });
const wp = new WordPressClient();

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function err(e: unknown) {
  const message = e instanceof Error ? e.message : String(e);
  return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
}

// ==================== Posts ====================

server.registerTool(
  "wp_list_posts",
  {
    title: "List WordPress posts",
    description: "List/search posts on the configured WordPress site, optionally filtered by status.",
    inputSchema: {
      search: z.string().optional().describe("Free-text search term"),
      status: z.string().optional().describe("Comma separated: publish,draft,pending,future"),
      perPage: z.number().int().min(1).max(100).optional(),
      page: z.number().int().min(1).optional(),
    },
  },
  async (args) => {
    try {
      return ok(await wp.listPosts(args));
    } catch (e) {
      return err(e);
    }
  }
);

server.registerTool(
  "wp_get_post",
  { title: "Get a WordPress post", description: "Fetch a single post by ID.", inputSchema: { id: z.number().int() } },
  async ({ id }) => {
    try {
      return ok(await wp.getPost(id));
    } catch (e) {
      return err(e);
    }
  }
);

server.registerTool(
  "wp_create_post",
  {
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
  },
  async (args) => {
    try {
      return ok(await wp.createPost(args));
    } catch (e) {
      return err(e);
    }
  }
);

server.registerTool(
  "wp_update_post",
  {
    title: "Update a WordPress post",
    description: "Partially update an existing post (e.g. change status to publish, edit content).",
    inputSchema: {
      id: z.number().int(),
      title: z.string().optional(),
      content: z.string().optional(),
      status: z.enum(["draft", "publish", "pending", "future", "private"]).optional(),
      excerpt: z.string().optional(),
    },
  },
  async ({ id, ...data }) => {
    try {
      return ok(await wp.updatePost(id, data));
    } catch (e) {
      return err(e);
    }
  }
);

server.registerTool(
  "wp_delete_post",
  {
    title: "Delete a WordPress post",
    description: "Move a post to trash, or permanently delete if force=true. Irreversible when force=true.",
    inputSchema: { id: z.number().int(), force: z.boolean().optional() },
  },
  async ({ id, force }) => {
    try {
      return ok(await wp.deletePost(id, force));
    } catch (e) {
      return err(e);
    }
  }
);

// ==================== Pages ====================

server.registerTool(
  "wp_list_pages",
  {
    title: "List WordPress pages",
    description: "List/search static pages.",
    inputSchema: { search: z.string().optional(), perPage: z.number().int().min(1).max(100).optional(), page: z.number().int().min(1).optional() },
  },
  async (args) => {
    try {
      return ok(await wp.listPages(args));
    } catch (e) {
      return err(e);
    }
  }
);

server.registerTool(
  "wp_get_page",
  { title: "Get a WordPress page", description: "Fetch a single page by ID.", inputSchema: { id: z.number().int() } },
  async ({ id }) => {
    try {
      return ok(await wp.getPage(id));
    } catch (e) {
      return err(e);
    }
  }
);

server.registerTool(
  "wp_create_page",
  {
    title: "Create a WordPress page",
    description: "Create a new static page. Defaults to draft status so nothing publishes unintentionally.",
    inputSchema: {
      title: z.string(),
      content: z.string(),
      status: z.enum(["draft", "publish", "pending", "future", "private"]).optional(),
      parent: z.number().int().optional().describe("Parent page ID, for nested pages"),
    },
  },
  async (args) => {
    try {
      return ok(await wp.createPage(args));
    } catch (e) {
      return err(e);
    }
  }
);

server.registerTool(
  "wp_update_page",
  {
    title: "Update a WordPress page",
    description: "Partially update an existing page.",
    inputSchema: {
      id: z.number().int(),
      title: z.string().optional(),
      content: z.string().optional(),
      status: z.enum(["draft", "publish", "pending", "future", "private"]).optional(),
      parent: z.number().int().optional(),
    },
  },
  async ({ id, ...data }) => {
    try {
      return ok(await wp.updatePage(id, data));
    } catch (e) {
      return err(e);
    }
  }
);

server.registerTool(
  "wp_delete_page",
  {
    title: "Delete a WordPress page",
    description: "Move a page to trash, or permanently delete if force=true. Irreversible when force=true.",
    inputSchema: { id: z.number().int(), force: z.boolean().optional() },
  },
  async ({ id, force }) => {
    try {
      return ok(await wp.deletePage(id, force));
    } catch (e) {
      return err(e);
    }
  }
);

// ==================== Categories ====================

server.registerTool(
  "wp_list_categories",
  {
    title: "List categories",
    description: "List/search post categories.",
    inputSchema: { search: z.string().optional(), perPage: z.number().int().min(1).max(100).optional(), page: z.number().int().min(1).optional() },
  },
  async (args) => {
    try {
      return ok(await wp.listCategories(args));
    } catch (e) {
      return err(e);
    }
  }
);

server.registerTool(
  "wp_get_category",
  { title: "Get a category", description: "Fetch a single category by ID.", inputSchema: { id: z.number().int() } },
  async ({ id }) => {
    try {
      return ok(await wp.getCategory(id));
    } catch (e) {
      return err(e);
    }
  }
);

server.registerTool(
  "wp_create_category",
  {
    title: "Create a category",
    description: "Create a new post category.",
    inputSchema: { name: z.string(), description: z.string().optional(), parent: z.number().int().optional() },
  },
  async (args) => {
    try {
      return ok(await wp.createCategory(args));
    } catch (e) {
      return err(e);
    }
  }
);

server.registerTool(
  "wp_update_category",
  {
    title: "Update a category",
    description: "Partially update an existing category.",
    inputSchema: { id: z.number().int(), name: z.string().optional(), description: z.string().optional(), parent: z.number().int().optional() },
  },
  async ({ id, ...data }) => {
    try {
      return ok(await wp.updateCategory(id, data));
    } catch (e) {
      return err(e);
    }
  }
);

server.registerTool(
  "wp_delete_category",
  {
    title: "Delete a category",
    description: "Delete a category. Categories have no trash state in WordPress — this is permanent.",
    inputSchema: { id: z.number().int() },
  },
  async ({ id }) => {
    try {
      return ok(await wp.deleteCategory(id));
    } catch (e) {
      return err(e);
    }
  }
);

// ==================== Tags ====================

server.registerTool(
  "wp_list_tags",
  {
    title: "List tags",
    description: "List/search post tags.",
    inputSchema: { search: z.string().optional(), perPage: z.number().int().min(1).max(100).optional(), page: z.number().int().min(1).optional() },
  },
  async (args) => {
    try {
      return ok(await wp.listTags(args));
    } catch (e) {
      return err(e);
    }
  }
);

server.registerTool(
  "wp_get_tag",
  { title: "Get a tag", description: "Fetch a single tag by ID.", inputSchema: { id: z.number().int() } },
  async ({ id }) => {
    try {
      return ok(await wp.getTag(id));
    } catch (e) {
      return err(e);
    }
  }
);

server.registerTool(
  "wp_create_tag",
  { title: "Create a tag", description: "Create a new post tag.", inputSchema: { name: z.string(), description: z.string().optional() } },
  async (args) => {
    try {
      return ok(await wp.createTag(args));
    } catch (e) {
      return err(e);
    }
  }
);

server.registerTool(
  "wp_update_tag",
  {
    title: "Update a tag",
    description: "Partially update an existing tag.",
    inputSchema: { id: z.number().int(), name: z.string().optional(), description: z.string().optional() },
  },
  async ({ id, ...data }) => {
    try {
      return ok(await wp.updateTag(id, data));
    } catch (e) {
      return err(e);
    }
  }
);

server.registerTool(
  "wp_delete_tag",
  {
    title: "Delete a tag",
    description: "Delete a tag. Tags have no trash state in WordPress — this is permanent.",
    inputSchema: { id: z.number().int() },
  },
  async ({ id }) => {
    try {
      return ok(await wp.deleteTag(id));
    } catch (e) {
      return err(e);
    }
  }
);

// ==================== Media ====================

server.registerTool(
  "wp_upload_media",
  {
    title: "Upload media to WordPress",
    description: "Fetch a file from a URL and upload it to the WordPress media library.",
    inputSchema: { fileUrl: z.string().url().describe("Publicly accessible URL of the file to upload"), filename: z.string(), altText: z.string().optional() },
  },
  async ({ fileUrl, filename, altText }) => {
    try {
      return ok(await wp.uploadMedia(fileUrl, filename, altText));
    } catch (e) {
      return err(e);
    }
  }
);

server.registerTool(
  "wp_list_media",
  {
    title: "List media library items",
    description: "List/search existing media library items.",
    inputSchema: { search: z.string().optional(), perPage: z.number().int().min(1).max(100).optional(), page: z.number().int().min(1).optional() },
  },
  async (args) => {
    try {
      return ok(await wp.listMedia(args));
    } catch (e) {
      return err(e);
    }
  }
);

server.registerTool(
  "wp_get_media",
  { title: "Get a media item", description: "Fetch details on a single media library item by ID.", inputSchema: { id: z.number().int() } },
  async ({ id }) => {
    try {
      return ok(await wp.getMedia(id));
    } catch (e) {
      return err(e);
    }
  }
);

server.registerTool(
  "wp_update_media",
  {
    title: "Update a media item",
    description: "Update a media item's title, alt text, or caption.",
    inputSchema: { id: z.number().int(), title: z.string().optional(), altText: z.string().optional(), caption: z.string().optional() },
  },
  async ({ id, ...data }) => {
    try {
      return ok(await wp.updateMedia(id, data));
    } catch (e) {
      return err(e);
    }
  }
);

server.registerTool(
  "wp_delete_media",
  {
    title: "Delete a media item",
    description: "Delete a media library item. Media has no trash state in WordPress — this is permanent.",
    inputSchema: { id: z.number().int() },
  },
  async ({ id }) => {
    try {
      return ok(await wp.deleteMedia(id));
    } catch (e) {
      return err(e);
    }
  }
);

// ==================== Comments ====================

server.registerTool(
  "wp_list_comments",
  {
    title: "List comments",
    description: "List/filter comments, optionally scoped to one post.",
    inputSchema: {
      post: z.number().int().optional(),
      status: z.enum(["approved", "hold", "spam", "trash"]).optional(),
      perPage: z.number().int().min(1).max(100).optional(),
      page: z.number().int().min(1).optional(),
    },
  },
  async (args) => {
    try {
      return ok(await wp.listComments(args));
    } catch (e) {
      return err(e);
    }
  }
);

server.registerTool(
  "wp_get_comment",
  { title: "Get a comment", description: "Fetch a single comment by ID.", inputSchema: { id: z.number().int() } },
  async ({ id }) => {
    try {
      return ok(await wp.getComment(id));
    } catch (e) {
      return err(e);
    }
  }
);

server.registerTool(
  "wp_create_comment",
  {
    title: "Create/reply to a comment",
    description: "Post a new comment on a post, or reply to an existing comment via parent.",
    inputSchema: { post: z.number().int(), content: z.string(), parent: z.number().int().optional() },
  },
  async (args) => {
    try {
      return ok(await wp.createComment(args));
    } catch (e) {
      return err(e);
    }
  }
);

server.registerTool(
  "wp_update_comment",
  {
    title: "Moderate a comment",
    description: "Change a comment's status (approved/hold/spam/trash) or edit its content.",
    inputSchema: { id: z.number().int(), content: z.string().optional(), status: z.enum(["approved", "hold", "spam", "trash"]).optional() },
  },
  async ({ id, ...data }) => {
    try {
      return ok(await wp.updateComment(id, data));
    } catch (e) {
      return err(e);
    }
  }
);

server.registerTool(
  "wp_delete_comment",
  {
    title: "Delete a comment",
    description: "Move a comment to trash, or permanently delete if force=true. Irreversible when force=true.",
    inputSchema: { id: z.number().int(), force: z.boolean().optional() },
  },
  async ({ id, force }) => {
    try {
      return ok(await wp.deleteComment(id, force));
    } catch (e) {
      return err(e);
    }
  }
);

// ==================== Users ====================

server.registerTool(
  "wp_list_users",
  {
    title: "List users",
    description: "List/search site users (authors, editors, admins).",
    inputSchema: { search: z.string().optional(), perPage: z.number().int().min(1).max(100).optional(), page: z.number().int().min(1).optional() },
  },
  async (args) => {
    try {
      return ok(await wp.listUsers(args));
    } catch (e) {
      return err(e);
    }
  }
);

server.registerTool(
  "wp_get_user",
  { title: "Get a user", description: "Fetch a single user by ID.", inputSchema: { id: z.number().int() } },
  async ({ id }) => {
    try {
      return ok(await wp.getUser(id));
    } catch (e) {
      return err(e);
    }
  }
);

// ==================== Discovery ====================

server.registerTool(
  "wp_list_post_types",
  {
    title: "List registered post types",
    description: "List every content type registered on the site — posts, pages, and any custom post types added by a theme or plugin (e.g. ACF). Useful for discovering what content exists beyond standard posts/pages before querying it.",
    inputSchema: {},
  },
  async () => {
    try {
      return ok(await wp.listPostTypes());
    } catch (e) {
      return err(e);
    }
  }
);

server.registerTool(
  "wp_list_taxonomies",
  {
    title: "List registered taxonomies",
    description: "List every taxonomy registered on the site — categories, tags, and any custom taxonomies.",
    inputSchema: {},
  },
  async () => {
    try {
      return ok(await wp.listTaxonomies());
    } catch (e) {
      return err(e);
    }
  }
);

// ==================== Navigation menus ====================

server.registerTool(
  "wp_list_menus",
  {
    title: "List navigation menus",
    description: "List site navigation menus. Requires WordPress 5.9+ with a block theme (full site editing) — may 404 on classic-theme sites even though the rest of the API works.",
    inputSchema: {},
  },
  async () => {
    try {
      return ok(await wp.listMenus());
    } catch (e) {
      return err(e);
    }
  }
);

server.registerTool(
  "wp_list_menu_items",
  {
    title: "List navigation menu items",
    description: "List items within a navigation menu. Same WP 5.9+/block theme requirement as wp_list_menus.",
    inputSchema: { menuId: z.number().int().optional().describe("Restrict to a specific menu ID; omit to list all") },
  },
  async ({ menuId }) => {
    try {
      return ok(await wp.listMenuItems(menuId));
    } catch (e) {
      return err(e);
    }
  }
);

// ==================== Site settings ====================

server.registerTool(
  "wp_get_settings",
  { title: "Get site settings", description: "Get site-wide settings: title, tagline, timezone, and similar.", inputSchema: {} },
  async () => {
    try {
      return ok(await wp.getSettings());
    } catch (e) {
      return err(e);
    }
  }
);

server.registerTool(
  "wp_update_settings",
  {
    title: "Update site settings",
    description: "Update site-wide settings (title, tagline, timezone, etc). Requires admin-level credentials. Only include the fields you want changed.",
    inputSchema: {
      title: z.string().optional(),
      description: z.string().optional(),
      timezone: z.string().optional(),
    },
  },
  async (args) => {
    try {
      return ok(await wp.updateSettings(args));
    } catch (e) {
      return err(e);
    }
  }
);

// ==================== Plugins & themes (read-only) ====================

server.registerTool(
  "wp_list_plugins",
  {
    title: "List installed plugins",
    description: "List installed plugins and whether each is active. Read-only — this server does not support installing, activating, deactivating, or deleting plugins, since those are high-risk actions that can break a site.",
    inputSchema: {},
  },
  async () => {
    try {
      return ok(await wp.listPlugins());
    } catch (e) {
      return err(e);
    }
  }
);

server.registerTool(
  "wp_list_themes",
  {
    title: "List installed themes",
    description: "List installed themes and which is active. Read-only.",
    inputSchema: {},
  },
  async () => {
    try {
      return ok(await wp.listThemes());
    } catch (e) {
      return err(e);
    }
  }
);

// ==================== Search ====================

server.registerTool(
  "wp_search",
  {
    title: "Search WordPress content",
    description: "Search across posts, pages, and other public content types. Returns a lighter object than wp_get_post/wp_get_page (id, title, url, type only) — follow up with wp_get_post/wp_get_page for full content.",
    inputSchema: { term: z.string(), type: z.string().optional().describe("post, page, etc.") },
  },
  async ({ term, type }) => {
    try {
      return ok(await wp.search(term, type));
    } catch (e) {
      return err(e);
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("mcp-server-wordpress running on stdio");
}

main().catch((e) => {
  console.error("Fatal error starting mcp-server-wordpress:", e);
  process.exit(1);
});

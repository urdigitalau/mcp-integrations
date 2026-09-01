# @urdigital/mcp-server-wordpress

An MCP (Model Context Protocol) server exposing the WordPress REST API to
Claude, Claude Code, and any other MCP-compatible client — content, media,
comments, custom post types, and site management.

## Install

No install needed — run directly with `npx`:

```bash
npx -y @urdigital/mcp-server-wordpress
```

## Configure

Create an Application Password under **wp-admin → Users → Profile →
Application Passwords**. This is Basic Auth over HTTPS, separate from your
real account password.

Add to your MCP client config (e.g. Claude Desktop's `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "wordpress": {
      "command": "npx",
      "args": ["-y", "@urdigital/mcp-server-wordpress"],
      "env": {
        "WORDPRESS_SITE_URL": "https://example.com",
        "WORDPRESS_USERNAME": "your-username",
        "WORDPRESS_APP_PASSWORD": "xxxx xxxx xxxx xxxx xxxx xxxx"
      }
    }
  }
}
```

`WORDPRESS_SITE_URL` should have no trailing slash.

## Tools (46 total, all tested against a real headless WordPress site)

| Group | Tools |
|---|---|
| Posts | `wp_list_posts`, `wp_get_post`, `wp_create_post`, `wp_update_post`, `wp_delete_post` |
| Pages | `wp_list_pages`, `wp_get_page`, `wp_create_page`, `wp_update_page`, `wp_delete_page` |
| Categories | `wp_list_categories`, `wp_get_category`, `wp_create_category`, `wp_update_category`, `wp_delete_category` |
| Tags | `wp_list_tags`, `wp_get_tag`, `wp_create_tag`, `wp_update_tag`, `wp_delete_tag` |
| Media | `wp_upload_media`, `wp_list_media`, `wp_get_media`, `wp_update_media`, `wp_delete_media` |
| Comments | `wp_list_comments`, `wp_get_comment`, `wp_create_comment`, `wp_update_comment`, `wp_delete_comment` |
| Users | `wp_list_users`, `wp_get_user` |
| Discovery | `wp_list_post_types`, `wp_list_taxonomies` |
| Menus | `wp_list_menus`, `wp_list_menu_items` |
| Settings | `wp_get_settings`, `wp_update_settings` |
| Plugins/themes | `wp_list_plugins`, `wp_list_themes` (read-only — see below) |
| Custom post types (generic) | `wp_list_custom_items`, `wp_get_custom_item`, `wp_create_custom_item`, `wp_update_custom_item`, `wp_delete_custom_item` |
| Search | `wp_search` |

Posts and pages default new content to `draft` status so nothing publishes
unintentionally.

## Deliberately not included: plugin/theme install, activate, deactivate, delete

Plugin and theme management is limited to read-only listing
(`wp_list_plugins`, `wp_list_themes`). Installing, activating, deactivating,
or deleting plugins/themes are the highest-risk write actions available on
a WordPress site — a bad activation can take a site down entirely — and
are a meaningfully different risk category than content operations. If you
need this, it's a deliberate scope decision, not an oversight.

## Working with custom post types

`wp_list_custom_items`/`wp_get_custom_item`/etc. work with **any** post
type a plugin has registered — you're not limited to the types this server
knows about by name. Two things confirmed by testing against a real site
using Custom Post Type UI + ACF:

- **Use `wp_list_post_types` first to find the correct `rest_base`**, not
  the post type's internal slug — they're often different. On the test
  site, a type with slug `event` had `rest_base: "events"` (pluralized),
  and `lead_magnet` had `rest_base: "lead-magnets"` (pluralized *and*
  hyphenated instead of underscored). Calling the endpoint with the slug
  instead of the rest_base returns a `rest_no_route` 404 — confirmed by
  testing, not a hypothetical.
- Field support (title, content, status, custom fields) varies by how the
  plugin registered the type. `status: draft` as a safe create-default
  worked correctly against a real custom type in testing, since most
  custom post types are still stored in `wp_posts` like standard posts —
  but this isn't guaranteed universal across every plugin.

## Other behavior confirmed by testing, worth knowing

- **Categories, tags, and media have no trash state in WordPress.**
  Deleting any of these is effectively always permanent — unlike posts,
  pages, and comments, which default to a reversible trash. The `force`
  parameter on delete tools for categories/tags/media defaults to `true`
  for this reason; posts/pages/comments default to `false`.
- **WordPress blocks comments on draft posts.** Attempting
  `wp_create_comment` against a draft-status post returns a 403
  (`rest_comment_draft_post`) — the post needs to be published (or at
  least not in draft) first. Confirmed directly.
- **Comments created by an authenticated admin skip moderation** and come
  back with `status: "approved"` immediately, rather than the `hold`
  status a real anonymous visitor's comment would likely get. If you're
  testing a moderation workflow, testing as admin can hide behavior that
  only shows up for genuine visitor-submitted comments.
- **The `wp_search` endpoint returns a much lighter object** than
  `wp_get_post`/`wp_get_page` — just `id`, `title`, `url`, `type`,
  `subtype`, no content or metadata. Follow up with `wp_get_post`/
  `wp_get_page`/`wp_get_custom_item` for full content.
- **`wp_get_user`'s `roles` field can come back `undefined`** even for an
  admin account, depending on site/plugin configuration around the
  `edit_users` capability — not necessarily a bug if you see this.
- **`wp_upload_media` validates URLs before fetching them.** A code review
  flagged that the original implementation would fetch *any* URL it was
  given with no validation — including internal addresses, localhost, and
  cloud metadata endpoints (`169.254.169.254`), which could expose
  internal services or cloud credentials to whatever's reading the tool's
  output. This is fixed: only `https://` URLs resolving to public,
  non-reserved addresses are allowed, and the downloaded file is capped at
  25MB, enforced by counting real streamed bytes rather than trusting a
  `Content-Length` header. See `@urdigital/mcp-server-shared`'s README for
  the full detail and a stated limitation (DNS rebinding) that isn't fully
  closed by this fix.
- **Media URLs may not live on your WordPress domain at all.** Sites using
  an offload plugin (e.g. to Cloudflare Images, S3, etc.) will return
  `source_url` pointing elsewhere entirely — confirmed on the test site,
  which offloads to `imagedelivery.net`.

## License

MIT

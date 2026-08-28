# mcp-integrations

Open-source MCP (Model Context Protocol) servers for the marketing/web-ops
toolbox: **WordPress**, **Bing Webmaster Tools**, and **Microsoft Clarity**
today, with **Shopify**, **Squarespace**, and **Cloudflare Analytics**
planned next.

## Why one repo, separate servers

Each integration ships as its **own installable MCP server** (its own npm
package, its own `bin` entry, its own credentials) so people can install only
what they need — someone using Squarespace shouldn't have to configure
WordPress credentials to get Cloudflare analytics working. But they all live
in **one pnpm monorepo** and share a `@mcp-integrations/shared` package for
HTTP retry/backoff logic and env-var handling, so adding the 4th, 5th, 6th
integration is mostly "copy a package, swap the client and tool list" instead
of re-solving auth/HTTP plumbing each time. This is the same pattern the
official `modelcontextprotocol/servers` repo and most multi-integration MCP
projects use.

```
mcp-integrations/
├── packages/
│   ├── shared/            # HTTP client w/ retry, env helpers — no tools of its own
│   ├── wordpress/         # mcp-server-wordpress
│   ├── bing-webmaster/    # mcp-server-bing-webmaster
│   └── clarity/           # mcp-server-clarity
│       # future: shopify/, squarespace/, cloudflare-analytics/
├── pnpm-workspace.yaml
└── package.json
```

## Stack

- **TypeScript** + **@modelcontextprotocol/sdk** (the official SDK; most
  examples and community servers target this today — the SDK also has a v2
  line, `@modelcontextprotocol/server`, aligned to the 2026-07-28 spec draft,
  which you can migrate to later without changing the tool/architecture
  design here).
- **zod** for input validation on every tool.
- **stdio transport** by default (what Claude Desktop, Claude Code, and most
  MCP clients expect for local servers). Swapping to Streamable HTTP for a
  remote/hosted deployment is a transport-layer change only — the tool
  definitions don't need to move.
- **pnpm workspaces** for the monorepo.

## Setup

```bash
pnpm install
cp .env.example .env   # fill in the credentials you have
pnpm --filter @mcp-integrations/wordpress dev       # run one server directly, for testing
```

Each server also builds independently for distribution:

```bash
pnpm --filter @mcp-integrations/wordpress build
node packages/wordpress/dist/index.js
```

### Credentials

| Service | Auth | Where to get it |
|---|---|---|
| WordPress | Application Password (Basic Auth) | wp-admin → Users → Profile → Application Passwords |
| Bing Webmaster Tools | API key | bing.com/webmasters → Settings → API Access |
| Microsoft Clarity | Bearer token, scoped per project | Clarity project → Settings → Data Export |

None of these are OAuth flows, so there's no redirect/callback server needed
— just static tokens read from environment variables at startup. Tools never
accept secrets as arguments.

### Connecting to Claude Desktop / Claude Code

Add to your MCP client config (e.g. `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "wordpress": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-integrations/packages/wordpress/dist/index.js"],
      "env": {
        "WORDPRESS_SITE_URL": "https://example.com",
        "WORDPRESS_USERNAME": "your-username",
        "WORDPRESS_APP_PASSWORD": "xxxx xxxx xxxx xxxx xxxx xxxx"
      }
    },
    "bing-webmaster": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-integrations/packages/bing-webmaster/dist/index.js"],
      "env": { "BING_WEBMASTER_API_KEY": "..." }
    },
    "clarity": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-integrations/packages/clarity/dist/index.js"],
      "env": { "CLARITY_API_TOKEN": "..." }
    }
  }
}
```

## What's implemented

**WordPress** (`packages/wordpress`) — 46 tools covering posts, pages,
categories, tags, media, comments, users, generic custom post types,
settings, and read-only plugin/theme visibility. All tested against a real
headless WordPress site — see the package's own README for the full tool
table and testing notes, including a real gotcha around custom post type
REST bases differing from their slugs, and which content types (posts,
pages, comments) support reversible trash vs. which (categories, tags,
media) don't. Plugin/theme install/activate/deactivate/delete are
deliberately not included — read-only listing only.

**Bing Webmaster Tools** (`packages/bing-webmaster`) — `bing_list_sites`,
`bing_get_traffic_stats`, `bing_get_query_stats`, `bing_get_page_stats`,
`bing_get_crawl_issues`, `bing_get_url_info`, `bing_submit_url`,
`bing_submit_sitemap`, `bing_get_keyword_stats`, `bing_get_query_traffic_stats`,
`bing_get_url_traffic_info`, `bing_get_children_url_traffic_info`. Built
against the **JSON/HTTP REST API only** — Microsoft is retiring the legacy
SOAP/POX endpoints on **August 31, 2026**, and the REST surface has full
functional parity, so there's no reason to build against the deprecated one.
All 12 tools have been tested against a real, multi-site Bing Webmaster
account — see the package's own README for testing notes.

**Microsoft Clarity** (`packages/clarity`) — `clarity_get_insights`.
Clarity's Data Export API is intentionally narrow: one endpoint, max 3 days
of history, up to 3 breakdown dimensions, and a small daily request quota per
project. Tested directly against a real project: calling with no dimensions
returns a broad 16-category snapshot (traffic, engagement, frustration
signals, browser/device/country/page breakdowns); specifying any dimension
swaps that out entirely for a narrower metric set cross-tabulated by the
dimension(s) given — it's a trade-off between breadth and depth, not
additive. Also confirmed: an out-of-range `numOfDays` returns a hard 400
with no error detail, but an invalid dimension name is silently ignored and
falls back to the default snapshot with HTTP 200 — Clarity does no
server-side validation on dimension names at all, so the tool's own Zod
enum is the only real safeguard against a silently wrong result.

## Known API constraints worth knowing before you build on this

- **Clarity**: only the last 1–3 days of data are retrievable at all through
  this API (not a limitation of this code) — if you need historical trends,
  you need to poll daily and store results yourself.
- **Bing**: some `GetKeywordStats`/regional parameters are undocumented edge
  cases in Microsoft's own API — expect to iterate here as you exercise it
  against a real account.
- **WordPress**: the REST API's update semantics use `POST` for partial
  updates (there's no real `PATCH`), which is preserved as-is in the client.

## Roadmap

- [ ] Shopify (products, orders, inventory)
- [ ] Squarespace
- [ ] Cloudflare Analytics
- [ ] OAuth support for Bing (currently API-key only)
- [ ] Optional Streamable HTTP transport for hosted/remote deployment
- [ ] Shared integration-test harness against recorded fixtures

## Contributing

Adding a new integration:

1. `cp -r packages/clarity packages/your-service` as a starting skeleton.
2. Replace `client.ts` with calls to the new API; keep using
   `apiRequest`/`requireEnv` from `@mcp-integrations/shared`.
3. Register tools in `index.ts` — mirror existing naming (`service_verb_noun`).
4. Document required env vars in `.env.example` and the table above.
5. Default any write/publish/delete action to the safest possible state
   (see `wp_create_post` defaulting to `draft`) and say so in the tool
   description, so a calling model doesn't take an irreversible action by
   default.

PRs welcome — this is meant to grow into a small ecosystem of these, not stay
a three-service repo.

## License

MIT — see [LICENSE](./LICENSE).

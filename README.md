# mcp-integrations

Open-source MCP (Model Context Protocol) servers for the marketing/web-ops
toolbox: **WordPress**, **Bing Webmaster Tools**, **Microsoft Clarity**,
**Cloudflare Analytics**, and **Xero** today, with **Shopify** and
**Squarespace** planned next.

## Why one repo, separate servers

Each integration ships as its **own installable MCP server** (its own npm
package, its own `bin` entry, its own credentials) so people can install only
what they need — someone using Squarespace shouldn't have to configure
WordPress credentials to get Cloudflare analytics working. But they all live
in **one pnpm monorepo** and share an `@urdigital/mcp-server-shared`
package for HTTP retry/backoff logic and env-var handling, so adding the
6th, 7th, 8th integration is mostly "copy a package, swap the client and
tool list" instead of re-solving auth/HTTP plumbing each time. This is the
same pattern the official `modelcontextprotocol/servers` repo and most
multi-integration MCP projects use.

```
mcp-integrations/
├── packages/
│   ├── shared/            # HTTP client w/ retry, env helpers, SSRF guard — no tools of its own
│   ├── wordpress/         # mcp-server-wordpress (46 tools)
│   ├── bing-webmaster/    # mcp-server-bing-webmaster (12 tools)
│   ├── clarity/           # mcp-server-clarity (1 tool)
│   ├── cloudflare/        # mcp-server-cloudflare (5 tools)
│   └── xero/              # mcp-server-xero (41 tools)
│       # future: shopify/, squarespace/
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
pnpm --filter @urdigital/mcp-server-wordpress dev   # run one server directly, for testing
```

Each server also builds independently for distribution:

```bash
pnpm --filter @urdigital/mcp-server-wordpress build
node packages/wordpress/dist/index.js
```

### Credentials

| Service | Auth | Where to get it |
|---|---|---|
| WordPress | Application Password (Basic Auth) | wp-admin → Users → Profile → Application Passwords |
| Bing Webmaster Tools | API key | bing.com/webmasters → Settings → API Access |
| Microsoft Clarity | Bearer token, scoped per project | Clarity project → Settings → Data Export |
| Cloudflare Analytics | API token, scoped to Zone → Analytics → Read | dash.cloudflare.com → My Profile → API Tokens |
| Xero | Full OAuth 2.0 (not Custom Connections) — see `packages/xero/README.md` for the required one-time setup step | developer.xero.com → My Apps |

Four of these five are static tokens read from environment variables at
startup — no redirect/callback server, no browser interaction, and tools
never accept secrets as arguments. **Xero is the one exception**: Custom
Connections (Xero's simpler, token-like option) weren't available on the
plan this was built against, so it needs full interactive OAuth — a
one-time browser login via a separate setup script (not part of the MCP
server itself), after which the server runs credential-free the same way
the others do, reading a locally-persisted, auto-rotating token file
instead of a static secret. See that package's README for why this is
architecturally different from everything else here, not just a longer
setup step. Cloudflare also needs one extra piece beyond its token — a
Zone ID (found on the zone's Overview page in the Cloudflare dashboard),
since one token can be scoped to multiple zones.

### Connecting to Claude Desktop / Claude Code

All servers are published to npm — `npx` is the simplest way to run
them, no local build or path required:

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
    },
    "bing-webmaster": {
      "command": "npx",
      "args": ["-y", "@urdigital/mcp-server-bing-webmaster"],
      "env": { "BING_WEBMASTER_API_KEY": "..." }
    },
    "clarity": {
      "command": "npx",
      "args": ["-y", "@urdigital/mcp-server-clarity"],
      "env": { "CLARITY_API_TOKEN": "..." }
    },
    "cloudflare": {
      "command": "npx",
      "args": ["-y", "@urdigital/mcp-server-cloudflare"],
      "env": {
        "CLOUDFLARE_API_TOKEN": "...",
        "CLOUDFLARE_ZONE_ID": "..."
      }
    },
    "xero": {
      "command": "npx",
      "args": ["-y", "@urdigital/mcp-server-xero"],
      "env": {
        "XERO_CLIENT_ID": "...",
        "XERO_CLIENT_SECRET": "...",
        "XERO_TOKEN_PATH": "/absolute/path/to/.xero-tokens.json"
      }
    }
  }
}
```

Xero's `XERO_TOKEN_PATH` needs a real, stable, absolute path — you must
run that package's one-time setup step first to create the file (`npx`
alone won't do it) — see `packages/xero/README.md`. An absolute path
matters more here than it would for a plain env var, since `npx` runs from
a location you don't control, and the server needs to find (and keep
rewriting) the same file on every run, not wherever the process happens to
start from.

If you're working from a local clone instead (e.g. for development), point
`command` at `node` and `args` at the built
`packages/<name>/dist/index.js` path instead — see each package's own
README for that variant.

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

**Cloudflare** (`packages/cloudflare`) — `cloudflare_get_traffic_stats`,
`cloudflare_get_hourly_traffic_stats`, `cloudflare_get_traffic_by_country`,
`cloudflare_get_traffic_by_status_code`, `cloudflare_get_security_events`.
Talks to Cloudflare's GraphQL Analytics API (not REST) for a single zone.
Tested against a real production zone and found three separate real plan
limits worth knowing before you build on this: the country/status-code
breakdown dataset rejects any query window over 1 day; hourly-granularity
data is only retained ~3 days back; and the security-events dataset isn't
available on all plans (Free tier included) — see the package's own README
for the exact error text each of these returns. Also worth knowing:
GraphQL APIs can return HTTP 200 with a failure baked into an `errors`
array in the body — this client checks for that explicitly, since a plain
status-code check (as used by the REST-based servers in this repo) would
silently treat a failed GraphQL query as a success.

**Xero** (`packages/xero`) — 41 tools spanning the core Accounting API
(contacts, invoices, bank transactions, chart of accounts), Reports
(P&L, balance sheet, trial balance, aged receivables/payables, and more),
Payments, Manual Journals, Budgets, Attachments, Payroll AU, Files,
Assets, and Projects. Unlike every other server here, this one requires a
one-time interactive OAuth login and persists a rotating refresh token to
a local file (`.xero-tokens.json`) — Xero invalidates and reissues the
refresh token on every use, so this is genuinely required, not a design
choice; see the package's own README for the full setup process and why
this file must never be committed. `xero_create_invoice` and
`xero_create_manual_journal` default to `DRAFT` status, same "don't
finalize by accident" pattern as `wp_create_post`. Payroll/Assets/Files
are deliberately read-only — no obvious safe default exists for actions
like posting a pay run, unlike a draft invoice. Nearly every tool has been
tested against a real, live organisation; see the package's own README for
two real findings worth knowing: BAS/GST reports use a completely
different "published snapshot" mechanism than every other report (an
initial guess at a direct endpoint returned a genuine 404), and a scope
named `app.connections` looked necessary but is actually restricted to a
different OAuth grant type entirely — including it broke authorization
outright with no useful error until the exact cause was tracked down.

## Known API constraints worth knowing before you build on this

- **Clarity**: only the last 1–3 days of data are retrievable at all through
  this API (not a limitation of this code) — if you need historical trends,
  you need to poll daily and store results yourself.
- **Bing**: some `GetKeywordStats`/regional parameters are undocumented edge
  cases in Microsoft's own API — expect to iterate here as you exercise it
  against a real account.
- **WordPress**: the REST API's update semantics use `POST` for partial
  updates (there's no real `PATCH`), which is preserved as-is in the client.
- **Cloudflare**: several GraphQL datasets have plan-tier-dependent limits
  (query window size, data retention, dataset availability) that surface as
  runtime errors rather than anything discoverable in advance — see the
  package's own README for the specific limits found during testing.
- **Xero**: refresh tokens are rotated (invalidated and reissued) on every
  use — the token file persisted to disk isn't a convenience cache, it's
  the only place the currently-valid refresh token exists after the first
  refresh happens. Also, OAuth scope names changed as of March 2, 2026
  (old broad scopes are rejected outright for any newly-created app) — see
  the package's own README for the current scope list this server uses.

## Roadmap

- [ ] Shopify (products, orders, inventory)
- [ ] Squarespace
- [ ] Cloudflare: DNS management, cache purge (analytics done; broader scope deferred by design)
- [ ] OAuth support for Bing (currently API-key only)
- [ ] Optional Streamable HTTP transport for hosted/remote deployment
- [ ] Shared integration-test harness against recorded fixtures

## Security

This is a young project, and two real issues have already been found and
fixed via code review rather than caught before shipping — worth being
upfront about both rather than pretending the code was clean from the
start:

1. **API keys leaking into error messages** (fixed in `shared` v0.1.2 /
   `bing-webmaster` v0.1.3 / others v0.1.1). Bing's API takes its key as a
   query-string parameter rather than a header; an early version of the
   shared HTTP client included the full request URL — key included — in
   any error message, which then flowed into whatever was reading the
   tool's output (an AI model's response, chat transcripts, logs). Fixed
   by stripping the query string from error messages entirely.
2. **SSRF in `wp_upload_media`** (fixed in `wordpress` v0.1.1). The
   original implementation fetched any URL it was given with no
   validation — including internal network addresses, localhost, and
   cloud metadata endpoints (`169.254.169.254`, which exposes instance
   credentials on many cloud VMs). Fixed with a shared SSRF guard
   (`@urdigital/mcp-server-shared`'s `assertSafePublicHttpsUrl`) that
   restricts fetches to `https://` URLs resolving to public addresses,
   plus a streamed byte-size cap.

**If you're adding a new integration that fetches a caller-supplied URL,
use `assertSafePublicHttpsUrl`/`fetchWithSizeLimit` from the shared
package — don't fetch a caller-given URL directly.** See that package's
README for the full detail, including a stated limitation (DNS rebinding)
that isn't fully closed by the current fix.

**If your integration needs to persist any credential to a local file**
(Xero's rotating refresh token is the only current example), confirm it's
covered by `.gitignore` *before* the file is ever created, not after — see
`packages/xero/README.md`'s Security section for the checklist this
project used.

If you find a security issue in this repo, please open a GitHub issue (or,
for anything you'd rather not post publicly, contact the maintainer
directly) rather than assuming existing code has been vetted for this class
of problem — as the fixes above show, it's still actively catching up.

## Contributing

Adding a new integration:

1. `cp -r packages/clarity packages/your-service` as a starting skeleton.
2. Replace `client.ts` with calls to the new API; keep using
   `apiRequest`/`requireEnv` from `@urdigital/mcp-server-shared`.
3. Register tools in `index.ts` — mirror existing naming (`service_verb_noun`).
4. Document required env vars in `.env.example` and the table above.
5. Default any write/publish/delete action to the safest possible state
   (see `wp_create_post` defaulting to `draft`) and say so in the tool
   description, so a calling model doesn't take an irreversible action by
   default.
6. If the API needs full OAuth rather than a static token (see Xero), plan
   for a separate one-time setup step rather than trying to do interactive
   login inside the MCP server itself — see `packages/xero/setup.ts`.

PRs welcome — this is meant to keep growing into a small ecosystem of
these, not stay a five-service repo.

## License

MIT — see [LICENSE](./LICENSE).

# @urdigital/mcp-server-cloudflare

An MCP (Model Context Protocol) server exposing Cloudflare's GraphQL
Analytics API to Claude, Claude Code, and any other MCP-compatible client —
traffic, bandwidth, threats, and breakdowns by country/status code, for a
single Cloudflare zone.

## Install

No install needed — run directly with `npx`:

```bash
npx -y @urdigital/mcp-server-cloudflare
```

## Configure

Create a scoped API token at **dash.cloudflare.com → My Profile → API
Tokens → Create Custom Token**, with permission **Zone → Analytics →
Read**, scoped to the specific zone (or all zones) you want data from.

You also need the **Zone ID**, found on that zone's Overview page in the
Cloudflare dashboard (right-hand sidebar).

Add to your MCP client config (e.g. Claude Desktop's `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "cloudflare": {
      "command": "npx",
      "args": ["-y", "@urdigital/mcp-server-cloudflare"],
      "env": {
        "CLOUDFLARE_API_TOKEN": "your-api-token",
        "CLOUDFLARE_ZONE_ID": "your-zone-id"
      }
    }
  }
}
```

This server is currently scoped to one zone per instance (matching one
token to one zone). Managing multiple zones means running multiple
instances with different env vars — same tradeoff as the Clarity server's
one-token-per-project design.

## Tools

| Tool | Description |
|---|---|
| `cloudflare_get_traffic_stats` | Daily requests, bandwidth, page views, unique visitors, threats |
| `cloudflare_get_hourly_traffic_stats` | Same metrics, hourly granularity — **~3 day retention limit**, see below |
| `cloudflare_get_traffic_by_country` | Visits/bandwidth by client country — **1 day query-window limit**, see below |
| `cloudflare_get_traffic_by_status_code` | Visits by HTTP status code — **1 day query-window limit**, see below |
| `cloudflare_get_security_events` | Firewall/WAF events by action, country, ASN — **plan-gated, may not be available**, see below |

## Real limits confirmed by testing against a live zone

Cloudflare's GraphQL Analytics API exposes 70+ datasets, and access/limits
to each vary by plan tier — these aren't hypothetical, all three were hit
directly during testing:

- **`httpRequestsAdaptiveGroups`** (used by the country and status-code
  breakdown tools) **rejects any query window wider than 1 day** on
  standard plans, with an explicit error: `cannot request a time range
  wider than 1d, but your query time range spans 1w`. If you need a longer
  trend, call once per day and aggregate client-side — don't request a
  wide range and expect it to work.
- **Hourly granularity data (`httpRequests1hGroups`) is only retained for
  about 3 days 1 hour** back from the current time. Requesting older
  hourly data returns: `cannot request data older than 3d1h, but your
  query requests data from Xd...`. For anything further back, use daily
  granularity (`cloudflare_get_traffic_stats`) instead.
- **`firewallEventsAdaptiveGroups` (security events) is not available on
  all plans.** On a Free-tier zone, this returned: `zone '...' does not
  have access to the path`. This is a documented, known Cloudflare
  limitation (confirmed via their own community forums, not specific to
  this server) — not a bug, not a token permission issue. If you hit this,
  it means the zone's current plan doesn't include this dataset.

## GraphQL-specific behavior worth knowing

Unlike the REST APIs the other servers in this monorepo talk to, GraphQL
APIs (Cloudflare's included) can return **HTTP 200 with a failure** — the
error shows up in an `errors` array in the response body instead of the
HTTP status code. This client checks for that explicitly on every call;
a plain status-code check would silently treat a failed query as success.

## License

MIT

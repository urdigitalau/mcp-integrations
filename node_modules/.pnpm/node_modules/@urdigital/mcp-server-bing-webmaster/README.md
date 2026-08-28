# @urdigital/mcp-server-bing-webmaster

An MCP (Model Context Protocol) server exposing Bing Webmaster Tools to
Claude, Claude Code, and any other MCP-compatible client.

Built against Bing's JSON/HTTP REST API (`ssl.bing.com/webmaster/api.svc/json`)
rather than the legacy SOAP/POX endpoints, which Microsoft retired on
August 31, 2026.

## Install

No install needed — run directly with `npx`:

```bash
npx -y @urdigital/mcp-server-bing-webmaster
```

## Configure

Get an API key from bing.com/webmasters → your site → Settings → API Access.

Add to your MCP client config (e.g. Claude Desktop's `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "bing-webmaster": {
      "command": "npx",
      "args": ["-y", "@urdigital/mcp-server-bing-webmaster"],
      "env": { "BING_WEBMASTER_API_KEY": "your-api-key" }
    }
  }
}
```

## Tools

| Tool | Description |
|---|---|
| `bing_list_sites` | List all sites verified under this account |
| `bing_get_traffic_stats` | Impressions, clicks, and rank position for a site |
| `bing_get_query_stats` | Queries driving impressions/clicks |
| `bing_get_page_stats` | Impressions/clicks broken down by page |
| `bing_get_crawl_issues` | Crawl errors Bing has found |
| `bing_get_url_info` | Indexing/crawl info for a single URL |
| `bing_submit_url` | Ask Bing to crawl/index a URL |
| `bing_submit_sitemap` | Register/resubmit a sitemap feed |
| `bing_get_keyword_stats` | Search volume estimate for a keyword |

## License

MIT

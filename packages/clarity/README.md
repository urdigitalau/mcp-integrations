   # @urdigital/mcp-server-clarity

   An MCP (Model Context Protocol) server exposing Microsoft Clarity's
   behavioral analytics to Claude, Claude Code, and any other MCP-compatible
   client.

   ## Install

   No install needed — run directly with `npx`:

```bash
   npx -y @urdigital/mcp-server-clarity
```

   ## Configure

   Get a token from your Clarity project → Settings → Data Export → Generate
   new API token. **Tokens are scoped to a single project** — you need a
   separate token per project if you're tracking multiple sites.

   Add to your MCP client config (e.g. Claude Desktop's `claude_desktop_config.json`):

```json
   {
     "mcpServers": {
       "clarity": {
         "command": "npx",
         "args": ["-y", "@urdigital/mcp-server-clarity"],
         "env": { "CLARITY_API_TOKEN": "your-project-token" }
       }
     }
   }
```

   ## Tools

   | Tool | Description |
   |---|---|
   | `clarity_get_insights` | Behavioral analytics for the configured project: traffic, engagement, scroll depth, and frustration signals (rage clicks, dead clicks, quickback clicks, script errors) |

   ## Important behavior, confirmed by testing against a real project

   Clarity's Data Export API is a single, narrow endpoint with real
   limitations worth knowing before you build on it:

   - **Only the last 1-3 days of data are retrievable at all.** There is no
     way to query older data through this API.
   - **No dimensions vs. dimensions is a trade-off, not additive.** Calling
     with no `dimension1/2/3` returns a broad 16-category snapshot (traffic,
     engagement, frustration metrics, plus Browser/Device/OS/Country/PageTitle/
     ReferrerUrl/PopularPages breakdowns). Specifying any dimension swaps that
     out entirely for a narrower metric set (frustration + engagement + traffic
     only), cross-tabulated by whichever dimension(s) you gave. You get depth
     on one axis or breadth across many — not both in the same call.
   - **`numOfDays` is validated; dimension names are not.** An out-of-range
     `numOfDays` (anything but 1, 2, or 3) returns a hard HTTP 400 with an
     empty body — no error message. An invalid dimension name, by contrast,
     returns HTTP 200 and silently falls back to the default no-dimension
     snapshot instead of erroring. This tool restricts dimension inputs to a
     strict enum of the valid values for exactly this reason — it's the only
     real safeguard against a silently wrong result, since Clarity itself
     won't tell you.
   - **Small daily request quota per project** (Clarity doesn't expose your
     exact remaining count anywhere in the API response) — choose `numOfDays`
     and dimensions deliberately rather than probing repeatedly.

   ## License

   MIT
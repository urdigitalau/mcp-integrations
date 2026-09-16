# @urdigital/mcp-server-xero

An MCP (Model Context Protocol) server exposing the Xero Accounting API to
Claude, Claude Code, and any other MCP-compatible client — contacts,
invoices, bank transactions, and the chart of accounts, for a single Xero
organisation.

## This one is different from the other servers in this monorepo

Every other package here (Bing, WordPress, Clarity, Cloudflare, ABS, GA4,
Search Console) authenticates with a static token/key/service-account read
straight from environment variables — no local state, nothing written to
disk. Xero doesn't support that for the auth model this server needs
(Custom Connections — Xero's simpler, service-account-like option — are a
paid add-on we didn't have access to). Full OAuth2 is required instead,
which means:

1. A one-time interactive browser login is needed before the server can
   run at all (see Setup below).
2. **Xero rotates the refresh token on every single use.** Every time this
   client refreshes an access token, the refresh token it just used
   becomes invalid and a new one is issued. This server persists the new
   one back to `.xero-tokens.json` immediately after every refresh — this
   file is not just a cache, it's the *only* place the current valid
   refresh token exists after the very first refresh happens.

**This means `.xero-tokens.json` is a real, live credential — treat it
exactly like an API key or password.** Confirm it's covered by your
`.gitignore` before doing anything else with this package (see the
Security section below) — this is worth checking explicitly rather than
assuming, since every other package's credentials never touched disk at
all, so the existing `.gitignore` may not have had a reason to think
about this pattern before.

## Setup

**1. Create a Xero Developer app** at developer.xero.com → My Apps → New
app → **Web app** (not Custom Connection). Set the redirect URI to
`http://localhost:5000/callback` exactly. You'll get a Client ID and can
generate a Client Secret.

**2. Run the one-time login** (do this once, before ever starting the
actual server):
```bash
cd packages/xero
XERO_CLIENT_ID=your-client-id XERO_CLIENT_SECRET=your-client-secret npm run setup
```
It prints a URL — open it, log into Xero, pick the organisation to
connect. On success it writes `.xero-tokens.json` in the current
directory.

**3. Run the server normally** — it reads the same env vars plus the token
file:
```json
{
  "mcpServers": {
    "xero": {
      "command": "node",
      "args": ["/path/to/packages/xero/dist/index.js"],
      "env": {
        "XERO_CLIENT_ID": "your-client-id",
        "XERO_CLIENT_SECRET": "your-client-secret",
        "XERO_TOKEN_PATH": "/path/to/packages/xero/.xero-tokens.json"
      }
    }
  }
}
```
`XERO_TOKEN_PATH` is optional — defaults to `./.xero-tokens.json` relative
to wherever the process starts, but setting it explicitly to an absolute
path avoids ambiguity when an MCP client launches the process from a
different working directory than you'd expect.

## Scopes (confirmed current as of testing — this changed recently)

Xero replaced its old broad `accounting.transactions` scope with granular
ones on March 2, 2026. Any app created after that date — which includes
any new setup of this server — can **only** use the new names; the old
broad scope name is rejected outright with `invalid_scope`, confirmed by
hitting this directly during testing. The scopes this server requests,
matched to what its tools actually do:

| Scope | Why |
|---|---|
| `accounting.contacts` | List/get contacts |
| `accounting.invoices` | List/get/**create** invoices — write-capable, since this server has a create tool |
| `accounting.banktransactions.read` | List bank transactions — read-only, no write tool for these |
| `accounting.settings.read` | Chart of accounts, organisation details — read-only |

If you add a new tool that writes to bank transactions, accounts, or
anything else, update `setup.ts`'s scope list to match — a tool will fail
with a permissions error otherwise, not a helpful "add this scope" message.

## Tools (all 8 tested against a real, live organisation)

| Tool | Notes |
|---|---|
| `xero_get_organisation` | Confirmed working |
| `xero_list_contacts` | Confirmed working — real result: 97 contacts |
| `xero_get_contact` | Covered implicitly — a real ContactID from list testing worked correctly in invoice creation |
| `xero_list_invoices` | Confirmed working — real result: 41 invoices |
| `xero_get_invoice` | Confirmed working — fetched the same invoice found via list, matched exactly |
| `xero_create_invoice` | Confirmed working — defaults to `DRAFT`, confirmed a real draft invoice was created and did not send/finalize |
| `xero_list_bank_transactions` | Confirmed working — real result: 524 transactions |
| `xero_list_accounts` | Confirmed working — see BANK account quirk below |

### A real quirk found during testing, not a bug in this code

**`BANK`-type accounts in the chart of accounts have no `Code` field** —
it comes back `undefined`. This is accurate to how Xero itself models
things: linked bank accounts aren't manually-coded ledger entries the way
a "Sales" or "Office Supplies" account is, so they genuinely don't carry a
code. Worth knowing so this doesn't look like a parsing bug later.

## Security

- **`.xero-tokens.json` must never be committed to Git or shared anywhere.**
  It's a live credential, unlike anything else in this monorepo.
- This server does not include delete tools for anything, and defaults new
  invoices to `DRAFT` — same "don't take an irreversible action by
  default" philosophy used throughout this monorepo (see `wp_create_post`).
- Custom Connections (Xero's simpler auth option) weren't available for
  this setup — if your Xero plan gains access to them later, that auth
  model would remove the token-file/rotation complexity entirely and is
  worth switching to.

## License

MIT

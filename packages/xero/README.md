# @urdigital/mcp-server-xero

An MCP (Model Context Protocol) server exposing Xero to Claude, Claude
Code, and any other MCP-compatible client — 41 tools spanning the core
Accounting API, Reports, Payments, Manual Journals, Budgets, Attachments,
Payroll AU, Files, Assets, and Projects, for a single Xero organisation.

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
`.gitignore` before doing anything else with this package — this is worth
checking explicitly rather than assuming, since every other package's
credentials never touched disk at all.

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
connect and review the permissions list before approving. On success it
writes `.xero-tokens.json` in the current directory.

**If you've already run setup once and are adding new scopes later**
(e.g. upgrading from an older version of this server with fewer tools),
you must re-run `npm run setup` — Xero only grants what was approved on
the original consent screen, and won't retroactively add new scopes to an
existing token.

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

## Scopes — confirmed against Xero's own official scope reference table

Xero replaced its old broad `accounting.transactions` scope with granular
ones on March 2, 2026. Any app created after that date — which includes
any new setup of this server — can **only** use the new names.

**A real bug found and fixed during testing, worth knowing if you ever
edit the scope list yourself:** `app.connections` looks like it should be
needed for tenant discovery (this client calls `GET /connections`), but
Xero's own documentation states it's a **non-tenanted scope restricted to
the Client Credentials grant type** — it cannot be requested through the
interactive Authorization Code flow this server uses, *at all*, regardless
of which other scopes accompany it. Including it caused every single
authorization attempt to fail immediately with `access_denied` /
`"Requested wrong apps scopes"`, before the consent screen even
appeared — not a partial rejection, a total one. It's correctly **not**
in the scope list `setup.ts` uses; tenant discovery works fine without it,
confirmed by this server's very first successful setup run, and confirmed
again after this specific bug was found and fixed.

Full current scope list this server requests, matched to what its tools
actually do:

| Scope | Why |
|---|---|
| `accounting.contacts` | Contacts |
| `accounting.invoices` | Invoices — write-capable (create tool exists) |
| `accounting.payments` | Payments — write-capable (create tool exists) |
| `accounting.banktransactions` | Bank transactions (read-only tools only) |
| `accounting.manualjournals` | Manual journals — write-capable (create tool exists) |
| `accounting.settings` | Chart of accounts, organisation |
| `accounting.attachments` | Attachments (read-only) |
| `accounting.budgets.read` | Budgets (read-only) |
| `accounting.reports.*.read` (8 scopes) | Every Reports endpoint (read-only) |
| `payroll.employees`, `.payruns`, `.payslip`, `.settings`, `.timesheets` | Payroll AU (read-only) |
| `files` | Files API (read-only) |
| `assets` | Assets API (read-only) |
| `projects` | Projects API (read-only) |

## Tools (41 total)

**Core Accounting** (originally tested, still confirmed working): `xero_get_organisation`, `xero_list_contacts`, `xero_get_contact`, `xero_list_invoices`, `xero_get_invoice`, `xero_create_invoice` (defaults to `DRAFT`), `xero_list_bank_transactions`, `xero_list_accounts`.

**Reports** (all confirmed against a real organisation): `xero_get_profit_and_loss`, `xero_get_balance_sheet`, `xero_get_bank_summary`, `xero_get_budget_summary`, `xero_get_executive_summary`, `xero_get_trial_balance`, `xero_get_aged_receivables`, `xero_get_aged_payables`, `xero_get_1099_report` (US-only, not applicable to non-US orgs).

**Published reports / BAS & GST — a real mechanism found through testing, not guessed:** `xero_list_published_reports`, `xero_get_published_report`. BAS (Australia) and GST (New Zealand) reports are **not** live/on-demand like Profit & Loss — an initial guess at a dedicated endpoint (`/Reports/BASReport`) returned a genuine 404 during testing. The actual mechanism, confirmed via Xero's own developer community: these are **published snapshots** — someone must explicitly publish a BAS/GST report inside Xero's UI first (Reports → GST Return/BAS → Publish). `xero_list_published_reports` calls the generic `GET /Reports` (no report name) to list whatever's been published, each with a `ReportID`; `xero_get_published_report` fetches one specific report by that ID. An empty list is a correct result if nothing's been published recently, not a bug.

**Payments**: `xero_list_payments`, `xero_get_payment`, `xero_create_payment` (records a payment against an invoice — doesn't move real money, records that a payment happened elsewhere).

**Manual Journals**: `xero_list_manual_journals`, `xero_get_manual_journal`, `xero_create_manual_journal` (defaults to `DRAFT`, same pattern as invoices).

**Budgets** (read-only): `xero_list_budgets`, `xero_get_budget`.

**Attachments** (read-only): `xero_list_attachments`.

**Payroll AU** (read-only — deliberately no write tools; posting a pay run or creating an employee has real consequences with no obvious safe default the way a draft invoice has): `xero_list_payroll_employees`, `xero_get_payroll_employee`, `xero_list_pay_runs`, `xero_get_pay_run`, `xero_get_payslip`, `xero_get_payroll_settings`, `xero_list_timesheets`. All confirmed against a real organisation.

**Files** (read-only): `xero_list_files`, `xero_get_file`. Confirmed working.

**Assets** (read-only): `xero_list_assets`, `xero_get_asset`, `xero_list_asset_types`. **`xero_list_assets` returned a 403 during testing on the organisation this was tested against.** Given the scope was correctly granted and every other new API surface worked, this is very likely because that specific organisation doesn't have Xero's Fixed Asset Register feature enabled — the same category of "plan/feature gate, not a code bug" finding as Cloudflare's security-events dataset elsewhere in this monorepo. If you hit this, check Accounting → Fixed Assets in the Xero UI directly before assuming the code is broken.

**Projects** (read-only): `xero_list_projects`, `xero_get_project`. Confirmed working (returns an empty list on an organisation with no projects set up — correct, not an error).

## Security

- **`.xero-tokens.json` must never be committed to Git or shared anywhere.**
  It's a live credential, unlike anything else in this monorepo.
- No delete tools for anything, and new invoices/manual journals default
  to `DRAFT` — same "don't take an irreversible action by default"
  philosophy used throughout this monorepo (see `wp_create_post`).
- Payroll, Assets, and Files are read-only by deliberate design, not
  omission — these product areas don't have an obvious safe default the
  way invoices/journals do.
- Custom Connections (Xero's simpler auth option) weren't available for
  this setup — if your Xero plan gains access to them later, that auth
  model would remove the token-file/rotation complexity entirely and is
  worth switching to.

## License

MIT

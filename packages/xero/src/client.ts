import fs from "node:fs";
import { apiRequest, requireEnv, optionalEnv } from "@urdigital/mcp-server-shared";

/**
 * Xero Accounting API.
 *
 * Auth: full OAuth 2.0 (not Custom Connections — those need a Xero
 * premium plan we couldn't confirm access to). Run `npm run setup` /
 * `node dist/setup.js` ONCE first — see setup.ts and this package's
 * README — before ever starting this server.
 *
 * CRITICAL Xero-specific behavior: refresh tokens are ROTATED on every
 * use. Every time this client refreshes an access token, Xero invalidates
 * the refresh token that was just used and issues a brand new one. This
 * client persists the new refresh token back to the same file
 * immediately after every refresh — skipping that would mean the very
 * next run fails, even though the current one succeeded. This is why
 * this server needs a local token FILE at all, unlike every other server
 * in this monorepo, which are pure env-var, no-local-state designs.
 *
 * Tenant model: a single Xero OAuth connection can technically cover
 * multiple organisations ("tenants"). This client is built for the
 * single-organisation case (confirmed as the actual need) — it discovers
 * the tenant ID once via GET /connections and caches it in the same
 * token file, rather than supporting tenant selection per call.
 */
const TOKEN_URL = "https://identity.xero.com/connect/token";
const API_BASE = "https://api.xero.com/api.xro/2.0";
const CONNECTIONS_URL = "https://api.xero.com/connections";

interface TokenFile {
  access_token: string;
  refresh_token: string;
  expires_at: number; // epoch ms
  tenant_id?: string;
}

export class XeroClient {
  private clientId: string;
  private clientSecret: string;
  private tokenPath: string;
  private tokens: TokenFile;

  constructor() {
    this.clientId = requireEnv("XERO_CLIENT_ID");
    this.clientSecret = requireEnv("XERO_CLIENT_SECRET");
    this.tokenPath = optionalEnv("XERO_TOKEN_PATH") ?? "./.xero-tokens.json";

    if (!fs.existsSync(this.tokenPath)) {
      throw new Error(
        `No token file found at "${this.tokenPath}". Run the one-time setup step first: npm run setup (see this package's README) — this server cannot log in interactively itself.`
      );
    }
    this.tokens = JSON.parse(fs.readFileSync(this.tokenPath, "utf-8"));
  }

  private saveTokens() {
    fs.writeFileSync(this.tokenPath, JSON.stringify(this.tokens, null, 2));
  }

  private async ensureAccessToken(): Promise<string> {
    if (this.tokens.expires_at > Date.now() + 60_000) return this.tokens.access_token;

    const basicAuth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { Authorization: `Basic ${basicAuth}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: this.tokens.refresh_token }),
    });
    const json = await res.json();
    if (!res.ok) {
      throw new Error(
        `Xero token refresh failed: ${JSON.stringify(json)}. If the refresh token was already used/rotated elsewhere (e.g. you ran setup again separately), re-run setup to get a fresh one.`
      );
    }

    this.tokens.access_token = json.access_token;
    this.tokens.refresh_token = json.refresh_token; // rotated — must persist immediately
    this.tokens.expires_at = Date.now() + Number(json.expires_in) * 1000;
    this.saveTokens();
    return this.tokens.access_token;
  }

  private async ensureTenantId(accessToken: string): Promise<string> {
    if (this.tokens.tenant_id) return this.tokens.tenant_id;

    const connections = await apiRequest<{ tenantId: string; tenantName: string }[]>(CONNECTIONS_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!connections.length) {
      throw new Error("No Xero organisations are connected to this app. Re-run setup and make sure you select an organisation on Xero's consent screen.");
    }

    this.tokens.tenant_id = connections[0].tenantId;
    this.saveTokens();
    return this.tokens.tenant_id!;
  }

  private async headers(): Promise<Record<string, string>> {
    const accessToken = await this.ensureAccessToken();
    const tenantId = await this.ensureTenantId(accessToken);
    return { Authorization: `Bearer ${accessToken}`, "Xero-tenant-id": tenantId, Accept: "application/json" };
  }

  async listContacts(params: { where?: string; page?: number } = {}) {
    return apiRequest(`${API_BASE}/Contacts`, { headers: await this.headers(), query: params });
  }

  async getContact(contactId: string) {
    return apiRequest(`${API_BASE}/Contacts/${contactId}`, { headers: await this.headers() });
  }

  async listInvoices(params: { where?: string; page?: number; status?: string } = {}) {
    return apiRequest(`${API_BASE}/Invoices`, { headers: await this.headers(), query: params });
  }

  async getInvoice(invoiceId: string) {
    return apiRequest(`${API_BASE}/Invoices/${invoiceId}`, { headers: await this.headers() });
  }

  /**
   * Creates an invoice. Defaults to DRAFT status if not specified — same
   * "don't publish/finalize by accident" safety default used throughout
   * this monorepo (see wp_create_post). Xero's own default is also DRAFT
   * when Status is omitted, so this is reinforcing Xero's own safe
   * default rather than overriding a riskier one.
   */
  async createInvoice(data: Record<string, unknown>) {
    return apiRequest(`${API_BASE}/Invoices`, {
      method: "POST",
      headers: await this.headers(),
      body: { Invoices: [{ Status: "DRAFT", ...data }] },
    });
  }

  async listBankTransactions(params: { where?: string; page?: number } = {}) {
    return apiRequest(`${API_BASE}/BankTransactions`, { headers: await this.headers(), query: params });
  }

  async listAccounts(params: { where?: string } = {}) {
    return apiRequest(`${API_BASE}/Accounts`, { headers: await this.headers(), query: params });
  }

  async getOrganisation() {
    return apiRequest(`${API_BASE}/Organisation`, { headers: await this.headers() });
  }
}

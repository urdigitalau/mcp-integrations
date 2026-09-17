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
const PAYROLL_AU_BASE = "https://api.xero.com/payroll.xro/1.0";
const FILES_BASE = "https://api.xero.com/files.xro/1.0";
const ASSETS_BASE = "https://api.xero.com/assets.xro/1.0";
const PROJECTS_BASE = "https://api.xero.com/projects.xro/2.0";

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

  // ==================== Reports (Accounting API) ====================
  // Same base/auth as everything above — reports are just another
  // resource under the main Accounting API, not a separate product.

  async getProfitAndLoss(params: { fromDate?: string; toDate?: string } = {}) {
    return apiRequest(`${API_BASE}/Reports/ProfitAndLoss`, { headers: await this.headers(), query: params });
  }

  async getBalanceSheet(params: { date?: string } = {}) {
    return apiRequest(`${API_BASE}/Reports/BalanceSheet`, { headers: await this.headers(), query: params });
  }

  async getBankSummary(params: { fromDate?: string; toDate?: string } = {}) {
    return apiRequest(`${API_BASE}/Reports/BankSummary`, { headers: await this.headers(), query: params });
  }

  async getBudgetSummary(params: { date?: string } = {}) {
    return apiRequest(`${API_BASE}/Reports/BudgetSummary`, { headers: await this.headers(), query: params });
  }

  async getExecutiveSummary(params: { date?: string } = {}) {
    return apiRequest(`${API_BASE}/Reports/ExecutiveSummary`, { headers: await this.headers(), query: params });
  }

  async getTrialBalance(params: { date?: string } = {}) {
    return apiRequest(`${API_BASE}/Reports/TrialBalance`, { headers: await this.headers(), query: params });
  }

  /** contactId is REQUIRED by Xero for this report — it's per-contact, not a whole-org summary. */
  async getAgedReceivablesByContact(contactId: string, params: { fromDate?: string; toDate?: string } = {}) {
    return apiRequest(`${API_BASE}/Reports/AgedReceivablesByContact`, { headers: await this.headers(), query: { contactId, ...params } });
  }

  /** contactId is REQUIRED by Xero for this report — same as receivables above. */
  async getAgedPayablesByContact(contactId: string, params: { fromDate?: string; toDate?: string } = {}) {
    return apiRequest(`${API_BASE}/Reports/AgedPayablesByContact`, { headers: await this.headers(), query: { contactId, ...params } });
  }

  /**
   * BAS/GST reports work fundamentally differently from every other
   * report in this class — confirmed via Xero's own developer community,
   * after an initial guessed endpoint (/Reports/BASReport) returned a
   * real 404 during testing. They are not live, computed-on-demand
   * reports accessible by name; they're PUBLISHED SNAPSHOTS that someone
   * must have explicitly published inside the Xero UI first (Reports ->
   * GST Return / BAS, "Publish"). There is no direct URL for "the current
   * BAS report" — you list whatever's been published, find the one you
   * want by its ReportID, then fetch that specific report.
   *
   * Practical implication: this may return an empty list if nobody has
   * published a BAS/GST report in this org recently — that's a correct,
   * expected result in that case, not a bug.
   */
  async listPublishedReports() {
    return apiRequest(`${API_BASE}/Reports`, { headers: await this.headers() });
  }

  /** Fetches one specific published report by the ReportID found via listPublishedReports() — this is how you actually retrieve a BAS/GST report. */
  async getPublishedReport(reportId: string) {
    return apiRequest(`${API_BASE}/Reports/${reportId}`, { headers: await this.headers() });
  }

  /** US-only (1099 tax form report) — included for completeness even though this org is AU-based. */
  async getTenNinetyNine(params: { taxYear?: string } = {}) {
    return apiRequest(`${API_BASE}/Reports/TenNinetyNine`, { headers: await this.headers(), query: params });
  }

  // ==================== Payments (Accounting API) ====================

  async listPayments(params: { where?: string; page?: number } = {}) {
    return apiRequest(`${API_BASE}/Payments`, { headers: await this.headers(), query: params });
  }

  async getPayment(paymentId: string) {
    return apiRequest(`${API_BASE}/Payments/${paymentId}`, { headers: await this.headers() });
  }

  /** Records a payment against an existing invoice — this doesn't move real money, it records that a payment happened (e.g. via bank transfer) so Xero's books reflect it. */
  async createPayment(data: { invoiceId: string; accountId: string; amount: number; date: string }) {
    return apiRequest(`${API_BASE}/Payments`, {
      method: "POST",
      headers: await this.headers(),
      body: { Payments: [{ Invoice: { InvoiceID: data.invoiceId }, Account: { AccountID: data.accountId }, Amount: data.amount, Date: data.date }] },
    });
  }

  // ==================== Manual Journals (Accounting API) ====================

  async listManualJournals(params: { where?: string; page?: number } = {}) {
    return apiRequest(`${API_BASE}/ManualJournals`, { headers: await this.headers(), query: params });
  }

  async getManualJournal(manualJournalId: string) {
    return apiRequest(`${API_BASE}/ManualJournals/${manualJournalId}`, { headers: await this.headers() });
  }

  /** Defaults to DRAFT — same safe-by-default pattern as createInvoice. */
  async createManualJournal(data: { narration: string; lines: { accountCode: string; description?: string; taxType?: string; lineAmount: number }[]; status?: "DRAFT" | "POSTED" }) {
    return apiRequest(`${API_BASE}/ManualJournals`, {
      method: "POST",
      headers: await this.headers(),
      body: {
        ManualJournals: [
          {
            Narration: data.narration,
            Status: data.status ?? "DRAFT",
            JournalLines: data.lines.map((l) => ({ AccountCode: l.accountCode, Description: l.description, TaxType: l.taxType, LineAmount: l.lineAmount })),
          },
        ],
      },
    });
  }

  // ==================== Budgets (Accounting API, read-only) ====================

  async listBudgets() {
    return apiRequest(`${API_BASE}/Budgets`, { headers: await this.headers() });
  }

  async getBudget(budgetId: string) {
    return apiRequest(`${API_BASE}/Budgets/${budgetId}`, { headers: await this.headers() });
  }

  // ==================== Attachments (Accounting API, read-only) ====================
  // Attachments hang off other entities (invoices, contacts, etc.) rather
  // than being their own resource — this is generic across entity types.

  async listAttachments(entityType: "Invoices" | "Contacts" | "CreditNotes" | "BankTransactions", entityId: string) {
    return apiRequest(`${API_BASE}/${entityType}/${entityId}/Attachments`, { headers: await this.headers() });
  }

  // ==================== Payroll AU (separate API — read-only) ====================
  // No write tools here deliberately — payroll actions (posting a pay
  // run, creating an employee) have real financial/legal consequences
  // with no obvious safe default the way a draft invoice has. Read-only
  // by design, not by omission.

  async listPayrollEmployees(params: { where?: string; page?: number } = {}) {
    return apiRequest(`${PAYROLL_AU_BASE}/Employees`, { headers: await this.headers(), query: params });
  }

  async getPayrollEmployee(employeeId: string) {
    return apiRequest(`${PAYROLL_AU_BASE}/Employees/${employeeId}`, { headers: await this.headers() });
  }

  async listPayRuns(params: { page?: number } = {}) {
    return apiRequest(`${PAYROLL_AU_BASE}/PayRuns`, { headers: await this.headers(), query: params });
  }

  async getPayRun(payRunId: string) {
    return apiRequest(`${PAYROLL_AU_BASE}/PayRuns/${payRunId}`, { headers: await this.headers() });
  }

  async getPayslip(payslipId: string) {
    return apiRequest(`${PAYROLL_AU_BASE}/Payslip/${payslipId}`, { headers: await this.headers() });
  }

  async getPayrollSettings() {
    return apiRequest(`${PAYROLL_AU_BASE}/Settings`, { headers: await this.headers() });
  }

  async listTimesheets(params: { employeeId?: string; page?: number } = {}) {
    return apiRequest(`${PAYROLL_AU_BASE}/Timesheets`, { headers: await this.headers(), query: params });
  }

  // ==================== Files (separate API, read-only) ====================

  async listFiles(params: { pagesize?: number } = {}) {
    return apiRequest(`${FILES_BASE}/Files`, { headers: await this.headers(), query: params });
  }

  async getFile(fileId: string) {
    return apiRequest(`${FILES_BASE}/Files/${fileId}`, { headers: await this.headers() });
  }

  // ==================== Assets (separate API, read-only) ====================

  async listAssets(params: { status?: string; page?: number } = {}) {
    return apiRequest(`${ASSETS_BASE}/Assets`, { headers: await this.headers(), query: params });
  }

  async getAsset(assetId: string) {
    return apiRequest(`${ASSETS_BASE}/Assets/${assetId}`, { headers: await this.headers() });
  }

  async listAssetTypes() {
    return apiRequest(`${ASSETS_BASE}/AssetTypes`, { headers: await this.headers() });
  }

  // ==================== Projects (separate API, read-only) ====================

  async listProjects(params: { contactID?: string; page?: number } = {}) {
    return apiRequest(`${PROJECTS_BASE}/Projects`, { headers: await this.headers(), query: params });
  }

  async getProject(projectId: string) {
    return apiRequest(`${PROJECTS_BASE}/Projects/${projectId}`, { headers: await this.headers() });
  }
}

#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { XeroClient } from "./client.js";

const server = new McpServer({ name: "mcp-server-xero", version: "0.1.0" });
const xero = new XeroClient();

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}
function err(e: unknown) {
  const message = e instanceof Error ? e.message : String(e);
  return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
}

server.registerTool(
  "xero_get_organisation",
  { title: "Get organisation details", description: "Get details of the connected Xero organisation — name, currency, financial year end, and similar.", inputSchema: {} },
  async () => {
    try {
      return ok(await xero.getOrganisation());
    } catch (e) {
      return err(e);
    }
  }
);

server.registerTool(
  "xero_list_contacts",
  {
    title: "List contacts",
    description: "List/search contacts (customers and suppliers).",
    inputSchema: {
      where: z.string().optional().describe("Xero API filter syntax, e.g. \"Name.Contains(\\\"Acme\\\")\""),
      page: z.number().int().min(1).optional(),
    },
  },
  async (args) => {
    try {
      return ok(await xero.listContacts(args));
    } catch (e) {
      return err(e);
    }
  }
);

server.registerTool(
  "xero_get_contact",
  { title: "Get a contact", description: "Fetch a single contact by its Xero ContactID.", inputSchema: { contactId: z.string() } },
  async ({ contactId }) => {
    try {
      return ok(await xero.getContact(contactId));
    } catch (e) {
      return err(e);
    }
  }
);

server.registerTool(
  "xero_list_invoices",
  {
    title: "List invoices",
    description: "List/filter invoices.",
    inputSchema: {
      where: z.string().optional().describe("Xero API filter syntax"),
      status: z.string().optional().describe("e.g. DRAFT, SUBMITTED, AUTHORISED, PAID, VOIDED"),
      page: z.number().int().min(1).optional(),
    },
  },
  async (args) => {
    try {
      return ok(await xero.listInvoices(args));
    } catch (e) {
      return err(e);
    }
  }
);

server.registerTool(
  "xero_get_invoice",
  { title: "Get an invoice", description: "Fetch a single invoice by its Xero InvoiceID.", inputSchema: { invoiceId: z.string() } },
  async ({ invoiceId }) => {
    try {
      return ok(await xero.getInvoice(invoiceId));
    } catch (e) {
      return err(e);
    }
  }
);

server.registerTool(
  "xero_create_invoice",
  {
    title: "Create an invoice",
    description:
      "Create a new invoice. Defaults to DRAFT status so nothing gets sent/finalized unintentionally — pass status: 'AUTHORISED' explicitly if you want it live immediately. Requires a valid Contact and at least one LineItem.",
    inputSchema: {
      contactId: z.string().describe("Xero ContactID for the customer this invoice is for"),
      lineItems: z
        .array(z.object({ description: z.string(), quantity: z.number(), unitAmount: z.number(), accountCode: z.string().optional() }))
        .min(1),
      type: z.enum(["ACCREC", "ACCPAY"]).optional().describe("ACCREC = sales invoice (default), ACCPAY = bill to pay"),
      status: z.enum(["DRAFT", "SUBMITTED", "AUTHORISED"]).optional().describe("Defaults to DRAFT"),
      dueDate: z.string().optional().describe("YYYY-MM-DD"),
    },
  },
  async ({ contactId, lineItems, type, status, dueDate }) => {
    try {
      const data: Record<string, unknown> = {
        Type: type ?? "ACCREC",
        Contact: { ContactID: contactId },
        LineItems: lineItems.map((li) => ({
          Description: li.description,
          Quantity: li.quantity,
          UnitAmount: li.unitAmount,
          AccountCode: li.accountCode,
        })),
      };
      if (status) data.Status = status;
      if (dueDate) data.DueDate = dueDate;
      return ok(await xero.createInvoice(data));
    } catch (e) {
      return err(e);
    }
  }
);

server.registerTool(
  "xero_list_bank_transactions",
  {
    title: "List bank transactions",
    description: "List/filter bank account transactions (spend money, receive money, reconciled or not).",
    inputSchema: { where: z.string().optional().describe("Xero API filter syntax"), page: z.number().int().min(1).optional() },
  },
  async (args) => {
    try {
      return ok(await xero.listBankTransactions(args));
    } catch (e) {
      return err(e);
    }
  }
);

server.registerTool(
  "xero_list_accounts",
  {
    title: "List chart of accounts",
    description: "List the chart of accounts (account codes, types, e.g. Sales, Bank, Expense).",
    inputSchema: { where: z.string().optional().describe("Xero API filter syntax") },
  },
  async (args) => {
    try {
      return ok(await xero.listAccounts(args));
    } catch (e) {
      return err(e);
    }
  }
);

// ==================== Reports ====================

server.registerTool(
  "xero_get_profit_and_loss",
  { title: "Get Profit and Loss report", description: "Get the P&L report for a date range.", inputSchema: { fromDate: z.string().optional().describe("YYYY-MM-DD"), toDate: z.string().optional().describe("YYYY-MM-DD") } },
  async (args) => { try { return ok(await xero.getProfitAndLoss(args)); } catch (e) { return err(e); } }
);

server.registerTool(
  "xero_get_balance_sheet",
  { title: "Get Balance Sheet report", description: "Get the balance sheet as at a given date (defaults to today if omitted).", inputSchema: { date: z.string().optional().describe("YYYY-MM-DD") } },
  async (args) => { try { return ok(await xero.getBalanceSheet(args)); } catch (e) { return err(e); } }
);

server.registerTool(
  "xero_get_bank_summary",
  { title: "Get Bank Summary report", description: "Get a summary of bank account activity for a date range.", inputSchema: { fromDate: z.string().optional(), toDate: z.string().optional() } },
  async (args) => { try { return ok(await xero.getBankSummary(args)); } catch (e) { return err(e); } }
);

server.registerTool(
  "xero_get_budget_summary",
  { title: "Get Budget Summary report", description: "Get budgeted vs actual figures as at a given date.", inputSchema: { date: z.string().optional() } },
  async (args) => { try { return ok(await xero.getBudgetSummary(args)); } catch (e) { return err(e); } }
);

server.registerTool(
  "xero_get_executive_summary",
  { title: "Get Executive Summary report", description: "Get a high-level financial overview as at a given date.", inputSchema: { date: z.string().optional() } },
  async (args) => { try { return ok(await xero.getExecutiveSummary(args)); } catch (e) { return err(e); } }
);

server.registerTool(
  "xero_get_trial_balance",
  { title: "Get Trial Balance report", description: "Get the trial balance as at a given date.", inputSchema: { date: z.string().optional() } },
  async (args) => { try { return ok(await xero.getTrialBalance(args)); } catch (e) { return err(e); } }
);

server.registerTool(
  "xero_get_aged_receivables",
  { title: "Get Aged Receivables by contact", description: "Get an aging breakdown of amounts owed BY a specific contact (customer). Requires a real ContactID — use xero_list_contacts first.", inputSchema: { contactId: z.string(), fromDate: z.string().optional(), toDate: z.string().optional() } },
  async ({ contactId, ...rest }) => { try { return ok(await xero.getAgedReceivablesByContact(contactId, rest)); } catch (e) { return err(e); } }
);

server.registerTool(
  "xero_get_aged_payables",
  { title: "Get Aged Payables by contact", description: "Get an aging breakdown of amounts owed TO a specific contact (supplier). Requires a real ContactID — use xero_list_contacts first.", inputSchema: { contactId: z.string(), fromDate: z.string().optional(), toDate: z.string().optional() } },
  async ({ contactId, ...rest }) => { try { return ok(await xero.getAgedPayablesByContact(contactId, rest)); } catch (e) { return err(e); } }
);

server.registerTool(
  "xero_list_published_reports",
  {
    title: "List published reports (incl. BAS/GST)",
    description:
      "List reports that have been explicitly published inside Xero's UI, each with a ReportID. This is the ONLY way to access BAS (Australia) or GST (NZ) reports — confirmed by testing that they are NOT live/on-demand reports like Profit & Loss, they must be published by a user in Xero first (Reports -> GST Return or BAS -> Publish). An empty result is expected and correct if nothing has been published recently, not a bug. Use xero_get_published_report with a ReportID from this list to fetch one.",
    inputSchema: {},
  },
  async () => { try { return ok(await xero.listPublishedReports()); } catch (e) { return err(e); } }
);

server.registerTool(
  "xero_get_published_report",
  { title: "Get a published report by ID", description: "Fetch one specific published report (e.g. a BAS or GST report) by the ReportID found via xero_list_published_reports.", inputSchema: { reportId: z.string() } },
  async ({ reportId }) => { try { return ok(await xero.getPublishedReport(reportId)); } catch (e) { return err(e); } }
);

server.registerTool(
  "xero_get_1099_report",
  { title: "Get 1099 report", description: "US-only tax form report. Included for completeness; not applicable to non-US organisations.", inputSchema: { taxYear: z.string().optional() } },
  async (args) => { try { return ok(await xero.getTenNinetyNine(args)); } catch (e) { return err(e); } }
);

// ==================== Payments ====================

server.registerTool(
  "xero_list_payments",
  { title: "List payments", description: "List/filter recorded payments.", inputSchema: { where: z.string().optional(), page: z.number().int().min(1).optional() } },
  async (args) => { try { return ok(await xero.listPayments(args)); } catch (e) { return err(e); } }
);

server.registerTool(
  "xero_get_payment",
  { title: "Get a payment", description: "Fetch a single payment by its Xero PaymentID.", inputSchema: { paymentId: z.string() } },
  async ({ paymentId }) => { try { return ok(await xero.getPayment(paymentId)); } catch (e) { return err(e); } }
);

server.registerTool(
  "xero_create_payment",
  {
    title: "Record a payment against an invoice",
    description: "Records that a payment was made against an existing invoice (e.g. a bank transfer received) — this does not move real money, it updates Xero's books to reflect a payment that already happened elsewhere.",
    inputSchema: { invoiceId: z.string(), accountId: z.string().describe("Bank account to record the payment against — see xero_list_accounts"), amount: z.number(), date: z.string().describe("YYYY-MM-DD") },
  },
  async (args) => { try { return ok(await xero.createPayment(args)); } catch (e) { return err(e); } }
);

// ==================== Manual Journals ====================

server.registerTool(
  "xero_list_manual_journals",
  { title: "List manual journals", description: "List/filter manual journal entries.", inputSchema: { where: z.string().optional(), page: z.number().int().min(1).optional() } },
  async (args) => { try { return ok(await xero.listManualJournals(args)); } catch (e) { return err(e); } }
);

server.registerTool(
  "xero_get_manual_journal",
  { title: "Get a manual journal", description: "Fetch a single manual journal by its Xero ManualJournalID.", inputSchema: { manualJournalId: z.string() } },
  async ({ manualJournalId }) => { try { return ok(await xero.getManualJournal(manualJournalId)); } catch (e) { return err(e); } }
);

server.registerTool(
  "xero_create_manual_journal",
  {
    title: "Create a manual journal",
    description: "Create a manual journal entry. Defaults to DRAFT status, same 'don't finalize by accident' pattern as xero_create_invoice — pass status: 'POSTED' explicitly to post it immediately. Line amounts must net to zero across the journal.",
    inputSchema: {
      narration: z.string(),
      lines: z.array(z.object({ accountCode: z.string(), description: z.string().optional(), taxType: z.string().optional(), lineAmount: z.number() })).min(2),
      status: z.enum(["DRAFT", "POSTED"]).optional().describe("Defaults to DRAFT"),
    },
  },
  async (args) => { try { return ok(await xero.createManualJournal(args)); } catch (e) { return err(e); } }
);

// ==================== Budgets (read-only) ====================

server.registerTool(
  "xero_list_budgets",
  { title: "List budgets", description: "List budgets set up in this organisation.", inputSchema: {} },
  async () => { try { return ok(await xero.listBudgets()); } catch (e) { return err(e); } }
);

server.registerTool(
  "xero_get_budget",
  { title: "Get a budget", description: "Fetch a single budget's detail by its Xero BudgetID.", inputSchema: { budgetId: z.string() } },
  async ({ budgetId }) => { try { return ok(await xero.getBudget(budgetId)); } catch (e) { return err(e); } }
);

// ==================== Attachments (read-only) ====================

server.registerTool(
  "xero_list_attachments",
  {
    title: "List attachments on a record",
    description: "List file attachments on an invoice, contact, credit note, or bank transaction.",
    inputSchema: { entityType: z.enum(["Invoices", "Contacts", "CreditNotes", "BankTransactions"]), entityId: z.string() },
  },
  async ({ entityType, entityId }) => { try { return ok(await xero.listAttachments(entityType, entityId)); } catch (e) { return err(e); } }
);

// ==================== Payroll AU (read-only) ====================

server.registerTool(
  "xero_list_payroll_employees",
  { title: "List payroll employees", description: "List employees in the AU payroll system. Read-only — no employee creation/write tool is included here.", inputSchema: { where: z.string().optional(), page: z.number().int().min(1).optional() } },
  async (args) => { try { return ok(await xero.listPayrollEmployees(args)); } catch (e) { return err(e); } }
);

server.registerTool(
  "xero_get_payroll_employee",
  { title: "Get a payroll employee", description: "Fetch a single payroll employee record.", inputSchema: { employeeId: z.string() } },
  async ({ employeeId }) => { try { return ok(await xero.getPayrollEmployee(employeeId)); } catch (e) { return err(e); } }
);

server.registerTool(
  "xero_list_pay_runs",
  { title: "List pay runs", description: "List payroll pay runs. Read-only — no pay run posting/write tool is included here, since posting a pay run has real financial consequences with no obvious safe default.", inputSchema: { page: z.number().int().min(1).optional() } },
  async (args) => { try { return ok(await xero.listPayRuns(args)); } catch (e) { return err(e); } }
);

server.registerTool(
  "xero_get_pay_run",
  { title: "Get a pay run", description: "Fetch a single pay run by its Xero PayRunID.", inputSchema: { payRunId: z.string() } },
  async ({ payRunId }) => { try { return ok(await xero.getPayRun(payRunId)); } catch (e) { return err(e); } }
);

server.registerTool(
  "xero_get_payslip",
  { title: "Get a payslip", description: "Fetch a single employee's payslip for a pay run.", inputSchema: { payslipId: z.string() } },
  async ({ payslipId }) => { try { return ok(await xero.getPayslip(payslipId)); } catch (e) { return err(e); } }
);

server.registerTool(
  "xero_get_payroll_settings",
  { title: "Get payroll settings", description: "Get AU payroll configuration — pay items, tax settings, and similar.", inputSchema: {} },
  async () => { try { return ok(await xero.getPayrollSettings()); } catch (e) { return err(e); } }
);

server.registerTool(
  "xero_list_timesheets",
  { title: "List timesheets", description: "List employee timesheets, optionally filtered to one employee.", inputSchema: { employeeId: z.string().optional(), page: z.number().int().min(1).optional() } },
  async (args) => { try { return ok(await xero.listTimesheets(args)); } catch (e) { return err(e); } }
);

// ==================== Files (read-only) ====================

server.registerTool(
  "xero_list_files",
  { title: "List files", description: "List files stored in Xero's Files product for this organisation.", inputSchema: { pagesize: z.number().int().min(1).optional() } },
  async (args) => { try { return ok(await xero.listFiles(args)); } catch (e) { return err(e); } }
);

server.registerTool(
  "xero_get_file",
  { title: "Get file details", description: "Fetch metadata for a single file by its Xero FileID (not the file content itself).", inputSchema: { fileId: z.string() } },
  async ({ fileId }) => { try { return ok(await xero.getFile(fileId)); } catch (e) { return err(e); } }
);

// ==================== Assets (read-only) ====================

server.registerTool(
  "xero_list_assets",
  { title: "List fixed assets", description: "List fixed assets in the asset register.", inputSchema: { status: z.string().optional(), page: z.number().int().min(1).optional() } },
  async (args) => { try { return ok(await xero.listAssets(args)); } catch (e) { return err(e); } }
);

server.registerTool(
  "xero_get_asset",
  { title: "Get a fixed asset", description: "Fetch a single fixed asset by its Xero AssetID.", inputSchema: { assetId: z.string() } },
  async ({ assetId }) => { try { return ok(await xero.getAsset(assetId)); } catch (e) { return err(e); } }
);

server.registerTool(
  "xero_list_asset_types",
  { title: "List asset types", description: "List the fixed asset type categories configured for this organisation.", inputSchema: {} },
  async () => { try { return ok(await xero.listAssetTypes()); } catch (e) { return err(e); } }
);

// ==================== Projects (read-only) ====================

server.registerTool(
  "xero_list_projects",
  { title: "List projects", description: "List Xero Projects (time/cost tracking jobs), optionally filtered to a contact.", inputSchema: { contactID: z.string().optional(), page: z.number().int().min(1).optional() } },
  async (args) => { try { return ok(await xero.listProjects(args)); } catch (e) { return err(e); } }
);

server.registerTool(
  "xero_get_project",
  { title: "Get a project", description: "Fetch a single project by its Xero ProjectID.", inputSchema: { projectId: z.string() } },
  async ({ projectId }) => { try { return ok(await xero.getProject(projectId)); } catch (e) { return err(e); } }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("mcp-server-xero running on stdio");
}

main().catch((e) => {
  console.error("Fatal error starting mcp-server-xero:", e);
  process.exit(1);
});

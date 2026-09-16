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

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("mcp-server-xero running on stdio");
}

main().catch((e) => {
  console.error("Fatal error starting mcp-server-xero:", e);
  process.exit(1);
});

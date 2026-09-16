#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { AbsClient } from "./client.js";

const server = new McpServer({ name: "mcp-server-abs", version: "0.1.0" });
const abs = new AbsClient();

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}
function err(e: unknown) {
  const message = e instanceof Error ? e.message : String(e);
  return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
}

server.registerTool(
  "abs_list_dataflows",
  {
    title: "List ABS dataflows (datasets)",
    description:
      "List available datasets from the Australian Bureau of Statistics — 1200+ official datasets covering economic, social, and Census data. Optionally filter by a search term matched against dataset name/id. This is the first step of ABS's own recommended workflow: list dataflows to find the one you want, then call abs_get_dataflow_structure to learn its valid query codes, then abs_get_data to actually fetch numbers.",
    inputSchema: {
      searchTerm: z.string().optional().describe("Optional filter, e.g. 'unemployment', 'CPI', 'population'"),
    },
  },
  async ({ searchTerm }) => {
    try {
      return ok(await abs.listDataflows(searchTerm));
    } catch (e) {
      return err(e);
    }
  }
);

server.registerTool(
  "abs_get_dataflow_structure",
  {
    title: "Get an ABS dataflow's structure (dimensions and valid codes)",
    description:
      "Get the dimensions and valid codes for a specific ABS dataflow — required before you can build a meaningful dataKey for abs_get_data, since ABS datasets are queried by dimension codes (e.g. region, measure, frequency), not named parameters. Call abs_list_dataflows first to find the dataflow's id.",
    inputSchema: {
      dataflowId: z.string().describe("The dataflow id, e.g. 'CPI', 'ALC', 'LF'"),
    },
  },
  async ({ dataflowId }) => {
    try {
      return ok(await abs.getDataflowStructure(dataflowId));
    } catch (e) {
      return err(e);
    }
  }
);

server.registerTool(
  "abs_get_data",
  {
    title: "Get data from an ABS dataflow",
    description:
      "Get actual statistical data from an ABS dataflow. The dataKey filters which series are returned — it's a dot-separated list of dimension codes in the order defined by the dataflow's structure (see abs_get_dataflow_structure), e.g. 'M1.AUS.Q'. Omit a code to wildcard that dimension (e.g. 'M1..Q' for all regions), or use '+' for OR (e.g. 'M1+M2.AUS.Q'). Defaults to 'all' if not given, but ABS's own API can time out or hit a 10MB response cap on 'all' for large dataflows — prefer a specific dataKey and/or startPeriod/endPeriod whenever you know what you're after.",
    inputSchema: {
      dataflowId: z.string().describe("The dataflow id, e.g. 'CPI', 'ALC', 'LF'"),
      dataKey: z.string().optional().describe("Dot-separated dimension codes, e.g. 'M1.AUS.Q'. Defaults to 'all'."),
      startPeriod: z.string().optional().describe("e.g. '2020', '2020-Q1', '2020-01'"),
      endPeriod: z.string().optional(),
      detail: z.enum(["full", "dataonly", "serieskeysonly", "nodata"]).optional(),
    },
  },
  async ({ dataflowId, dataKey, startPeriod, endPeriod, detail }) => {
    try {
      return ok(await abs.getData(dataflowId, dataKey, { startPeriod, endPeriod, detail }));
    } catch (e) {
      return err(e);
    }
  }
);

server.registerTool(
  "abs_get_cpi",
  {
    title: "Get Australia's Consumer Price Index (CPI)",
    description:
      "Curated shortcut for Australia's CPI — no SDMX codes needed, just plain-English category/region/measure/adjustment. Dimension codes are hardcoded from CPI's real structure, confirmed by testing. Always quarterly (CPI's own publication frequency); for the monthly indicator use abs_get_data directly on dataflow 'CPI_M'.",
    inputSchema: {
      category: z
        .enum([
          "all_groups", "food_and_non_alcoholic_beverages", "alcohol_and_tobacco", "clothing_and_footwear",
          "housing", "furnishings_and_household_equipment", "health", "transport", "communication",
          "recreation_and_culture", "education", "insurance_and_financial_services",
        ])
        .optional()
        .describe("Defaults to 'all_groups' (the headline CPI figure)"),
      region: z.enum(["australia", "sydney", "melbourne", "brisbane", "adelaide", "perth", "hobart", "darwin", "canberra"]).optional(),
      measure: z.enum(["index_numbers", "pct_change_previous_period", "pct_change_previous_year"]).optional(),
      adjustment: z.enum(["original", "seasonally_adjusted", "trend"]).optional(),
      startPeriod: z.string().optional().describe("e.g. '2024', '2024-Q1'"),
      endPeriod: z.string().optional(),
    },
  },
  async (args) => {
    try {
      return ok(await abs.getCpi(args));
    } catch (e) {
      return err(e);
    }
  }
);

server.registerTool(
  "abs_get_population",
  {
    title: "Get Australia's Estimated Resident Population (quarterly)",
    description:
      "Curated shortcut for Australia's official population estimates (ERP_Q dataflow). UNLIKE abs_get_cpi, this dataflow's exact codes have not been confirmed by real testing yet — it looks up the dataflow's real structure at call time and matches region/sex against whatever codes actually exist, rather than risk hardcoded values that were never verified. This means it's slower (two API calls) but self-correcting.",
    inputSchema: {
      region: z.string().optional().describe("e.g. 'New South Wales', 'Victoria', 'Australia' — matched against ERP_Q's real region codelist"),
      sex: z.string().optional().describe("e.g. 'male', 'female', 'persons' — matched against ERP_Q's real sex codelist"),
      startPeriod: z.string().optional(),
      endPeriod: z.string().optional(),
    },
  },
  async (args) => {
    try {
      return ok(await abs.getPopulation(args));
    } catch (e) {
      return err(e);
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("mcp-server-abs running on stdio");
}

main().catch((e) => {
  console.error("Fatal error starting mcp-server-abs:", e);
  process.exit(1);
});

import { apiRequest } from "@urdigital/mcp-server-shared";

/**
 * ABS (Australian Bureau of Statistics) Data API — SDMX 2.1 compliant,
 * fully open, no API key required.
 *
 * Base URL confirmed against ABS's own documentation as of this writing:
 * https://data.api.abs.gov.au/rest/ — ABS migrated from the older
 * api.data.abs.gov.au host in a November 2024 update; some of ABS's own
 * indexed pages still reference the old host, so this was verified against
 * multiple independent current sources (their worked-examples tutorial,
 * their OpenAPI spec, and the live service root) rather than any single one.
 *
 * Known ABS API Gateway limits (not this code's choice):
 * - 30 second max response time, 10MB max response size — a query with
 *   dataKey "all" and no date range on a large dataflow can hit these.
 * - dataKey portion of the URL is capped at 5,000 characters.
 * Tools should encourage narrow queries (specific dataKey, startPeriod/
 * endPeriod) rather than requesting everything.
 */
const BASE_URL = "https://data.api.abs.gov.au/rest";

// Metadata endpoints (dataflow, datastructure) use the "accept" header to
// select JSON, per ABS's docs — NOT the "format" query param, which is
// documented only for the /data endpoint.
const STRUCTURE_JSON_ACCEPT = "application/vnd.sdmx.structure+json";

export interface AbsQueryOptions {
  startPeriod?: string;
  endPeriod?: string;
  /** full (default): series+observations+attributes. dataonly / serieskeysonly / nodata trim what's returned. */
  detail?: "full" | "dataonly" | "serieskeysonly" | "nodata";
}

export class AbsClient {
  // No credentials needed — the Data API is fully open. If/when the
  // Indicator API is added later, that one DOES need a key (requested via
  // email + signed terms from ABS) and would need its own auth here.

  /**
   * Lists available dataflows (datasets). Returns the raw SDMX-JSON
   * structure response — the exact shape is confirmed by testing against
   * the real API rather than assumed, since SDMX-JSON structure message
   * shapes aren't something to guess at with full confidence from docs
   * alone. searchTerm, if given, does a best-effort client-side filter
   * over whatever array shape comes back; if that shape doesn't match
   * what's expected, the raw response is returned instead so nothing is
   * silently lost.
   */
  async listDataflows(searchTerm?: string) {
    const raw = await apiRequest<any>(`${BASE_URL}/dataflow/all`, {
      headers: { Accept: STRUCTURE_JSON_ACCEPT },
      query: { detail: "allstubs" },
    });

    if (!searchTerm) return raw;

    const candidateArrays = [raw?.data?.dataflows, raw?.dataflows, raw?.structures?.dataflows].filter(Array.isArray);
    const dataflows = candidateArrays[0];
    if (!dataflows) return raw; // shape didn't match what we expected — return raw rather than lose data

    const term = searchTerm.toLowerCase();
    return dataflows.filter((df: any) => {
      const name = typeof df?.name === "string" ? df.name : (df?.names?.en ?? "");
      const id = df?.id ?? "";
      return String(name).toLowerCase().includes(term) || String(id).toLowerCase().includes(term);
    });
  }

  /**
   * Gets the Data Structure Definition (dimensions, codelists) for a
   * dataflow — needed to know what codes are valid before building a
   * dataKey for getData(). Mirrors ABS's own recommended "data discovery"
   * workflow: list dataflows, inspect structure, then query data.
   */
  async getDataflowStructure(dataflowId: string) {
    return apiRequest(`${BASE_URL}/datastructure/ABS/${dataflowId}`, {
      headers: { Accept: STRUCTURE_JSON_ACCEPT },
      query: { references: "children" },
    });
  }

  /**
   * Gets actual data for a dataflow. dataKey defaults to "all" — per
   * ABS's own docs, "all" can be slow or hit the gateway's size/time
   * limits on large dataflows, so narrowing with startPeriod/endPeriod
   * and/or a specific dataKey is strongly preferred over "all" whenever
   * the caller knows what they're after.
   */
  async getData(dataflowId: string, dataKey = "all", options: AbsQueryOptions = {}) {
    return apiRequest(`${BASE_URL}/data/${dataflowId}/${dataKey}`, {
      query: {
        startPeriod: options.startPeriod,
        endPeriod: options.endPeriod,
        detail: options.detail,
        format: "jsondata",
      },
    });
  }

  // ==================== Curated shortcuts ====================
  // Plain-English wrappers over getData for a couple of the most commonly
  // wanted series, so a caller doesn't need to know SDMX dataKey syntax
  // for these specific cases. Everything above still works for any other
  // dataflow — these are convenience only, not a replacement.

  /**
   * Australia's Consumer Price Index. Dimension order and codes below are
   * hardcoded from CPI's REAL structure response, confirmed by testing
   * (see this package's README) — not guessed. CPI's dataKey order is
   * MEASURE.INDEX.TSEST.REGION.FREQ; FREQ is fixed at "Q" since this
   * dataflow only publishes quarterly (there's a separate CPI_M dataflow
   * for the monthly indicator, not wrapped here).
   */
  async getCpi(options: {
    category?: keyof typeof AbsClient.CPI_CATEGORY_CODES;
    region?: keyof typeof AbsClient.CPI_REGION_CODES;
    measure?: keyof typeof AbsClient.CPI_MEASURE_CODES;
    adjustment?: keyof typeof AbsClient.CPI_ADJUSTMENT_CODES;
    startPeriod?: string;
    endPeriod?: string;
  } = {}) {
    const measureCode = AbsClient.CPI_MEASURE_CODES[options.measure ?? "index_numbers"];
    const categoryCode = AbsClient.CPI_CATEGORY_CODES[options.category ?? "all_groups"];
    const adjustmentCode = AbsClient.CPI_ADJUSTMENT_CODES[options.adjustment ?? "original"];
    const regionCode = AbsClient.CPI_REGION_CODES[options.region ?? "australia"];

    const dataKey = `${measureCode}.${categoryCode}.${adjustmentCode}.${regionCode}.Q`;
    return this.getData("CPI", dataKey, { startPeriod: options.startPeriod, endPeriod: options.endPeriod });
  }

  static readonly CPI_MEASURE_CODES = {
    index_numbers: "1",
    pct_change_previous_period: "2",
    pct_change_previous_year: "3",
  } as const;

  static readonly CPI_CATEGORY_CODES = {
    all_groups: "10001",
    food_and_non_alcoholic_beverages: "20001",
    alcohol_and_tobacco: "20006",
    clothing_and_footwear: "20002",
    housing: "20003",
    furnishings_and_household_equipment: "20004",
    health: "115486",
    transport: "20005",
    communication: "115488",
    recreation_and_culture: "115489",
    education: "115493",
    insurance_and_financial_services: "126670",
  } as const;

  static readonly CPI_ADJUSTMENT_CODES = {
    original: "10",
    seasonally_adjusted: "20",
    trend: "30",
  } as const;

  static readonly CPI_REGION_CODES = {
    australia: "50",
    sydney: "1",
    melbourne: "2",
    brisbane: "3",
    adelaide: "4",
    perth: "5",
    hobart: "6",
    darwin: "7",
    canberra: "8",
  } as const;

  /**
   * Quarterly Estimated Resident Population (ERP_Q). UNLIKE getCpi above,
   * this does NOT hardcode dimension codes — ERP_Q's real structure
   * hasn't been fetched and confirmed the way CPI's has (see this
   * package's README for status). Instead, this looks up the dataflow's
   * actual structure at call time and matches the given region/sex
   * against whatever codes really exist, so it self-corrects rather than
   * risk hardcoded codes that were never verified against the real API.
   * This does mean two API calls instead of one (structure, then data).
   */
  async getPopulation(options: { region?: string; sex?: string; startPeriod?: string; endPeriod?: string } = {}) {
    const structure = await this.getDataflowStructure("ERP_Q");
    const dataKey = buildDataKeyFromFriendlyFilters(structure, {
      REGION: options.region,
      STATE: options.region,
      SEX: options.sex,
    });
    return this.getData("ERP_Q", dataKey, { startPeriod: options.startPeriod, endPeriod: options.endPeriod });
  }
}

/**
 * Given an SDMX structure response and a map of {dimensionIdKeyword: friendlyValue},
 * builds a dot-separated dataKey in the dataflow's real dimension order —
 * looking up each dimension's actual codelist and matching the friendly
 * value against real code names, rather than assuming positions or codes.
 * Dimensions with no matching filter are wildcarded (left empty).
 */
function buildDataKeyFromFriendlyFilters(structure: any, filters: Record<string, string | undefined>): string {
  const dsd = structure?.data?.dataStructures?.[0];
  const dimensions = dsd?.dataStructureComponents?.dimensionList?.dimensions ?? [];
  const codelists = structure?.data?.codelists ?? [];

  const sorted = [...dimensions].sort((a: any, b: any) => a.position - b.position);

  const parts = sorted.map((dim: any) => {
    const filterKey = Object.keys(filters).find((k) => dim.id?.toUpperCase().includes(k.toUpperCase()));
    const friendlyValue = filterKey ? filters[filterKey] : undefined;
    if (!friendlyValue) return ""; // wildcard this dimension

    const enumUrn: string | undefined = dim?.localRepresentation?.enumeration;
    const codelistIdMatch = enumUrn?.match(/Codelist=[A-Z]+:([A-Z0-9_]+)/);
    const codelistId = codelistIdMatch?.[1];
    const codelist = codelists.find((cl: any) => cl.id === codelistId);
    if (!codelist) return "";

    const term = friendlyValue.toLowerCase();
    const code = codelist.codes?.find((c: any) => {
      const name = typeof c.name === "string" ? c.name : (c.names?.en ?? "");
      return String(name).toLowerCase().includes(term) || String(c.id).toLowerCase() === term;
    });
    return code?.id ?? "";
  });

  return parts.join(".");
}

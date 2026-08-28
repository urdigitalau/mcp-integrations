import { apiRequest, requireEnv } from "@urdigital/mcp-server-shared";

/**
 * Microsoft Clarity Data Export API.
 *
 * Auth: bearer token scoped to a single project. Generate in
 * Clarity -> Settings -> Data Export -> Generate new API token.
 *
 * Hard platform limits (not this code's choice — Clarity enforces these):
 * - numOfDays only accepts 1, 2, or 3 (last 24/48/72 hours). Older data
 *   is not retrievable through this endpoint at all.
 * - Up to 3 breakdown dimensions per call.
 * - ~10 requests/day/project quota.
 */
const BASE_URL = "https://www.clarity.ms/export-data/api/v1/project-live-insights";

export type ClarityDimension =
  | "Browser"
  | "Device"
  | "Country"
  | "OS"
  | "Source"
  | "Medium"
  | "Campaign"
  | "Channel"
  | "URL";

export class ClarityClient {
  private token: string;

  constructor() {
    this.token = requireEnv("CLARITY_API_TOKEN");
  }

  getProjectInsights(params: { numOfDays: 1 | 2 | 3; dimension1?: ClarityDimension; dimension2?: ClarityDimension; dimension3?: ClarityDimension }) {
    return apiRequest(BASE_URL, {
      headers: { Authorization: `Bearer ${this.token}` },
      query: {
        numOfDays: params.numOfDays,
        dimension1: params.dimension1,
        dimension2: params.dimension2,
        dimension3: params.dimension3,
      },
    });
  }
}

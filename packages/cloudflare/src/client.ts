import { apiRequest, requireEnv } from "@urdigital/mcp-server-shared";

/**
 * Cloudflare GraphQL Analytics API.
 *
 * Auth: Bearer token, scoped to Zone -> Analytics -> Read for the specific
 * zone(s) you want data from. Generate at dash.cloudflare.com -> My Profile
 * -> API Tokens -> Create Custom Token.
 *
 * Important quirk of GraphQL APIs in general, Cloudflare's included: a
 * request that fails at the QUERY level (bad field name, bad filter, etc.)
 * still comes back with HTTP 200 — the failure shows up in an `errors`
 * array in the response body instead. A plain HTTP-status check (like the
 * shared apiRequest helper does) will NOT catch this, so this client
 * checks for `errors` explicitly on every call.
 */
const GRAPHQL_ENDPOINT = "https://api.cloudflare.com/client/v4/graphql";

interface GraphQLResponse<T> {
  data?: T;
  errors?: { message: string }[];
}

export class CloudflareClient {
  private token: string;
  private zoneId: string;

  constructor() {
    this.token = requireEnv("CLOUDFLARE_API_TOKEN");
    this.zoneId = requireEnv("CLOUDFLARE_ZONE_ID");
  }

  private async graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const result = await apiRequest<GraphQLResponse<T>>(GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}` },
      body: { query, variables },
    });

    if (result.errors && result.errors.length > 0) {
      throw new Error(`Cloudflare GraphQL error: ${result.errors.map((e) => e.message).join("; ")}`);
    }
    if (!result.data) {
      throw new Error("Cloudflare GraphQL returned no data and no error — unexpected empty response.");
    }
    return result.data;
  }

  /**
   * Daily traffic summary for the configured zone: requests, cache hit
   * counts, bandwidth, page views, and threats blocked, one row per day.
   */
  async getTrafficStats(since: string, until: string, limit = 30) {
    const query = `
      query TrafficStats($zoneTag: String!, $since: Date!, $until: Date!, $limit: Int!) {
        viewer {
          zones(filter: { zoneTag: $zoneTag }) {
            httpRequests1dGroups(
              filter: { date_geq: $since, date_leq: $until }
              orderBy: [date_ASC]
              limit: $limit
            ) {
              dimensions { date }
              sum {
                requests
                cachedRequests
                bytes
                cachedBytes
                pageViews
                threats
              }
              uniq { uniques }
            }
          }
        }
      }
    `;
    const data = await this.graphql<{
      viewer: { zones: { httpRequests1dGroups: unknown[] }[] };
    }>(query, { zoneTag: this.zoneId, since, until, limit });

    return data.viewer.zones[0]?.httpRequests1dGroups ?? [];
  }

  /**
   * Hourly traffic breakdown — same metrics as getTrafficStats but at
   * hourly granularity, useful for pinpointing when in a day something
   * unusual happened (e.g. a threat spike) rather than just which day.
   */
  async getHourlyTrafficStats(sinceIso: string, untilIso: string, limit = 48) {
    const query = `
      query HourlyTrafficStats($zoneTag: String!, $since: Time!, $until: Time!, $limit: Int!) {
        viewer {
          zones(filter: { zoneTag: $zoneTag }) {
            httpRequests1hGroups(
              filter: { datetime_geq: $since, datetime_leq: $until }
              orderBy: [datetime_ASC]
              limit: $limit
            ) {
              dimensions { datetime }
              sum {
                requests
                cachedRequests
                bytes
                pageViews
                threats
              }
              uniq { uniques }
            }
          }
        }
      }
    `;
    const data = await this.graphql<{
      viewer: { zones: { httpRequests1hGroups: unknown[] }[] };
    }>(query, { zoneTag: this.zoneId, since: sinceIso, until: untilIso, limit });

    return data.viewer.zones[0]?.httpRequests1hGroups ?? [];
  }

  /**
   * Security/firewall events grouped by action taken (block, challenge,
   * allow, etc.), country, and ASN — the natural follow-up when
   * getTrafficStats shows an unusual threats spike, to see what actually
   * triggered it.
   */
  async getSecurityEvents(sinceIso: string, untilIso: string, limit = 50) {
    const query = `
      query SecurityEvents($zoneTag: String!, $since: Time!, $until: Time!, $limit: Int!) {
        viewer {
          zones(filter: { zoneTag: $zoneTag }) {
            firewallEventsAdaptiveGroups(
              filter: { datetime_geq: $since, datetime_leq: $until }
              orderBy: [count_DESC]
              limit: $limit
            ) {
              count
              dimensions {
                action
                clientCountryName
                clientASNDescription
              }
            }
          }
        }
      }
    `;
    const data = await this.graphql<{
      viewer: { zones: { firewallEventsAdaptiveGroups: unknown[] }[] };
    }>(query, { zoneTag: this.zoneId, since: sinceIso, until: untilIso, limit });

    return data.viewer.zones[0]?.firewallEventsAdaptiveGroups ?? [];
  }

  /** Traffic broken down by client country, sorted by visit volume. */
  async getTrafficByCountry(sinceIso: string, untilIso: string, limit = 50) {
    const query = `
      query TrafficByCountry($zoneTag: String!, $since: Time!, $until: Time!, $limit: Int!) {
        viewer {
          zones(filter: { zoneTag: $zoneTag }) {
            httpRequestsAdaptiveGroups(
              filter: { datetime_geq: $since, datetime_leq: $until }
              orderBy: [sum_visits_DESC]
              limit: $limit
            ) {
              sum { visits edgeResponseBytes }
              dimensions { clientCountryName }
            }
          }
        }
      }
    `;
    const data = await this.graphql<{
      viewer: { zones: { httpRequestsAdaptiveGroups: unknown[] }[] };
    }>(query, { zoneTag: this.zoneId, since: sinceIso, until: untilIso, limit });

    return data.viewer.zones[0]?.httpRequestsAdaptiveGroups ?? [];
  }

  /** Traffic broken down by HTTP response status code — useful for spotting a spike in 4xx/5xx errors. */
  async getTrafficByStatusCode(sinceIso: string, untilIso: string, limit = 50) {
    const query = `
      query TrafficByStatus($zoneTag: String!, $since: Time!, $until: Time!, $limit: Int!) {
        viewer {
          zones(filter: { zoneTag: $zoneTag }) {
            httpRequestsAdaptiveGroups(
              filter: { datetime_geq: $since, datetime_leq: $until }
              orderBy: [sum_visits_DESC]
              limit: $limit
            ) {
              sum { visits }
              dimensions { edgeResponseStatus }
            }
          }
        }
      }
    `;
    const data = await this.graphql<{
      viewer: { zones: { httpRequestsAdaptiveGroups: unknown[] }[] };
    }>(query, { zoneTag: this.zoneId, since: sinceIso, until: untilIso, limit });

    return data.viewer.zones[0]?.httpRequestsAdaptiveGroups ?? [];
  }
}

import { apiRequest, requireEnv } from "@urdigital/mcp-server-shared";

/**
 * Bing Webmaster Tools API.
 *
 * Note: Microsoft is retiring the legacy SOAP/POX endpoints on 2026-08-31.
 * This client only targets the JSON/HTTP (REST) surface, which Microsoft
 * says has full functional parity with the legacy APIs.
 *
 * Auth: API key as a query string param. Generate one in
 * Bing Webmaster Tools -> Settings -> API Access.
 * (OAuth 2.0 bearer tokens are also supported by the API but are not
 * implemented here yet — PRs welcome.)
 */
const BASE_URL = "https://ssl.bing.com/webmaster/api.svc/json";

export class BingWebmasterClient {
  private apiKey: string;

  constructor() {
    this.apiKey = requireEnv("BING_WEBMASTER_API_KEY");
  }

  private call<T = unknown>(method: string, extraQuery: Record<string, string | number | undefined> = {}, opts: { httpMethod?: "GET" | "POST"; body?: unknown } = {}) {
    return apiRequest<T>(`${BASE_URL}/${method}`, {
      method: opts.httpMethod ?? "GET",
      query: { apikey: this.apiKey, ...extraQuery },
      body: opts.body,
    });
  }

  listSites() {
    return this.call("GetUserSites");
  }

  getRankAndTrafficStats(siteUrl: string) {
    return this.call("GetRankAndTrafficStats", { siteUrl });
  }

  getQueryStats(siteUrl: string) {
    return this.call("GetQueryStats", { siteUrl });
  }

  getPageStats(siteUrl: string) {
    return this.call("GetPageStats", { siteUrl });
  }

  getCrawlIssues(siteUrl: string) {
    return this.call("GetCrawlIssues", { siteUrl });
  }

  getUrlInfo(siteUrl: string, url: string) {
    return this.call("GetUrlInfo", { siteUrl, url });
  }

     submitUrl(siteUrl: string, url: string) {
    return this.call(
      "SubmitUrl",
      {},
      { httpMethod: "POST", body: { siteUrl, url } }
    );
  }

  submitSitemap(siteUrl: string, feedUrl: string) {
    return this.call(
      "SubmitFeed",
      { },
      { httpMethod: "POST", body: { siteUrl, feedUrl } }
    );
  }

  getKeywordStats(query: string, country?: string, language?: string) {
    return this.call("GetKeywordStats", { q: query, country, language });
  }
}

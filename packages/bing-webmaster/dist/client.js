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
    apiKey;
    constructor() {
        this.apiKey = requireEnv("BING_WEBMASTER_API_KEY");
    }
    call(method, extraQuery = {}, opts = {}) {
        return apiRequest(`${BASE_URL}/${method}`, {
            method: opts.httpMethod ?? "GET",
            query: { apikey: this.apiKey, ...extraQuery },
            body: opts.body,
        });
    }
    listSites() {
        return this.call("GetUserSites");
    }
    getRankAndTrafficStats(siteUrl) {
        return this.call("GetRankAndTrafficStats", { siteUrl });
    }
    getQueryStats(siteUrl) {
        return this.call("GetQueryStats", { siteUrl });
    }
    getPageStats(siteUrl) {
        return this.call("GetPageStats", { siteUrl });
    }
    getCrawlIssues(siteUrl) {
        return this.call("GetCrawlIssues", { siteUrl });
    }
    getUrlInfo(siteUrl, url) {
        return this.call("GetUrlInfo", { siteUrl, url });
    }
    submitUrl(siteUrl, url) {
        return this.call("SubmitUrl", {}, { httpMethod: "POST", body: { siteUrl, url } });
    }
    submitSitemap(siteUrl, feedUrl) {
        return this.call("SubmitFeed", {}, { httpMethod: "POST", body: { siteUrl, feedUrl } });
    }
    getKeywordStats(query, country, language) {
        return this.call("GetKeywordStats", { q: query, country, language });
    }
}

export declare class BingWebmasterClient {
    private apiKey;
    constructor();
    private call;
    listSites(): Promise<unknown>;
    getRankAndTrafficStats(siteUrl: string): Promise<unknown>;
    getQueryStats(siteUrl: string): Promise<unknown>;
    getPageStats(siteUrl: string): Promise<unknown>;
    getCrawlIssues(siteUrl: string): Promise<unknown>;
    getUrlInfo(siteUrl: string, url: string): Promise<unknown>;
    submitUrl(siteUrl: string, url: string): Promise<unknown>;
    submitSitemap(siteUrl: string, feedUrl: string): Promise<unknown>;
    getKeywordStats(query: string, country?: string, language?: string): Promise<unknown>;
}

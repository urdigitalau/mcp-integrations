export type ClarityDimension = "Browser" | "Device" | "Country" | "OS" | "Source" | "Medium" | "Campaign" | "Channel" | "URL";
export declare class ClarityClient {
    private token;
    constructor();
    getProjectInsights(params: {
        numOfDays: 1 | 2 | 3;
        dimension1?: ClarityDimension;
        dimension2?: ClarityDimension;
        dimension3?: ClarityDimension;
    }): Promise<unknown>;
}

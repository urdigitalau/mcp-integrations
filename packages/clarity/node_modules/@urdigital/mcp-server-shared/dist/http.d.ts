export interface RequestOptions {
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    headers?: Record<string, string>;
    query?: Record<string, string | number | boolean | undefined>;
    body?: unknown;
    /** Max retry attempts on 429/5xx before giving up. Default 3. */
    maxRetries?: number;
}
export declare class ApiError extends Error {
    status: number;
    body: unknown;
    constructor(message: string, status: number, body: unknown);
}
/**
 * Minimal fetch wrapper shared by every connector in this repo:
 * - honors 429 Retry-After
 * - retries transient 5xx with exponential backoff
 * - throws ApiError with the parsed body so tool handlers can surface
 *   useful messages back to the model instead of a raw stack trace.
 */
export declare function apiRequest<T = unknown>(url: string, options?: RequestOptions): Promise<T>;

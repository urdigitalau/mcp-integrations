/**
 * Reads a required environment variable or throws a clear, actionable error.
 * Every server in this repo reads its credentials from env vars only —
 * never accept secrets as tool arguments, since tool arguments can end up
 * in model context, logs, or client-side history.
 */
export declare function requireEnv(name: string): string;
export declare function optionalEnv(name: string, fallback?: string): string | undefined;

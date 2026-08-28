export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  /** Max retry attempts on 429/5xx before giving up. Default 3. */
  maxRetries?: number;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function buildUrl(base: string, query?: RequestOptions["query"]): string {
  const url = new URL(base);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

/**
 * Minimal fetch wrapper shared by every connector in this repo:
 * - honors 429 Retry-After
 * - retries transient 5xx with exponential backoff
 * - throws ApiError with the parsed body so tool handlers can surface
 *   useful messages back to the model instead of a raw stack trace.
 */
export async function apiRequest<T = unknown>(url: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", headers = {}, query, body, maxRetries = 3 } = options;
  const fullUrl = buildUrl(url, query);

  let attempt = 0;
  while (true) {
    const res = await fetch(fullUrl, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (res.ok) {
      const text = await res.text();
      return (text ? JSON.parse(text) : undefined) as T;
    }

    const shouldRetry = (res.status === 429 || res.status >= 500) && attempt < maxRetries;
    if (!shouldRetry) {
      let parsedBody: unknown;
      try {
        parsedBody = await res.json();
      } catch {
        parsedBody = await res.text().catch(() => undefined);
      }
      throw new ApiError(`Request to ${fullUrl} failed with ${res.status}`, res.status, parsedBody);
    }

    const retryAfter = Number(res.headers.get("retry-after"));
    const delayMs = retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 500;
    await new Promise((r) => setTimeout(r, delayMs));
    attempt++;
  }
}

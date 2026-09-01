# @urdigital/mcp-server-shared

Internal shared utilities used by every `@urdigital/mcp-server-*` package
in this monorepo. Not meant to be installed standalone for its own sake —
it exists so HTTP handling, env var handling, and URL-safety checks are
written once and shared, rather than re-implemented slightly differently in
every new integration.

## What's in here

### `apiRequest` (`http.ts`)

A fetch wrapper with retry/backoff on 429/5xx responses, and a
`ApiError` class carrying the HTTP status and parsed response body.

**Security note:** error messages thrown by `apiRequest` intentionally
**strip the query string** from the URL before including it in the
message. Several APIs this repo talks to (Bing Webmaster Tools included)
put API keys directly in the query string rather than a header — if the
full URL were included in an error, that key would flow straight into
whatever reads the error text (an AI model's response, chat logs,
transcripts). This was a real issue, found and fixed after a code review
flagged it — see the git history around the `0.1.2` version bump for
details.

### `requireEnv` / `optionalEnv` (`env.ts`)

Small helpers for reading required/optional environment variables with a
clear error if a required one is missing.

### `assertSafePublicHttpsUrl` / `fetchWithSizeLimit` (`ssrf.ts`)

SSRF (Server-Side Request Forgery) protection for any tool that fetches a
URL supplied by the caller — for example, `wordpress`'s `wp_upload_media`,
which downloads a URL and re-uploads it. **Any new integration that adds a
similar "fetch this URL the caller gave you" tool must use these before
fetching, not fetch directly.**

`assertSafePublicHttpsUrl(url)`:
- Rejects anything that isn't `https://` (blocks `http://`, `file://`,
  `ftp://`, etc.)
- Resolves the hostname and rejects it if it points at a private, loopback,
  link-local, or otherwise reserved address — including `169.254.169.254`
  and its equivalents, which expose cloud instance credentials (AWS, GCP,
  etc.) on many cloud VMs if reachable.
- Handles IPv4-mapped IPv6 addresses (`::ffff:169.254.169.254`) so they
  can't slip past an IPv6-only check.

`fetchWithSizeLimit(url, maxBytes)`:
- Enforces a byte cap while **streaming**, not by trusting a
  `Content-Length` header a malicious or misconfigured server could lie
  about or omit. Confirmed by testing against a server that declared a
  false low Content-Length while sending far more real data, and against
  an unbounded chunked-encoding stream with no Content-Length at all —
  both are caught correctly.

**Known limitation, stated plainly:** the hostname is resolved once for
validation, then `fetch()` resolves it again independently when it
actually connects. A DNS record with a very short TTL could theoretically
resolve differently between those two lookups ("DNS rebinding"). Fully
closing that requires pinning the connection to the specific validated IP
(e.g. a custom DNS lookup passed to an HTTP agent) — a real, if narrow,
gap, called out here rather than glossed over as if this were airtight.

## License

MIT

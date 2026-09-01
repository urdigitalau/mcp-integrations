import { lookup } from "node:dns/promises";

/**
 * SSRF (Server-Side Request Forgery) protection for any tool that fetches
 * a URL supplied by the caller (e.g. an AI model, which may itself be
 * influenced by untrusted content it's reading). Without this, a tool
 * like "download this URL and upload it somewhere" can be pointed at
 * internal services, localhost, or cloud metadata endpoints
 * (169.254.169.254 exposes AWS/GCP credentials on many cloud VMs) — the
 * request happens from wherever this server runs, with whatever network
 * access it has, not from the caller's machine.
 *
 * Mitigations applied:
 * 1. Scheme must be https (blocks http, file://, ftp://, gopher://, etc.
 *    — several of which have their own historical SSRF/exploit history).
 * 2. Hostname is resolved via DNS, and EVERY resolved address (a name can
 *    resolve to multiple IPs) is checked against private/reserved ranges.
 * 3. IPv4-mapped IPv6 addresses (::ffff:169.254.169.254) are unwrapped and
 *    checked against the same IPv4 rules, since checking only the IPv6
 *    form would miss this.
 *
 * Known residual limitation, stated plainly rather than glossed over:
 * this checks the IP at validation time, then fetch() resolves the
 * hostname again independently when it actually connects. A DNS record
 * with a very short TTL could theoretically resolve to a public IP for
 * this check and a private IP moments later ("DNS rebinding"). Closing
 * that completely requires pinning the connection to the specific IP we
 * validated (e.g. a custom dns.lookup override passed to an HTTP agent),
 * which is meaningfully more complex — call it out as a follow-up rather
 * than silently shipping a partial fix as if it were complete.
 */

const BLOCKED_HOSTNAMES = new Set(["localhost", "metadata.google.internal"]);

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

function ipv4ToInt(ip: string): number {
  const parts = ip.split(".").map(Number);
  return (parts[0] << 24) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

function inIpv4Range(ip: string, base: string, prefixLength: number): boolean {
  const ipInt = ipv4ToInt(ip);
  const baseInt = ipv4ToInt(base);
  const mask = prefixLength === 0 ? 0 : (~0 << (32 - prefixLength)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

function isPrivateOrReservedIpv4(ip: string): boolean {
  const ranges: [string, number][] = [
    ["0.0.0.0", 8], // "this" network
    ["10.0.0.0", 8], // private
    ["100.64.0.0", 10], // carrier-grade NAT
    ["127.0.0.0", 8], // loopback
    ["169.254.0.0", 16], // link-local — includes 169.254.169.254 cloud metadata
    ["172.16.0.0", 12], // private
    ["192.0.0.0", 24], // IETF protocol assignments
    ["192.0.2.0", 24], // TEST-NET-1
    ["192.168.0.0", 16], // private
    ["198.18.0.0", 15], // benchmarking
    ["198.51.100.0", 24], // TEST-NET-2
    ["203.0.113.0", 24], // TEST-NET-3
    ["224.0.0.0", 4], // multicast
    ["240.0.0.0", 4], // reserved
    ["255.255.255.255", 32], // broadcast
  ];
  return ranges.some(([base, prefix]) => inIpv4Range(ip, base, prefix));
}

function isPrivateOrReservedIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();

  // IPv4-mapped IPv6 (::ffff:169.254.169.254) — unwrap and check as IPv4,
  // since a naive IPv6-only check would let these slip through.
  const mappedMatch = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mappedMatch) return isPrivateOrReservedIpv4(mappedMatch[1]);

  if (lower === "::1" || lower === "::") return true; // loopback / unspecified
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local (fc00::/7)
  if (lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) return true; // link-local (fe80::/10)
  if (lower.startsWith("ff")) return true; // multicast (ff00::/8)

  return false;
}

/**
 * Throws UnsafeUrlError if the URL is not safe to fetch server-side.
 * Call this BEFORE fetching any caller-supplied URL.
 */
export async function assertSafePublicHttpsUrl(urlString: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    throw new UnsafeUrlError(`Not a valid URL: ${urlString}`);
  }

  if (url.protocol !== "https:") {
    throw new UnsafeUrlError(`Only https:// URLs are allowed (got "${url.protocol}"). This prevents file://, http://, and other schemes from reaching internal or local resources.`);
  }

  if (BLOCKED_HOSTNAMES.has(url.hostname.toLowerCase())) {
    throw new UnsafeUrlError(`Hostname "${url.hostname}" is blocked.`);
  }

  let addresses: { address: string; family: number }[];
  try {
    addresses = await lookup(url.hostname, { all: true });
  } catch {
    throw new UnsafeUrlError(`Could not resolve hostname "${url.hostname}".`);
  }

  if (addresses.length === 0) {
    throw new UnsafeUrlError(`Hostname "${url.hostname}" resolved to no addresses.`);
  }

  for (const { address, family } of addresses) {
    const isUnsafe = family === 4 ? isPrivateOrReservedIpv4(address) : isPrivateOrReservedIpv6(address);
    if (isUnsafe) {
      throw new UnsafeUrlError(`Hostname "${url.hostname}" resolves to ${address}, which is a private/reserved/internal address. Refusing to fetch it — this could otherwise be used to reach internal services, localhost, or cloud metadata endpoints from this server.`);
    }
  }
}

/**
 * Fetches a URL with a hard cap on response size, enforced while streaming
 * (not just by trusting a Content-Length header, which a malicious or
 * compromised server could lie about or omit entirely).
 */
export async function fetchWithSizeLimit(url: string, maxBytes: number): Promise<{ buffer: Buffer; contentType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed: HTTP ${res.status}`);

  const declaredLength = Number(res.headers.get("content-length"));
  if (declaredLength > maxBytes) {
    throw new Error(`Response declares ${declaredLength} bytes, exceeding the ${maxBytes}-byte limit.`);
  }

  if (!res.body) {
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength > maxBytes) throw new Error(`Response exceeded the ${maxBytes}-byte limit.`);
    return { buffer, contentType: res.headers.get("content-type") ?? "application/octet-stream" };
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error(`Response exceeded the ${maxBytes}-byte limit while downloading — aborted.`);
    }
    chunks.push(value);
  }

  return { buffer: Buffer.concat(chunks), contentType: res.headers.get("content-type") ?? "application/octet-stream" };
}

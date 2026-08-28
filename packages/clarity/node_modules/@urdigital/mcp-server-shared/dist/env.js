/**
 * Reads a required environment variable or throws a clear, actionable error.
 * Every server in this repo reads its credentials from env vars only —
 * never accept secrets as tool arguments, since tool arguments can end up
 * in model context, logs, or client-side history.
 */
export function requireEnv(name) {
    const value = process.env[name];
    if (!value || value.trim().length === 0) {
        throw new Error(`Missing required environment variable: ${name}. Set it in your MCP client config (e.g. claude_desktop_config.json "env" block) or a .env file loaded before start.`);
    }
    return value;
}
export function optionalEnv(name, fallback) {
    const value = process.env[name];
    return value && value.trim().length > 0 ? value : fallback;
}

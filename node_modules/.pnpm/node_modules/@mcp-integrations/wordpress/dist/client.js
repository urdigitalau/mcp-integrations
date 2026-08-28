import { apiRequest, requireEnv } from "@urdigital/mcp-server-shared";
/**
 * Auth: WordPress core Application Passwords (built in since WP 5.6).
 * Create one under wp-admin -> Users -> Profile -> Application Passwords.
 * This is Basic Auth over HTTPS, NOT your real account password.
 */
export class WordPressClient {
    baseUrl;
    authHeader;
    constructor() {
        const site = requireEnv("WORDPRESS_SITE_URL").replace(/\/$/, "");
        const username = requireEnv("WORDPRESS_USERNAME");
        const appPassword = requireEnv("WORDPRESS_APP_PASSWORD");
        this.baseUrl = `${site}/wp-json/wp/v2`;
        this.authHeader = "Basic " + Buffer.from(`${username}:${appPassword}`).toString("base64");
    }
    headers() {
        return { Authorization: this.authHeader };
    }
    listPosts(params) {
        return apiRequest(`${this.baseUrl}/posts`, {
            headers: this.headers(),
            query: {
                search: params.search,
                status: params.status ?? "publish,draft,pending,future",
                per_page: params.perPage ?? 10,
                page: params.page ?? 1,
            },
        });
    }
    getPost(id) {
        return apiRequest(`${this.baseUrl}/posts/${id}`, { headers: this.headers() });
    }
    createPost(data) {
        return apiRequest(`${this.baseUrl}/posts`, {
            method: "POST",
            headers: this.headers(),
            body: { status: "draft", ...data },
        });
    }
    updatePost(id, data) {
        return apiRequest(`${this.baseUrl}/posts/${id}`, {
            method: "POST", // WP REST API uses POST for partial updates
            headers: this.headers(),
            body: data,
        });
    }
    deletePost(id, force = false) {
        return apiRequest(`${this.baseUrl}/posts/${id}`, {
            method: "DELETE",
            headers: this.headers(),
            query: { force },
        });
    }
    listPages(params) {
        return apiRequest(`${this.baseUrl}/pages`, {
            headers: this.headers(),
            query: { search: params.search, per_page: params.perPage ?? 10, page: params.page ?? 1 },
        });
    }
    async uploadMedia(fileUrl, filename, altText) {
        // Fetch the source file, then stream it to WP as a new media item.
        const fileRes = await fetch(fileUrl);
        if (!fileRes.ok)
            throw new Error(`Could not fetch source file ${fileUrl}: HTTP ${fileRes.status}`);
        const arrayBuffer = await fileRes.arrayBuffer();
        const contentType = fileRes.headers.get("content-type") ?? "application/octet-stream";
        const res = await fetch(`${this.baseUrl}/media`, {
            method: "POST",
            headers: {
                Authorization: this.authHeader,
                "Content-Type": contentType,
                "Content-Disposition": `attachment; filename="${filename}"`,
            },
            body: Buffer.from(arrayBuffer),
        });
        const json = await res.json();
        if (!res.ok)
            throw new Error(`Media upload failed: ${JSON.stringify(json)}`);
        if (altText && json.id) {
            await apiRequest(`${this.baseUrl}/media/${json.id}`, {
                method: "POST",
                headers: this.headers(),
                body: { alt_text: altText },
            });
        }
        return json;
    }
    search(term, type) {
        return apiRequest(`${this.baseUrl}/search`, {
            headers: this.headers(),
            query: { search: term, type },
        });
    }
}

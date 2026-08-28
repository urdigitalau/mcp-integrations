import { apiRequest, requireEnv } from "@urdigital/mcp-server-shared";

/**
 * Auth: WordPress core Application Passwords (built in since WP 5.6).
 * Create one under wp-admin -> Users -> Profile -> Application Passwords.
 * This is Basic Auth over HTTPS, NOT your real account password.
 *
 * Scope note: this client intentionally does NOT include plugin/theme
 * install, activate, deactivate, or delete actions. Those are the
 * highest-risk write actions available on a WordPress site — a bad
 * activation can take a site down entirely — and are a different risk
 * category than content operations. Read-only plugin/theme listing is
 * included; nothing that changes what's installed or active.
 */
export class WordPressClient {
  private baseUrl: string;
  private authHeader: string;

  constructor() {
    const site = requireEnv("WORDPRESS_SITE_URL").replace(/\/$/, "");
    const username = requireEnv("WORDPRESS_USERNAME");
    const appPassword = requireEnv("WORDPRESS_APP_PASSWORD");
    this.baseUrl = `${site}/wp-json/wp/v2`;
    this.authHeader = "Basic " + Buffer.from(`${username}:${appPassword}`).toString("base64");
  }

  private headers() {
    return { Authorization: this.authHeader };
  }

  // ---------- Posts ----------

  listPosts(params: { search?: string; status?: string; perPage?: number; page?: number }) {
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

  getPost(id: number) {
    return apiRequest(`${this.baseUrl}/posts/${id}`, { headers: this.headers() });
  }

  createPost(data: { title: string; content: string; status?: string; excerpt?: string; categories?: number[]; tags?: number[] }) {
    return apiRequest(`${this.baseUrl}/posts`, {
      method: "POST",
      headers: this.headers(),
      body: { status: "draft", ...data },
    });
  }

  updatePost(id: number, data: Record<string, unknown>) {
    return apiRequest(`${this.baseUrl}/posts/${id}`, {
      method: "POST", // WP REST API uses POST for partial updates
      headers: this.headers(),
      body: data,
    });
  }

  deletePost(id: number, force = false) {
    return apiRequest(`${this.baseUrl}/posts/${id}`, {
      method: "DELETE",
      headers: this.headers(),
      query: { force },
    });
  }

  // ---------- Pages (previously read-only — now full CRUD) ----------

  listPages(params: { search?: string; perPage?: number; page?: number }) {
    return apiRequest(`${this.baseUrl}/pages`, {
      headers: this.headers(),
      query: { search: params.search, per_page: params.perPage ?? 10, page: params.page ?? 1 },
    });
  }

  getPage(id: number) {
    return apiRequest(`${this.baseUrl}/pages/${id}`, { headers: this.headers() });
  }

  createPage(data: { title: string; content: string; status?: string; parent?: number }) {
    return apiRequest(`${this.baseUrl}/pages`, {
      method: "POST",
      headers: this.headers(),
      body: { status: "draft", ...data },
    });
  }

  updatePage(id: number, data: Record<string, unknown>) {
    return apiRequest(`${this.baseUrl}/pages/${id}`, {
      method: "POST",
      headers: this.headers(),
      body: data,
    });
  }

  deletePage(id: number, force = false) {
    return apiRequest(`${this.baseUrl}/pages/${id}`, {
      method: "DELETE",
      headers: this.headers(),
      query: { force },
    });
  }

  // ---------- Categories ----------

  listCategories(params: { search?: string; perPage?: number; page?: number } = {}) {
    return apiRequest(`${this.baseUrl}/categories`, {
      headers: this.headers(),
      query: { search: params.search, per_page: params.perPage ?? 20, page: params.page ?? 1 },
    });
  }

  getCategory(id: number) {
    return apiRequest(`${this.baseUrl}/categories/${id}`, { headers: this.headers() });
  }

  createCategory(data: { name: string; description?: string; parent?: number }) {
    return apiRequest(`${this.baseUrl}/categories`, {
      method: "POST",
      headers: this.headers(),
      body: data,
    });
  }

  updateCategory(id: number, data: Record<string, unknown>) {
    return apiRequest(`${this.baseUrl}/categories/${id}`, {
      method: "POST",
      headers: this.headers(),
      body: data,
    });
  }

  deleteCategory(id: number, force = true) {
    // Categories have no "trash" state in WordPress — deletion is
    // effectively always permanent, so force defaults to true here
    // (unlike posts/pages, where the safe default is false).
    return apiRequest(`${this.baseUrl}/categories/${id}`, {
      method: "DELETE",
      headers: this.headers(),
      query: { force },
    });
  }

  // ---------- Tags ----------

  listTags(params: { search?: string; perPage?: number; page?: number } = {}) {
    return apiRequest(`${this.baseUrl}/tags`, {
      headers: this.headers(),
      query: { search: params.search, per_page: params.perPage ?? 20, page: params.page ?? 1 },
    });
  }

  getTag(id: number) {
    return apiRequest(`${this.baseUrl}/tags/${id}`, { headers: this.headers() });
  }

  createTag(data: { name: string; description?: string }) {
    return apiRequest(`${this.baseUrl}/tags`, {
      method: "POST",
      headers: this.headers(),
      body: data,
    });
  }

  updateTag(id: number, data: Record<string, unknown>) {
    return apiRequest(`${this.baseUrl}/tags/${id}`, {
      method: "POST",
      headers: this.headers(),
      body: data,
    });
  }

  deleteTag(id: number, force = true) {
    // Same as categories: no trash state, deletion is effectively permanent.
    return apiRequest(`${this.baseUrl}/tags/${id}`, {
      method: "DELETE",
      headers: this.headers(),
      query: { force },
    });
  }

  // ---------- Media ----------

  async uploadMedia(fileUrl: string, filename: string, altText?: string) {
    const fileRes = await fetch(fileUrl);
    if (!fileRes.ok) throw new Error(`Could not fetch source file ${fileUrl}: HTTP ${fileRes.status}`);
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
    if (!res.ok) throw new Error(`Media upload failed: ${JSON.stringify(json)}`);

    if (altText && json.id) {
      await apiRequest(`${this.baseUrl}/media/${json.id}`, {
        method: "POST",
        headers: this.headers(),
        body: { alt_text: altText },
      });
    }
    return json;
  }

  listMedia(params: { search?: string; perPage?: number; page?: number } = {}) {
    return apiRequest(`${this.baseUrl}/media`, {
      headers: this.headers(),
      query: { search: params.search, per_page: params.perPage ?? 20, page: params.page ?? 1 },
    });
  }

  getMedia(id: number) {
    return apiRequest(`${this.baseUrl}/media/${id}`, { headers: this.headers() });
  }

  updateMedia(id: number, data: { title?: string; altText?: string; caption?: string }) {
    return apiRequest(`${this.baseUrl}/media/${id}`, {
      method: "POST",
      headers: this.headers(),
      body: { title: data.title, alt_text: data.altText, caption: data.caption },
    });
  }

  deleteMedia(id: number, force = true) {
    // Media has no trash state either — deletion is permanent.
    return apiRequest(`${this.baseUrl}/media/${id}`, {
      method: "DELETE",
      headers: this.headers(),
      query: { force },
    });
  }

  // ---------- Comments ----------

  listComments(params: { post?: number; status?: string; perPage?: number; page?: number } = {}) {
    return apiRequest(`${this.baseUrl}/comments`, {
      headers: this.headers(),
      query: { post: params.post, status: params.status, per_page: params.perPage ?? 20, page: params.page ?? 1 },
    });
  }

  getComment(id: number) {
    return apiRequest(`${this.baseUrl}/comments/${id}`, { headers: this.headers() });
  }

  createComment(data: { post: number; content: string; parent?: number }) {
    return apiRequest(`${this.baseUrl}/comments`, {
      method: "POST",
      headers: this.headers(),
      body: data,
    });
  }

  /** Moderate a comment: status is typically "approved", "hold", "spam", or "trash". */
  updateComment(id: number, data: { content?: string; status?: string }) {
    return apiRequest(`${this.baseUrl}/comments/${id}`, {
      method: "POST",
      headers: this.headers(),
      body: data,
    });
  }

  deleteComment(id: number, force = false) {
    return apiRequest(`${this.baseUrl}/comments/${id}`, {
      method: "DELETE",
      headers: this.headers(),
      query: { force },
    });
  }

  // ---------- Users ----------

  listUsers(params: { search?: string; perPage?: number; page?: number } = {}) {
    return apiRequest(`${this.baseUrl}/users`, {
      headers: this.headers(),
      query: { search: params.search, per_page: params.perPage ?? 20, page: params.page ?? 1 },
    });
  }

  getUser(id: number) {
    return apiRequest(`${this.baseUrl}/users/${id}`, { headers: this.headers() });
  }

  // ---------- Discovery: post types & taxonomies ----------

  /** Lists every registered content type on the site — posts, pages, and any custom post types (e.g. from ACF or a theme/plugin). */
  listPostTypes() {
    return apiRequest(`${this.baseUrl}/types`, { headers: this.headers() });
  }

  /** Lists every registered taxonomy — categories, tags, and any custom taxonomies. */
  listTaxonomies() {
    return apiRequest(`${this.baseUrl}/taxonomies`, { headers: this.headers() });
  }

  // ---------- Navigation menus ----------
  // Note: these endpoints require WordPress 5.9+ with a block theme
  // (full site editing support). On a classic-theme site, these calls
  // may 404 even though the rest of the API works fine — that's the
  // site, not a bug in this client.

  listMenus() {
    return apiRequest(`${this.baseUrl}/menus`, { headers: this.headers() });
  }

  listMenuItems(menuId?: number) {
    return apiRequest(`${this.baseUrl}/menu-items`, {
      headers: this.headers(),
      query: { menus: menuId },
    });
  }

  // ---------- Site settings ----------

  getSettings() {
    return apiRequest(`${this.baseUrl}/settings`, { headers: this.headers() });
  }

  /** Requires admin-level credentials. Only pass the fields you want to change. */
  updateSettings(data: Record<string, unknown>) {
    return apiRequest(`${this.baseUrl}/settings`, {
      method: "POST",
      headers: this.headers(),
      body: data,
    });
  }

  // ---------- Plugins & themes: read-only by design ----------
  // Intentionally no install/activate/deactivate/delete here — see the
  // note at the top of this file.

  listPlugins() {
    return apiRequest(`${this.baseUrl}/plugins`, { headers: this.headers() });
  }

  listThemes() {
    return apiRequest(`${this.baseUrl}/themes`, { headers: this.headers() });
  }

  // ---------- Search ----------

  search(term: string, type?: string) {
    return apiRequest(`${this.baseUrl}/search`, {
      headers: this.headers(),
      query: { search: term, type },
    });
  }
}

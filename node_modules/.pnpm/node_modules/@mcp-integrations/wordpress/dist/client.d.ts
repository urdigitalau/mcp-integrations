/**
 * Auth: WordPress core Application Passwords (built in since WP 5.6).
 * Create one under wp-admin -> Users -> Profile -> Application Passwords.
 * This is Basic Auth over HTTPS, NOT your real account password.
 */
export declare class WordPressClient {
    private baseUrl;
    private authHeader;
    constructor();
    private headers;
    listPosts(params: {
        search?: string;
        status?: string;
        perPage?: number;
        page?: number;
    }): Promise<unknown>;
    getPost(id: number): Promise<unknown>;
    createPost(data: {
        title: string;
        content: string;
        status?: string;
        excerpt?: string;
        categories?: number[];
        tags?: number[];
    }): Promise<unknown>;
    updatePost(id: number, data: Record<string, unknown>): Promise<unknown>;
    deletePost(id: number, force?: boolean): Promise<unknown>;
    listPages(params: {
        search?: string;
        perPage?: number;
        page?: number;
    }): Promise<unknown>;
    uploadMedia(fileUrl: string, filename: string, altText?: string): Promise<any>;
    search(term: string, type?: string): Promise<unknown>;
}

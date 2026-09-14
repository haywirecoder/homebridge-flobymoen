export declare const MOEN_OAUTH_URL = "https://api.prod.iot.moen.com/v1/oauth2/token";
export declare const MOEN_OAUTH_CLIENT_ID = "6qn9pep31dglq6ed4fvlq6rp5t";
export declare const MOEN_USER_AGENT = "Flo-Android";
type Fetch = typeof globalThis.fetch;
interface MoenAuthOptions {
    fetch?: Fetch;
    now?: () => number;
    expirySkewMs?: number;
    requestTimeoutMs?: number;
}
export declare class MoenAuthError extends Error {
    readonly status?: number | undefined;
    constructor(message: string, status?: number | undefined);
}
/** Manages Moen SSO access and refresh tokens without persisting credentials. */
export declare class MoenAuthService {
    private readonly email;
    private readonly password;
    private accessToken?;
    private refreshToken?;
    private expiresAt?;
    private tokenRequest?;
    private readonly fetch;
    private readonly now;
    private readonly expirySkewMs;
    private readonly requestTimeoutMs;
    constructor(email: string, password: string, options?: MoenAuthOptions);
    login(): Promise<void>;
    getAccessToken(): Promise<string>;
    /** Marks a rejected token stale without invalidating a newer token. */
    invalidateAccessToken(rejectedToken?: string): void;
    private refresh;
    private tokenExpired;
    private storeToken;
    private postToken;
}
export {};

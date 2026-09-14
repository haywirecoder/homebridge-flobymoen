"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MoenAuthService = exports.MoenAuthError = exports.MOEN_USER_AGENT = exports.MOEN_OAUTH_CLIENT_ID = exports.MOEN_OAUTH_URL = void 0;
exports.MOEN_OAUTH_URL = 'https://api.prod.iot.moen.com/v1/oauth2/token';
exports.MOEN_OAUTH_CLIENT_ID = '6qn9pep31dglq6ed4fvlq6rp5t';
exports.MOEN_USER_AGENT = 'Flo-Android';
const DEFAULT_EXPIRY_SKEW_MS = 60_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 20_000;
class MoenAuthError extends Error {
    status;
    constructor(message, status) {
        super(message);
        this.status = status;
        this.name = 'MoenAuthError';
    }
}
exports.MoenAuthError = MoenAuthError;
/** Manages Moen SSO access and refresh tokens without persisting credentials. */
class MoenAuthService {
    email;
    password;
    accessToken;
    refreshToken;
    expiresAt;
    tokenRequest;
    fetch;
    now;
    expirySkewMs;
    requestTimeoutMs;
    constructor(email, password, options = {}) {
        this.email = email;
        this.password = password;
        this.fetch = options.fetch ?? globalThis.fetch;
        this.now = options.now ?? Date.now;
        this.expirySkewMs = options.expirySkewMs ?? DEFAULT_EXPIRY_SKEW_MS;
        this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
        if (!this.fetch) {
            throw new MoenAuthError('This Node.js version does not provide fetch.');
        }
    }
    async login() {
        const response = await this.postToken({
            username: this.email,
            password: this.password,
            grant_type: 'client_credentials',
            client_id: exports.MOEN_OAUTH_CLIENT_ID,
        });
        this.storeToken(response);
    }
    async getAccessToken() {
        if (!this.tokenExpired()) {
            return this.accessToken;
        }
        if (!this.tokenRequest) {
            this.tokenRequest = (this.accessToken ? this.refresh() : this.login())
                .finally(() => {
                this.tokenRequest = undefined;
            });
        }
        await this.tokenRequest;
        if (!this.accessToken) {
            throw new MoenAuthError('Moen authentication returned no access token.');
        }
        return this.accessToken;
    }
    /** Marks a rejected token stale without invalidating a newer token. */
    invalidateAccessToken(rejectedToken) {
        if (!rejectedToken || rejectedToken === this.accessToken) {
            this.expiresAt = 0;
        }
    }
    async refresh() {
        if (!this.refreshToken) {
            await this.login();
            return;
        }
        try {
            const response = await this.postToken({
                grant_type: 'refresh_token',
                refresh_token: this.refreshToken,
                client_id: exports.MOEN_OAUTH_CLIENT_ID,
            });
            this.storeToken(response);
        }
        catch (error) {
            // A refresh token can be revoked or expire. Retry once with credentials.
            this.accessToken = undefined;
            this.refreshToken = undefined;
            this.expiresAt = undefined;
            await this.login().catch(loginError => {
                throw new MoenAuthError(`Moen token refresh and login failed: ${errorMessage(loginError)}`, loginError instanceof MoenAuthError ? loginError.status : undefined);
            });
        }
    }
    tokenExpired() {
        return !this.accessToken
            || !this.expiresAt
            || this.now() >= this.expiresAt - this.expirySkewMs;
    }
    storeToken(data) {
        if (!isRecord(data)) {
            throw new MoenAuthError('Moen authentication returned an invalid response.');
        }
        const envelope = isRecord(data.token) ? data.token : data;
        const token = envelope;
        if (typeof token.access_token !== 'string' || !token.access_token) {
            throw new MoenAuthError('Moen authentication returned no access token; the account may require an OTP challenge.');
        }
        const parsedExpiresIn = typeof token.expires_in === 'number'
            ? token.expires_in
            : typeof token.expires_in === 'string'
                ? Number(token.expires_in)
                : Number.NaN;
        const expiresIn = Number.isFinite(parsedExpiresIn) ? parsedExpiresIn : 3600;
        this.accessToken = token.access_token;
        this.refreshToken = typeof token.refresh_token === 'string'
            ? token.refresh_token
            : this.refreshToken;
        this.expiresAt = this.now() + expiresIn * 1000;
    }
    async postToken(body) {
        let response;
        try {
            response = await this.fetch(exports.MOEN_OAUTH_URL, {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json;charset=UTF-8',
                    'User-Agent': exports.MOEN_USER_AGENT,
                },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(this.requestTimeoutMs),
            });
        }
        catch (error) {
            throw new MoenAuthError(`Unable to reach Moen authentication: ${errorMessage(error)}`);
        }
        const text = await response.text();
        if (!response.ok) {
            throw new MoenAuthError(`Moen authentication failed with HTTP ${response.status}.`, response.status);
        }
        try {
            return text ? JSON.parse(text) : {};
        }
        catch {
            throw new MoenAuthError('Moen authentication returned non-JSON data.', response.status);
        }
    }
}
exports.MoenAuthService = MoenAuthService;
function isRecord(value) {
    return typeof value === 'object' && value !== null;
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}

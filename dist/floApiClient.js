"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FloApiClient = exports.FloApiError = exports.FLO_API_BASE = void 0;
const moenAuthService_1 = require("./moenAuthService");
exports.FLO_API_BASE = 'https://api-gw.meetflo.com/api/v2';
const DEFAULT_REQUEST_TIMEOUT_MS = 20_000;
class FloApiError extends Error {
    status;
    constructor(message, status) {
        super(message);
        this.status = status;
        this.name = 'FloApiError';
    }
}
exports.FloApiError = FloApiError;
/** A single authenticated gateway for Flo v2 API traffic. */
class FloApiClient {
    auth;
    requestTimeoutMs;
    fetch;
    constructor(auth, fetchImplementation = globalThis.fetch, requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS) {
        this.auth = auth;
        this.requestTimeoutMs = requestTimeoutMs;
        this.fetch = fetchImplementation;
    }
    async getDevice(deviceId) {
        return this.get(`/devices/${encodeURIComponent(deviceId)}`);
    }
    async setValve(deviceId, target) {
        await this.post(`/devices/${encodeURIComponent(deviceId)}`, {
            valve: { target },
        });
    }
    async get(path) {
        return this.request('GET', path);
    }
    async post(path, body = {}) {
        return this.request('POST', path, body);
    }
    async getLocations() {
        const user = await this.get('/moen/sync/me');
        if (typeof user.id !== 'string' || !user.id) {
            throw new FloApiError('Flo API returned no user id from Moen account sync.');
        }
        const response = await this.get(`/locations?userId=${encodeURIComponent(user.id)}&expand=devices`);
        const locations = Array.isArray(response)
            ? response
            : isRecord(response) && Array.isArray(response.items)
                ? response.items
                : [];
        return locations.filter(isFloLocation);
    }
    async discoverDevices() {
        const locations = await this.getLocations();
        const devices = [];
        for (const location of locations) {
            if (Array.isArray(location.devices)) {
                for (const device of location.devices) {
                    if (isFloDevice(device) && (device.deviceType || device.valve)) {
                        devices.push(device);
                        continue;
                    }
                    const deviceId = typeof device === 'string'
                        ? device
                        : isFloDevice(device)
                            ? device.id
                            : undefined;
                    if (deviceId) {
                        devices.push(await this.getDevice(deviceId));
                    }
                }
            }
        }
        return devices;
    }
    async request(method, path, body) {
        if (!path.startsWith('/')) {
            throw new FloApiError(`Flo API path must begin with '/': ${path}`);
        }
        for (let attempt = 0; attempt < 2; attempt++) {
            const token = await this.auth.getAccessToken();
            let response;
            try {
                response = await this.fetch(`${exports.FLO_API_BASE}${path}`, {
                    method,
                    headers: {
                        Accept: 'application/json',
                        Authorization: `Bearer ${token}`,
                        'User-Agent': moenAuthService_1.MOEN_USER_AGENT,
                        ...(body ? { 'Content-Type': 'application/json' } : {}),
                    },
                    body: body ? JSON.stringify(body) : undefined,
                    signal: AbortSignal.timeout(this.requestTimeoutMs),
                });
            }
            catch (error) {
                throw new FloApiError(`Flo API request failed: ${errorMessage(error)}`);
            }
            if ((response.status === 401 || response.status === 403) && attempt === 0) {
                this.auth.invalidateAccessToken(token);
                continue;
            }
            const text = await response.text();
            if (response.status === 401 || response.status === 403) {
                throw new moenAuthService_1.MoenAuthError(`Flo rejected the Moen access token with HTTP ${response.status}.`, response.status);
            }
            if (!response.ok) {
                throw new FloApiError(`Flo API request failed with HTTP ${response.status}.`, response.status);
            }
            if (!text) {
                return {};
            }
            try {
                return JSON.parse(text);
            }
            catch {
                throw new FloApiError('Flo API returned non-JSON data.', response.status);
            }
        }
        throw new FloApiError('Flo API retry loop ended unexpectedly.');
    }
}
exports.FloApiClient = FloApiClient;
function isRecord(value) {
    return typeof value === 'object' && value !== null;
}
function isFloDevice(value) {
    return isRecord(value) && typeof value.id === 'string';
}
function isFloLocation(value) {
    return isRecord(value) && typeof value.id === 'string';
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}

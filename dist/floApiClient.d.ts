import { MoenAuthService } from './moenAuthService';
export declare const FLO_API_BASE = "https://api-gw.meetflo.com/api/v2";
type Fetch = typeof globalThis.fetch;
type ValveTarget = 'open' | 'closed';
export interface FloDevice extends Record<string, unknown> {
    id: string;
    deviceType?: string;
    valve?: {
        target?: ValveTarget;
        [key: string]: unknown;
    };
}
export interface FloLocation extends Record<string, unknown> {
    id: string;
    devices?: unknown[];
}
export declare class FloApiError extends Error {
    readonly status?: number | undefined;
    constructor(message: string, status?: number | undefined);
}
/** A single authenticated gateway for Flo v2 API traffic. */
export declare class FloApiClient {
    private readonly auth;
    private readonly requestTimeoutMs;
    private readonly fetch;
    constructor(auth: MoenAuthService, fetchImplementation?: Fetch, requestTimeoutMs?: number);
    getDevice(deviceId: string): Promise<FloDevice>;
    setValve(deviceId: string, target: ValveTarget): Promise<void>;
    get<T = Record<string, unknown>>(path: string): Promise<T>;
    post<T = Record<string, unknown>>(path: string, body?: Record<string, unknown>): Promise<T>;
    getLocations(): Promise<FloLocation[]>;
    discoverDevices(): Promise<FloDevice[]>;
    private request;
}
export {};

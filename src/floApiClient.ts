import { MoenAuthError, MoenAuthService, MOEN_USER_AGENT } from './moenAuthService';

export const FLO_API_BASE = 'https://api-gw.meetflo.com/api/v2';
const DEFAULT_REQUEST_TIMEOUT_MS = 20_000;

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

export class FloApiError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'FloApiError';
  }
}

/** A single authenticated gateway for Flo v2 API traffic. */
export class FloApiClient {
  private readonly fetch: Fetch;

  constructor(
    private readonly auth: MoenAuthService,
    fetchImplementation: Fetch = globalThis.fetch,
    private readonly requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  ) {
    this.fetch = fetchImplementation;
  }

  async getDevice(deviceId: string): Promise<FloDevice> {
    return this.get<FloDevice>(`/devices/${encodeURIComponent(deviceId)}`);
  }

  async setValve(deviceId: string, target: ValveTarget): Promise<void> {
    await this.post(`/devices/${encodeURIComponent(deviceId)}`, {
      valve: { target },
    });
  }

  async get<T = Record<string, unknown>>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  async post<T = Record<string, unknown>>(
    path: string,
    body: Record<string, unknown> = {},
  ): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  async getLocations(): Promise<FloLocation[]> {
    const user = await this.get<Record<string, unknown>>('/moen/sync/me');
    if (typeof user.id !== 'string' || !user.id) {
      throw new FloApiError('Flo API returned no user id from Moen account sync.');
    }

    const response = await this.get<unknown>(
      `/locations?userId=${encodeURIComponent(user.id)}&expand=devices`,
    );
    const locations = Array.isArray(response)
      ? response
      : isRecord(response) && Array.isArray(response.items)
        ? response.items
        : [];

    return locations.filter(isFloLocation);
  }

  async discoverDevices(): Promise<FloDevice[]> {
    const locations = await this.getLocations();
    const devices: FloDevice[] = [];

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

  private async request<T = Record<string, unknown>>(
    method: 'GET' | 'POST',
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    if (!path.startsWith('/')) {
      throw new FloApiError(`Flo API path must begin with '/': ${path}`);
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await this.auth.getAccessToken();
      let response: Response;

      try {
        response = await this.fetch(`${FLO_API_BASE}${path}`, {
          method,
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
            'User-Agent': MOEN_USER_AGENT,
            ...(body ? { 'Content-Type': 'application/json' } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(this.requestTimeoutMs),
        });
      } catch (error) {
        throw new FloApiError(`Flo API request failed: ${errorMessage(error)}`);
      }

      if ((response.status === 401 || response.status === 403) && attempt === 0) {
        this.auth.invalidateAccessToken(token);
        continue;
      }

      const text = await response.text();
      if (response.status === 401 || response.status === 403) {
        throw new MoenAuthError(`Flo rejected the Moen access token with HTTP ${response.status}.`, response.status);
      }
      if (!response.ok) {
        throw new FloApiError(`Flo API request failed with HTTP ${response.status}.`, response.status);
      }
      if (!text) {
        return {} as T;
      }

      try {
        return JSON.parse(text) as T;
      } catch {
        throw new FloApiError('Flo API returned non-JSON data.', response.status);
      }
    }

    throw new FloApiError('Flo API retry loop ended unexpectedly.');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFloDevice(value: unknown): value is FloDevice {
  return isRecord(value) && typeof value.id === 'string';
}

function isFloLocation(value: unknown): value is FloLocation {
  return isRecord(value) && typeof value.id === 'string';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

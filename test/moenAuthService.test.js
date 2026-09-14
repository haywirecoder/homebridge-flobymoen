'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');

const { FloApiClient } = require('../dist/floApiClient');
const {
  MOEN_OAUTH_CLIENT_ID,
  MOEN_OAUTH_URL,
  MOEN_USER_AGENT,
  MoenAuthService,
} = require('../dist/moenAuthService');

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('logs in through Moen SSO and returns its access token', async () => {
  const calls = [];
  const auth = new MoenAuthService('person@example.com', 'secret', {
    fetch: async (url, init) => {
      calls.push({ url, init });
      return jsonResponse({
        token: { access_token: 'access-1', refresh_token: 'refresh-1', expires_in: 3600 },
      });
    },
  });

  assert.equal(await auth.getAccessToken(), 'access-1');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, MOEN_OAUTH_URL);
  assert.equal(calls[0].init.headers['User-Agent'], MOEN_USER_AGENT);
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    username: 'person@example.com',
    password: 'secret',
    grant_type: 'client_credentials',
    client_id: MOEN_OAUTH_CLIENT_ID,
  });
});

test('accepts a string token expiry returned by the Moen gateway', async () => {
  let now = 1_000_000;
  let calls = 0;
  const auth = new MoenAuthService('person@example.com', 'secret', {
    now: () => now,
    fetch: async () => {
      calls += 1;
      return jsonResponse({ token: { access_token: `access-${calls}`, expires_in: '3600' } });
    },
  });

  assert.equal(await auth.getAccessToken(), 'access-1');
  now += 1_000;
  assert.equal(await auth.getAccessToken(), 'access-1');
  assert.equal(calls, 1);
});

test('refreshes an expired token and retains a refresh token omitted by refresh response', async () => {
  let now = 1_000_000;
  const bodies = [];
  const responses = [
    { token: { access_token: 'access-1', refresh_token: 'refresh-1', expires_in: 120 } },
    { token: { access_token: 'access-2', expires_in: 3600 } },
  ];
  const auth = new MoenAuthService('person@example.com', 'secret', {
    now: () => now,
    fetch: async (_url, init) => {
      bodies.push(JSON.parse(init.body));
      return jsonResponse(responses.shift());
    },
  });

  assert.equal(await auth.getAccessToken(), 'access-1');
  now += 61_000;
  assert.equal(await auth.getAccessToken(), 'access-2');
  assert.deepEqual(bodies[1], {
    grant_type: 'refresh_token',
    refresh_token: 'refresh-1',
    client_id: MOEN_OAUTH_CLIENT_ID,
  });
});

test('Flo API sends a Bearer token and retries once after a 401', async () => {
  let token = 'access-1';
  const headers = [];
  const auth = {
    async getAccessToken() { return token; },
    invalidateAccessToken(rejected) {
      assert.equal(rejected, 'access-1');
      token = 'access-2';
    },
  };
  const client = new FloApiClient(auth, async (_url, init) => {
    headers.push(init.headers.Authorization);
    return headers.length === 1
      ? new Response('', { status: 401 })
      : jsonResponse({ id: 'device-1', valve: { target: 'open' } });
  });

  const device = await client.getDevice('device-1');
  assert.equal(device.valve.target, 'open');
  assert.deepEqual(headers, ['Bearer access-1', 'Bearer access-2']);
});

test('setValve posts the Flo v2 valve target payload', async () => {
  const calls = [];
  const auth = { async getAccessToken() { return 'access-1'; } };
  const client = new FloApiClient(auth, async (url, init) => {
    calls.push({ url, init });
    return jsonResponse({});
  });

  await client.setValve('device/1', 'closed');
  assert.equal(calls[0].url, 'https://api-gw.meetflo.com/api/v2/devices/device%2F1');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer access-1');
  assert.deepEqual(JSON.parse(calls[0].init.body), { valve: { target: 'closed' } });
});

test('discovers migrated-account locations through Moen sync', async () => {
  const urls = [];
  const auth = { async getAccessToken() { return 'access-1'; } };
  const client = new FloApiClient(auth, async (url) => {
    urls.push(url);
    if (url.endsWith('/moen/sync/me')) {
      return jsonResponse({ id: 'user/1' });
    }
    if (url.includes('/locations?')) {
      return jsonResponse({ items: [{ id: 'location-1', devices: [{ id: 'device-1' }] }] });
    }
    if (url.endsWith('/devices/device-1')) {
      return jsonResponse({ id: 'device-1', deviceType: 'flo_device_v2' });
    }
    throw new Error(`Unexpected URL ${url}`);
  });

  assert.deepEqual(await client.discoverDevices(), [
    { id: 'device-1', deviceType: 'flo_device_v2' },
  ]);
  assert.equal(
    urls[1],
    'https://api-gw.meetflo.com/api/v2/locations?userId=user%2F1&expand=devices',
  );
});

'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');

const FlobyMoen = require('../flomain');

function logger() {
  const log = () => {};
  log.debug = () => {};
  log.info = () => {};
  log.warn = () => {};
  log.error = () => {};
  return log;
}

function config() {
  return {
    auth: { username: 'person@example.com', password: 'secret' },
    deviceRefresh: 90,
    pingRefresh: 0,
    sleepRevertMinutes: 120,
    offlineTimeLimit: 4,
    excludedDevices: [],
    retryErrorDisplay: 3,
  };
}

test('legacy facade authenticates through MoenAuthService', async () => {
  let authenticationCalls = 0;
  const auth = {
    async getAccessToken() {
      authenticationCalls += 1;
      return 'access-token';
    },
  };
  const flo = new FlobyMoen(logger(), config(), '/unused', {
    auth,
    client: {},
  });

  assert.equal(await flo.init(), true);
  assert.equal(flo.isLoggedIn(), true);
  assert.equal(authenticationCalls, 1);
  assert.equal('auth_token' in flo, false);
});

test('legacy valve command delegates to FloApiClient and emits the existing event', async () => {
  const calls = [];
  const client = {
    async setValve(deviceId, target) {
      calls.push({ deviceId, target });
    },
  };
  const flo = new FlobyMoen(logger(), config(), undefined, {
    auth: { async getAccessToken() { return 'access-token'; } },
    client,
  });
  flo.authenticated = true;
  flo.flo_devices = [{ deviceid: 'device-1', valveGlobalState: 'open' }];

  const event = new Promise(resolve => flo.once('device-1', resolve));
  await flo.setValve('device-1', 'closed', 0);

  assert.deepEqual(calls, [{ deviceId: 'device-1', target: 'closed' }]);
  assert.equal(flo.flo_devices[0].valveGlobalState, 'closed');
  assert.equal((await event).device, flo.flo_devices[0]);
});

test('legacy discovery loads devices from migrated-account locations', async () => {
  const client = {
    async getLocations() {
      return [{ id: 'location-1', devices: [{ id: 'device-1' }] }];
    },
    async get(path) {
      if (path.startsWith('/water/consumption')) {
        return { aggregations: { sumTotalGallonsConsumed: 12.5 } };
      }
      throw new Error(`Unexpected path ${path}`);
    },
    async getDevice(deviceId) {
      assert.equal(deviceId, 'device-1');
      return {
        id: 'device-1',
        nickname: 'Main Valve',
        deviceModel: 'Flo',
        deviceType: 'flo_device_v2',
        serialNumber: 'serial-1',
        location: { id: 'location-1' },
        notifications: { pending: [], warningCount: 0, criticalCount: 0 },
        fwVersion: '1.0',
        isConnected: true,
        lastHeardFromTime: '2026-09-14T12:00:00Z',
        telemetry: { current: { psi: 50, gpm: 0 } },
        systemMode: { lastKnown: 'home', target: 'home' },
        valve: { lastKnown: 'open', target: 'open' },
        installStatus: { isInstalled: true, isConnected: true },
      };
    },
  };
  const flo = new FlobyMoen(logger(), config(), undefined, {
    auth: { async getAccessToken() { return 'access-token'; } },
    client,
  });
  flo.authenticated = true;

  assert.equal(await flo.discoverDevices(), true);
  assert.equal(flo.flo_devices.length, 1);
  assert.equal(flo.flo_devices[0].name, 'Main Valve');
  assert.deepEqual(flo.flo_locations, ['location-1']);
});

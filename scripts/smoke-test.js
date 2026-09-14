'use strict';

const { FloApiClient } = require('../dist/floApiClient');
const { MoenAuthService } = require('../dist/moenAuthService');

async function main() {
  const email = process.env.MOEN_EMAIL;
  const password = process.env.MOEN_PASSWORD;

  if (!email || !password) {
    throw new Error('Set MOEN_EMAIL and MOEN_PASSWORD before running the smoke test.');
  }

  const auth = new MoenAuthService(email, password);
  const client = new FloApiClient(auth);

  process.stdout.write('Authenticating with Moen SSO... ');
  await auth.getAccessToken();
  process.stdout.write('ok\nDiscovering Flo devices... ');

  const devices = await client.discoverDevices();
  process.stdout.write(`found ${devices.length}\n`);

  for (const device of devices) {
    const name = typeof device.nickname === 'string' ? device.nickname : 'Unnamed device';
    const type = typeof device.deviceType === 'string' ? device.deviceType : 'unknown type';
    const valve = device.valve?.target ? `, valve=${device.valve.target}` : '';
    process.stdout.write(`- ${name} (${type}${valve})\n`);
  }
}

main().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Smoke test failed: ${message}\n`);
  process.exitCode = 1;
});

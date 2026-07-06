import http from 'node:http';
import https from 'node:https';

const log = (...args) => console.log('[mocha-setup]', ...args);

export const mochaHooks = {
  afterAll() {
    log('Cleaning up HTTP(S) Response objects whose bodies have not been read...');
    http.globalAgent.destroy();
    https.globalAgent.destroy();

    log('Cleanup complete.');
  },
};

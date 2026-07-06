const http = require('node:http');
const https = require('node:https');

const log = (...args) => console.log('[mocha-setup]', ...args);

module.exports = {
  mochaHooks: {
    afterAll() {
      log('Cleaning up HTTP(S) Response objects whose bodies have not been read...');
      http.globalAgent.destroy();
      https.globalAgent.destroy();

      log('Cleanup complete.');
    },
  },
};

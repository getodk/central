import http from 'node:http';
import https from 'node:https';

export const mochaHooks = {
  afterAll() {
    http.globalAgent.destroy();
    https.globalAgent.destroy();
  },
};

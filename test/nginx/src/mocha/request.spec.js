const express = require('express');

const {
  assert,
} = require('../lib');

const request = require('./request');

describe('request()', () => {
  let port, server;
  const requestsReceived = [];

  beforeEach(() => new Promise((resolve, reject) => {
    requestsReceived.length = 0;

    const app = express();
    app.use((req, res, next) => {
      const { method, path } = req;
      requestsReceived.push({ method, path });
      next();
    });
    app.get('/redirect-302', (req, res) => {
      res.redirect('http://example.test/redirected');
    });
    app.all('*', (req, res) => {
      res.send('OK');
    });

    server = app.listen(0, '127.0.0.1');
    server.on('error', reject);
    server.on('listening', () => {
      port = server.address().port;
      resolve();
    });
  }));

  afterEach(() => {
    server?.close();
  });

  it('should not follow redirects', async () => {
    // when
    const res = await request(`http://127.0.0.1:${port}/redirect-302`);

    // then
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), 'http://example.test/redirected');
    assert.deepEqual(requestsReceived, [
      { method:'GET', path:'/redirect-302' },
    ]);
  });
});

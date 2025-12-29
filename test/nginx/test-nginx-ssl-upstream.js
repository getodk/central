const deepEqualInAnyOrder = require('deep-equal-in-any-order');
const chai = require('chai');
chai.use(deepEqualInAnyOrder);
const { assert } = chai;

const { request } = require('./util');

describe('nginx: SSL_TYPE=upstream', () => {
  it('should respond to HTTP requests (IPv4)', async () => {
    // when
    const res = await fetchHttp('/version.txt');

    // then
    assert.equal(res.status, 200);
  });

  it('should respond to HTTP requests (IPv6)', async () => {
    // when
    const res = await fetchHttp6('/version.txt');

    // then
    assert.equal(res.status, 200);
  });

  it('should not respond to HTTPS requests (IPv4)', async () => {
    try {
      // when
      await fetchHttps('/version.txt');

      assert.fail('should not have responded');
    } catch(err) {
      // then
      assert.equal(err.code, 'ECONNRESET');
    }
  });

  it('should not respond to HTTPS requests (IPv6)', async () => {
    try {
      // when
      await fetchHttps6('/version.txt');

      assert.fail('should not have responded');
    } catch(err) {
      // then
      assert.equal(err.code, 'ECONNRESET');
    }
  });

  it('should set X-Forwarded-Proto header to `https` for central-backend requests', async () => {
    // when
    const res = await fetchHttp('/v1/reflect-headers');

    // then
    assert.equal(res.status, 200);
    // and
    assert.deepEqual(await res.json(), {
      'connection': 'close',
      'host': 'service:8383',
      'x-forwarded-proto': 'https',
    });
  });
});

function fetchHttp(path, options) {
  if(!path.startsWith('/')) throw new Error('Invalid path.');
  return request(`http://127.0.0.1:10000${path}`, options);
}

function fetchHttp6(path, options) {
  if(!path.startsWith('/')) throw new Error('Invalid path.');
  return request(`http://[::1]:10000${path}`, options);
}

function fetchHttps(path, options) {
  if(!path.startsWith('/')) throw new Error('Invalid path.');
  return request(`https://127.0.0.1:10001${path}`, options);
}

function fetchHttps6(path, options) {
  if(!path.startsWith('/')) throw new Error('Invalid path.');
  return request(`https://[::1]:10001${path}`, options);
}

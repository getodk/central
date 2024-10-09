const { Readable } = require('stream');
const { assert } = require('chai');

describe('nginx config', () => {
  beforeEach(() => Promise.all([
    resetEnketoMock(),
    resetBackendMock(),
  ]));

  it('well-known should serve from HTTP', async () => {
    // when
    const res = await fetchHttp('/.well-known/acme-challenge');

    // then
    assert.equal(res.status, 301);
    assert.equal(res.headers.get('location'), 'https://odk-nginx.example.test/.well-known/acme-challenge');
  });

  it('well-known should serve from HTTPS', async () => {
    // when
    const res = await fetchHttps('/.well-known/acme-challenge');

    // then
    assert.equal(res.status, 404);
  });

  it('HTTP should forward to HTTPS', async () => {
    // when
    const res = await fetchHttp('/');

    // then
    assert.equal(res.status, 301);
    assert.equal(res.headers.get('location'), 'https://odk-nginx.example.test/');
  });

  it('should serve generated client-config.json', async () => {
    // when
    const res = await fetchHttps('/client-config.json');

    // then
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { oidcEnabled: false });
    assert.equal(await res.headers.get('cache-control'), 'no-cache');
  });

  [
    '/index.html',
    '/version.txt',
  ].forEach(staticFile => {
    it(`${staticFile} file should have no-cache header`, async () => {
      // when
      const res = await fetchHttps(staticFile);

      // then
      assert.equal(res.status, 200);
      assert.equal(await res.text(), `hi:${staticFile}\n`);
      assert.equal(await res.headers.get('cache-control'), 'no-cache');
    });
  });

  [
    '/should-be-cached.txt',
  ].forEach(staticFile => {
    it(`${staticFile} file should not have no-cache header`, async () => {
      // when
      const res = await fetchHttps(staticFile);

      // then
      assert.equal(res.status, 200);
      assert.equal(await res.text(), `hi:${staticFile}\n`);
      assert.isNull(await res.headers.get('cache-control'));
    });
  });

  it('/-/... should forward to enketo', async () => {
    // when
    const res = await fetchHttps('/-/some/enketo/path');

    // then
    assert.equal(res.status, 200);
    assert.equal(await res.text(), 'OK');
    // and
    await assertEnketoReceived(
      { method:'GET', path:'/-/some/enketo/path' },
    );
  });

  it('/v1/... should forward to backend', async () => {
    // when
    const res = await fetchHttps('/v1/some/central-backend/path');

    // then
    assert.equal(res.status, 200);
    assert.equal(await res.text(), 'OK');
    // and
    await assertBackendReceived(
      { method:'GET', path:'/v1/some/central-backend/path' },
    );
  });

  it('should set x-forwarded-proto header to "https"', async () => {
    // when
    const res = await fetch(`https://localhost:9001/v1/reflect-headers`);
    // then
    assert.equal(res.status, 200);

    // when
    const body = await res.json();
    // then
    assert.equal(body['x-forwarded-proto'], 'https');
  });

  it('should override supplied x-forwarded-proto header', async () => {
    // when
    const res = await fetch(`https://localhost:9001/v1/reflect-headers`, {
      headers: {
        'x-forwarded-proto': 'http',
      },
    });
    // then
    assert.equal(res.status, 200);

    // when
    const body = await res.json();
    // then
    assert.equal(body['x-forwarded-proto'], 'https');
  });

  it('should reject HTTPS requests with incorrect host header supplied', async () => {
    // when
    const res = await fetchHttps('/', { headers:{ host:'bad.example.com' } });

    // then
    assert.equal(res.status, 421);
  });
});

function fetchHttp(path, options) {
  if(!path.startsWith('/')) throw new Error('Invalid path.');
  return fetch(`http://localhost:9000${path}`, options);
}

function fetchHttps(path, options) {
  if(!path.startsWith('/')) throw new Error('Invalid path.');
  return fetch(`https://localhost:9001${path}`, options);
}

function assertEnketoReceived(...expectedRequests) {
  return assertMockHttpReceived(8005, expectedRequests);
}

function assertBackendReceived(...expectedRequests) {
  return assertMockHttpReceived(8383, expectedRequests);
}

async function assertMockHttpReceived(port, expectedRequests) {
  const res = await fetch(`http://localhost:${port}/request-log`);
  assert.isTrue(res.ok);
  assert.deepEqual(expectedRequests, await res.json());
}

function resetEnketoMock() {
  return resetMock(8005);
}

function resetBackendMock() {
  return resetMock(8383);
}

async function resetMock(port) {
  const res = await fetch(`http://localhost:${port}/reset`);
  assert.isTrue(res.ok);
}

// Similar to fetch() but:
//
// 1. do not follow redirects
// 2. allow overriding of fetch's "forbidden" headers: https://developer.mozilla.org/en-US/docs/Glossary/Forbidden_header_name
function fetch(url, { body, ...options }={}) {
  if(!options.headers) options.headers = {};
  if(!options.headers.host) options.headers.host = 'odk-nginx.example.test';

  return new Promise((resolve, reject) => {
    try {
      const req = getProtocolImplFrom(url).request(url, options, res => {
        res.on('error', reject);

        const body = new Readable({ _read: () => {} });
        res.on('error', err => body.destroy(err));
        res.on('data', data => body.push(data));
        res.on('end', () => body.push(null));

        const text = () => new Promise((resolve, reject) => {
          const chunks = [];
          body.on('error', reject);
          body.on('data', data => chunks.push(data))
          body.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        });

        const status = res.statusCode;

        resolve({
          status,
          ok: status >= 200 && status < 300,
          statusText: res.statusText,
          body,
          text,
          json: async () => JSON.parse(await text()),
          headers: new Headers(res.headers),
        });
      });
      req.on('error', reject);
      if(body !== undefined) req.write(body);
      req.end();
    } catch(err) {
      reject(err);
    }
  });
}

function getProtocolImplFrom(url) {
  const { protocol } = new URL(url);
  switch(protocol) {
    case 'http:':  return require('node:http');
    case 'https:': return require('node:https');
    default: throw new Error(`Unsupported protocol: ${protocol}`);
  }
}

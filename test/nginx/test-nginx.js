const tls = require('node:tls');
const { Readable } = require('stream');
const { assert } = require('chai');

describe('nginx config', () => {
  beforeEach(() => Promise.all([
    resetEnketoMock(),
    resetBackendMock(),
  ]));

  it('HTTP should forward to HTTPS', async () => {
    // when
    const res = await fetchHttp('/');

    // then
    assert.equal(res.status, 301);
    assert.equal(res.headers.get('location'), 'https://odk-nginx.example.test/');
  });

  it('should forward HTTP to HTTPS (IPv6)', async () => {
    // when
    const res = await fetchHttp6('/');

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

  it('should serve generated client-config.json (IPv6)', async () => {
    // when
    const res = await fetchHttps6('/client-config.json');

    // then
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { oidcEnabled: false });
    assert.equal(await res.headers.get('cache-control'), 'no-cache');
  });

  [
    [ '/index.html',  /<div id="app"><\/div>/ ],
    [ '/version.txt', /^versions:/ ],
  ].forEach(([ staticFile, expectedContent ]) => {
    it(`${staticFile} file should have no-cache header`, async () => {
      // when
      const res = await fetchHttps(staticFile);

      // then
      assert.equal(res.status, 200);
      assert.match(await res.text(), expectedContent);
      assert.equal(await res.headers.get('cache-control'), 'no-cache');
    });
  });

  [
    '/blank.html',
    '/favicon.ico',
    // there's no way to predict generated asset paths, as they have cache-busting names
  ].forEach(staticFile => {
    it(`${staticFile} file should not have no-cache header`, async () => {
      // when
      const res = await fetchHttps(staticFile);

      // then
      assert.equal(res.status, 200);
      assert.isNull(await res.headers.get('cache-control'));
    });
  });

  [
    { request: '/-/some/enketo/path',                  expected: '/-/some/enketo/path' },
    { request: '/-',                                   expected: '/-' },
    { request: '/enketo-passthrough/some/enketo/path', expected: '/-/some/enketo/path' },
    { request: '/enketo-passthrough',                  expected: '/-' },
  ].forEach(t => {
    it(`should forward to enketo; ${t.request}`, async () => {
      // when
      const res = await fetchHttps(t.request);

      // then
      assert.equal(res.status, 200);
      assert.equal(await res.text(), 'OK');

      // and
      await assertEnketoReceived(
        { method:'GET', path: t.expected },
      );
    });
  });

  [
    { request: '/enketo-passthrough1000/some/enketo/path' },
    { request: '/--/' },
    { request: '/-some' },
  ].forEach(t => {
    it(`should not forward to enketo; ${t.request}`, async () => {
      // when
      await fetchHttps(t.request);

      // then
      await assertEnketoReceived();
    });
  });

  const enketoId =     'Ir3OFqqXiHr7dZuLB3J69LMTTg2rNrN';
  const enketoOnceId = 'fa696213465028b30b8bdfb418253b787af4a652725335335024cf5a23c69041';
  const sessionToken = 'GHMpk8xKvJiV2sbv!Cqn9X$zZx0Z6U5rBsq0VQIyyElkjdoyV6TrDo1fQEAvVE!X';
  const enketoRedirectTestData = [
    { description: 'public link',
      request: `/-/single/${enketoId}?st=${sessionToken}`,
      expected: `f/${enketoId}?st=${sessionToken}` },

    { description: 'public link - single submission',
      request: `/-/single/${enketoOnceId}?st=${sessionToken}`,
      expected: `f/${enketoOnceId}?st=${sessionToken}` },

    { description: 'edit submission',
      request: `/-/edit/${enketoId}?instance_id=uuid:123&return_url=https%3A%2F%2Fodk-nginx.example.test%2Fprojects%2F1%2Fforms%2Fsimple%2Fsubmissions%2Fuuid%3A123`,
      expected: `f/${enketoId}/edit?instance_id=uuid:123&return_url=https%3A%2F%2Fodk-nginx.example.test%2Fprojects%2F1%2Fforms%2Fsimple%2Fsubmissions%2Fuuid%3A123` },

    { description: 'preview form',
      request: `/-/preview/${enketoId}`,
      expected: `f/${enketoId}/preview` },

    { description: 'offline submission',
      request: `/-/x/${enketoId}`,
      expected: `f/${enketoId}/offline` },

    { description: 'new or draft submission',
      request: `/-/${enketoId}`,
      expected: `f/${enketoId}/new` },
  ];
  enketoRedirectTestData.forEach(t => {
    it('should redirect old enketo links to central-frontend; ' + t.description, async () => {
      // when
      const res = await fetchHttps(t.request);

      // then
      assertPermanentRedirect(res, t.expected);
    });
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
    const res = await fetchHttps('/v1/reflect-headers');
    // then
    assert.equal(res.status, 200);

    // when
    const body = await res.json();
    // then
    assert.equal(body['x-forwarded-proto'], 'https');
  });

  it('should override supplied x-forwarded-proto header', async () => {
    // when
    const res = await fetchHttps('/v1/reflect-headers', {
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

  it('should reject HTTP requests with incorrect host header supplied', async () => {
    // when
    const res = await fetchHttp('/', { headers:{ host:'bad.example.com' } });

    // then
    assert.equal(res.status, 421);
  });

  it('should reject HTTP requests with incorrect host header supplied (IPv6)', async () => {
    // when
    const res = await fetchHttp6('/', { headers:{ host:'bad.example.com' } });

    // then
    assert.equal(res.status, 421);
  });

  it('should reject HTTPS requests with incorrect host header supplied', async () => {
    // when
    const res = await fetchHttps('/', { headers:{ host:'bad.example.com' } });

    // then
    assert.equal(res.status, 421);
  });

  it('should reject HTTPS requests with incorrect host header supplied (IPv6)', async () => {
    // when
    const res = await fetchHttps6('/', { headers:{ host:'bad.example.com' } });

    // then
    assert.equal(res.status, 421);
  });

  it('should serve long-lived certificate to HTTPS requests with incorrect host header', () => new Promise((resolve, reject) => {
    const socket = tls.connect(9001, { host:'localhost', servername:'bad.example.com', rejectUnauthorized:false }, () => {
      try {
        const certificate = socket.getPeerCertificate();
        const validUntilRaw = certificate.valid_to;

        // Dates look like RFC-822 format - probably direct output of `openssl`.  NodeJS Date.parse()
        // seems to support this format.
        const validUntil = new Date(validUntilRaw);
        assert.isFalse(isNaN(validUntil), `Could not parse certificate's valid_to value as a date ('${validUntilRaw}')`);
        assert.isAbove(validUntil.getFullYear(), 3000, 'The provided certificate expires too soon.');
        socket.end();
      } catch(err) {
        socket.destroy(err);
      }
    });
    socket.on('end', resolve);
    socket.on('error', reject);
  }));
});

function fetchHttp(path, options) {
  if(!path.startsWith('/')) throw new Error('Invalid path.');
  return request(`http://127.0.0.1:9000${path}`, options);
}

function fetchHttp6(path, options) {
  if(!path.startsWith('/')) throw new Error('Invalid path.');
  return request(`http://[::1]:9000${path}`, options);
}

function fetchHttps(path, options) {
  if(!path.startsWith('/')) throw new Error('Invalid path.');
  return request(`https://127.0.0.1:9001${path}`, options);
}

function fetchHttps6(path, options) {
  if(!path.startsWith('/')) throw new Error('Invalid path.');
  return request(`https://[::1]:9001${path}`, options);
}

function assertEnketoReceived(...expectedRequests) {
  return assertMockHttpReceived(8005, expectedRequests);
}

function assertBackendReceived(...expectedRequests) {
  return assertMockHttpReceived(8383, expectedRequests);
}

async function assertMockHttpReceived(port, expectedRequests) {
  const res = await request(`http://localhost:${port}/request-log`);
  assert.isTrue(res.ok);
  assert.deepEqual(expectedRequests, await res.json());
}

function assertPermanentRedirect(res, expectedPath) {
  assert.equal(res.status, 301);
  assert.equal(res.headers.get('location'), `https://odk-nginx.example.test/${expectedPath}`);
}

function resetEnketoMock() {
  return resetMock(8005);
}

function resetBackendMock() {
  return resetMock(8383);
}

async function resetMock(port) {
  const res = await request(`http://localhost:${port}/reset`);
  assert.isTrue(res.ok);
}

// Similar to fetch() but:
//
// 1. do not follow redirects
// 2. allow overriding of fetch's "forbidden" headers: https://developer.mozilla.org/en-US/docs/Glossary/Forbidden_header_name
function request(url, { body, ...options }={}) {
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
          body.on('data', data => chunks.push(data));
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

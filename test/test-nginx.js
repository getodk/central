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
    assert.equal(res.headers.get('location'), 'https://localhost:9000/');
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
});

function fetchHttp(path, options) {
  if(!path.startsWith('/')) throw new Error('Invalid path.');
  return fetch(`http://localhost:9000${path}`, { redirect:'manual', ...options });
}

function fetchHttps(path, options) {
  if(!path.startsWith('/')) throw new Error('Invalid path.');
  return fetch(`https://localhost:9001${path}`, { redirect:'manual', ...options });
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

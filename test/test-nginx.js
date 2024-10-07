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
    assert.equal(res.headers.get('location'), 'https://localhost:9000/.well-known/acme-challenge');
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

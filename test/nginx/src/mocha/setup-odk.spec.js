const { execSync } = require('node:child_process');

const { assert } = require('../lib');
const request = require('./request');

const log = (...args) => console.log('[setup-odk.spec]', ...args);
const service = 'nginx-test-setup-odk';

let testPortOffset = 20000;

describe('setup-odk.sh', function() {
  this.timeout(10_000);

  afterEach(() => {
    const requiredEnv = {
      SSL_TYPE: '',
      HTTP_PORT: '',
      HTTPS_PORT: '',
    };

    log('--- CONTAINER LOGS ---');
    dockerCompose(requiredEnv, `logs --timestamps ${service}`);
    log('--- END CONTAINER LOGS ---');
  });
  after(() => {
    dockerCompose({}, `down --remove-orphans --volumes`);
  });

  it('should start ok with basic config', withNginx({
    SSL_TYPE: 'selfsign',
  }, async ports => {
    // when
    const res = await request(`https://localhost:${ports.https}`);

    // then
    assert.equal(res.status, 200);
    assert.equal(
      res.headers.get('Content-Security-Policy'),
      [
        `default-src 'report-sample' 'none'`,
        `connect-src 'self' https://o-fake-dsn.ingest.sentry.io https://translate.google.com https://translate.googleapis.com`,
        `font-src 'self'`,
        `form-action 'self'`,
        `frame-ancestors 'none'`,
        `frame-src 'self' https://getodk.github.io/central/`,
        `img-src data: https:`,
        `manifest-src 'self'`,
        `media-src 'none'`,
        `object-src 'none'`,
        `script-src 'report-sample' 'self'`,
        `style-src 'report-sample' 'self'`,
        `style-src-attr 'unsafe-inline'`,
        `worker-src 'report-sample' blob:`,
        `report-uri /csp-report`,
      ].join('; '),
    );
  }));

  it('should serve a coherent config with SENTRY_DSN_FRONTEND set', withNginx({
    SSL_TYPE: 'selfsign',
    SENTRY_DSN_FRONTEND: 'https://abcdef0123456789abcdef0123456789@some-dsn.ingest.sentry.io/1234567890123456',
  }, async ports => {
    // when
    const res = await request(`https://localhost:${ports.https}`);

    // then
    assert.equal(res.status, 200);
    assert.equal(
      res.headers.get('Content-Security-Policy'),
      [
        `default-src 'report-sample' 'none'`,
        `connect-src 'self' https://some-dsn.ingest.sentry.io https://translate.google.com https://translate.googleapis.com`,
        `font-src 'self'`,
        `form-action 'self'`,
        `frame-ancestors 'none'`,
        `frame-src 'self' https://getodk.github.io/central/`,
        `img-src data: https:`,
        `manifest-src 'self'`,
        `media-src 'none'`,
        `object-src 'none'`,
        `script-src 'report-sample' 'self'`,
        `style-src 'report-sample' 'self'`,
        `style-src-attr 'unsafe-inline'`,
        `worker-src 'report-sample' blob:`,
        `report-uri /csp-report`,
      ].join('; '),
    );
  }));

  it('should serve a coherent config with SENTRY_DSN_FRONTEND blank', withNginx({
    SSL_TYPE: 'selfsign',
    SENTRY_DSN_FRONTEND: '',
  }, async ports => {
    // when
    const res = await request(`https://localhost:${ports.https}`);

    // then
    assert.equal(res.status, 200);
    assert.equal(
      res.headers.get('Content-Security-Policy'),
      [
        `default-src 'report-sample' 'none'`,
        `connect-src 'self'  https://translate.google.com https://translate.googleapis.com`,
        `font-src 'self'`,
        `form-action 'self'`,
        `frame-ancestors 'none'`,
        `frame-src 'self' https://getodk.github.io/central/`,
        `img-src data: https:`,
        `manifest-src 'self'`,
        `media-src 'none'`,
        `object-src 'none'`,
        `script-src 'report-sample' 'self'`,
        `style-src 'report-sample' 'self'`,
        `style-src-attr 'unsafe-inline'`,
        `worker-src 'report-sample' blob:`,
        `report-uri /csp-report`,
      ].join('; '),
    );
  }));
});

function dockerCompose(opts, ...args) {
  return execSync(
    `docker compose --file ./nginx/nginx.test.docker-compose.yml ${args.join(' ')}`,
    { stdio:'inherit', ...opts },
  );
}

function withNginx(env, fn) {
  return async () => {
    if(!env.HTTP_PORT)  env.HTTP_PORT  = ++testPortOffset;
    if(!env.HTTPS_PORT) env.HTTPS_PORT = ++testPortOffset;

    dockerCompose({ env }, `up --build --force-recreate --detach --wait ${service}`);

    await fn({ http:env.HTTP_PORT, https:env.HTTPS_PORT });
  };
}

const { execSync } = require('node:child_process');

const { assert } = require('../lib');
const request = require('./request');

const log = (...args) => console.log('[setup-odk.spec]', ...args);
const service = 'nginx-test-setup-odk';

describe('setup-odk.sh', function() {
  describe('SENTRY_DSN_FRONTEND', () => {
    afterEach(() => {
      log('--- CONTAINER LOGS ---');
      dockerCompose({}, `logs --timestamps ${service}`);
      log('--- END CONTAINER LOGS ---');
    });
    after(() => {
      dockerCompose({}, `down --remove-orphans --volumes`);
    });

    [
      [ undefined, 'https://o-fake-dsn.ingest.sentry.io' ],
      [
        'https://abcdef0123456789abcdef0123456789@some-dsn.ingest.sentry.io/1234567890123456',
        'https://some-dsn.ingest.sentry.io',
      ],
      [ '', '' ],
      [ 'bad-format', '' ],
      [ 'https://abcdef0123456789abcdef0123456789@some-dsn.ingest.sentry.io/', '' ],
    ].forEach(([ SENTRY_DSN_FRONTEND, expectedCspEntry ]) => {
      it(`should generate expected CSP for SENTRY_DSN_FRONTEND='${SENTRY_DSN_FRONTEND}'`, withNginx({
        SENTRY_DSN_FRONTEND,
      }, async () => {
        // when
        const res = await request(`https://localhost:10003`);

        // then
        assert.equal(res.status, 200);
        assert.equal(
          res.headers.get('Content-Security-Policy'),
          [
            `default-src 'report-sample' 'none'`,
            `connect-src 'self' ${expectedCspEntry} https://translate.google.com https://translate.googleapis.com`,
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
  });
});

function dockerCompose(opts, ...args) {
  return execSync(
    `docker compose --file ./nginx/nginx.test.docker-compose.yml ${args.join(' ')}`,
    { stdio:'inherit', ...opts },
  );
}

function withNginx(env, fn) {
  return async function() {
    this.timeout(10_000);

    dockerCompose({ env }, `up --build --force-recreate --detach --wait ${service}`);

    await fn();
  };
}

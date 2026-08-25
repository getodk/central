const assert = require('node:assert/strict');

const { test }  = require('@playwright/test');

const {
  assertSentryReceived,
  resetSentryMock,
} = require('../lib');

test.beforeEach(async ({ page }) => {
  await resetSentryMock();

  page.on('console', msg => {
    console.log(new Date(), msg.type(), msg.text());
  });
});

test.describe('odk-central-backend API calls', () => {
  [
    // root-app
    '/',

    // forms-app
    '/f/Xaa1G84VxWFgEQlXQny3AzzWBAzOzGQ?st=d3RVbGZZeX0paTNxxPIUbiyNzevgu9X1GToIIodO9bgu2UZsZMQ8V4QlETre3D9a',
  ].forEach(path => {
    test(`should not be blocked from ${path}`, async ({ page }) => {
      // given
      await page.goto(`https://odk-nginx.example.test:9001/${stripLeadingSlash(path)}`);

      // when
      const res = await page.evaluate(async () => {
        const res = await fetch('https://odk-nginx.example.test:9001/v1/projects');
        const { status } = res;
        const body = await res.text();
        return { status, body };
      });

      // then
      assert.deepEqual(res, { status:200, body:'OK' });
      await assertSentryReceived(/* nothing */);
    });
  });
});

test.describe('frontend Sentry reports', () => {
  [
    // root-app
    '/',

    // forms-app
    '/f/Xaa1G84VxWFgEQlXQny3AzzWBAzOzGQ?st=d3RVbGZZeX0paTNxxPIUbiyNzevgu9X1GToIIodO9bgu2UZsZMQ8V4QlETre3D9a',
  ].forEach(path => {
    test(`should not be blocked from ${path}`, async ({ page }) => {
      // given
      await page.goto(`https://odk-nginx.example.test:9001/${stripLeadingSlash(path)}`);

      // when
      const res = await page.evaluate(async () => {
        const res = await fetch('https://o-fake-dsn.ingest.sentry.io/api/1234567890123456/envelope/', { method:'POST', body:'{"test":true}' });
        const { status } = res;
        const body = await res.text();
        return { status, body };
      });

      // then
      assert.deepEqual(res, { status:200, body:'envelope:OK' });
      await assertSentryReceived(/* nothing */);
    });
  });
});

test('catches style-src-elem violation samples', async ({ page }) => {
  // given
  await page.goto('https://odk-nginx.example.test:9001');

  // when
  await page.evaluate(() => {
    /* global document */
    const style = document.createElement('style');
    style.textContent = 'body { background-color:red }';
    document.head.appendChild(style);
  });
  // and
  await new Promise(resolve => setTimeout(resolve, 100));

  // then
  await assertSentryReceived(
    {
      'report': {
        'csp-report': {
          'document-uri': 'https://odk-nginx.example.test:9001/',
          'referrer': '',
          'violated-directive': 'style-src-elem',
          'effective-directive': 'style-src-elem',
          'original-policy': `default-src 'report-sample' 'none'; connect-src 'self' https://o-fake-dsn.ingest.sentry.io https://translate.google.com https://translate.googleapis.com; font-src 'self'; form-action 'self'; frame-ancestors 'none'; frame-src 'self' https://getodk.github.io/central/; img-src data: https:; manifest-src 'self'; media-src 'none'; object-src 'none'; script-src 'report-sample' 'self'; style-src 'report-sample' 'self'; style-src-attr 'unsafe-inline'; worker-src 'report-sample' blob:; report-uri /csp-report`,
          'disposition': 'enforce',
          'blocked-uri': 'inline',
          'line-number': 5,
          'column-number': 19,
          'status-code': 200,
          'script-sample': 'body { background-color:red }',
        },
      },
    },
  );
});

function stripLeadingSlash(path) {
  return path.startsWith('/') ? path.substring(1) : path;
}

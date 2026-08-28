/* global document */

const assert = require('node:assert/strict');

const { test }  = require('@playwright/test');

const {
  assertSentryReceived,
  getReceivedSentryCspReports,
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
          'line-number': 4,
          'column-number': 19,
          'status-code': 200,
          'script-sample': 'body { background-color:red }',
        },
      },
    },
  );
});

test.describe('frame rules', () => {
  const HOSTS = {
    odkCentral: { origin:'https://odk-nginx.example.test:9001/', path:'' },
    thirdParty: { origin:'https://o-fake-dsn.ingest.sentry.io',  path:'/__mock_sentry/no-csp' },
  };
  const ALL_HOSTS = Object.keys(HOSTS);

  [
    {
      description: 'central-backend',
      centralUrl: 'https://odk-nginx.example.test:9001/v1/projects',
      allowedFrameAncestors: [ /*none*/ ],
      allowedFrameDestinations: [ /*none*/ ],
    },
    {
      description: 'central-frontend',
      centralUrl: 'https://odk-nginx.example.test:9001/',
      allowedFrameAncestors: [ /*none*/ ],
      allowedFrameDestinations: [
        'odkCentral',
      ],
    },
    {
      description: 'blank-page',
      centralUrl: 'https://odk-nginx.example.test:9001/blank.html',
      allowedFrameAncestors: [
        'odkCentral',
      ],
      allowedFrameDestinations: [ /*none*/ ],
    },
    {
      description: 'enketo',
      centralUrl: 'https://odk-nginx.example.test:9001/-/some/enketo/path',
      allowedFrameAncestors: [
        'odkCentral',
      ],
      allowedFrameDestinations: [ /*none*/ ],
    },
    {
      description: 'form-wrapper',
      centralUrl: 'https://odk-nginx.example.test:9001/projects/1/xml-form-id/submissions/new',
      allowedFrameAncestors: [ /*none*/ ],
      allowedFrameDestinations: [
        'odkCentral',
      ],
    },
    {
      description: 'oidc-callback',
      centralUrl: 'https://odk-nginx.example.test:9001/v1/oidc/callback',
      // Nothing is exlicitly disallowed here, because this URL is left
      // to manage its own Content-Security-Policy headers.
      allowedFrameAncestors: ALL_HOSTS,
      allowedFrameDestinations: ALL_HOSTS,
    },
  ].forEach(({ description, centralUrl, allowedFrameDestinations, allowedFrameAncestors }) => {
    if(!allowedFrameAncestors.every(allowed => ALL_HOSTS.includes(allowed)))
      throw new Error(`Unrecognised frame ancestors(s) whitelisted: ${JSON.stringify({ allowedFrameAncestors, validFrameAncestors: ALL_HOSTS })}`);
    if(!allowedFrameDestinations.every(allowed => ALL_HOSTS.includes(allowed)))
      throw new Error(`Unrecognised frame destination(s) whitelisted: ${JSON.stringify({ allowedFrameDestinations, validFrameDestinations: ALL_HOSTS })}`);

    test.describe(`${description} (${centralUrl})`, () => {
      for(const [ hostName, host ] of Object.entries(HOSTS)) {
        const hostUrl = host.origin + host.path;
        const allowFrameAncestor = allowedFrameAncestors.includes(hostName);
        test(`frame-ancestors ${allowFrameAncestor ? 'should' : 'should NOT'} allow "${hostName}" (${hostUrl})`, async ({ page }) => {
          // given
          await page.goto(hostUrl);

          // when
          await page.evaluate(({ centralUrl }) => {
            const frame = document.createElement('iframe');
            frame.src = centralUrl;
            document.body.appendChild(frame);
          }, { centralUrl });
          // and
          await new Promise(resolve => setTimeout(resolve, 100));

          // then
          if(allowFrameAncestor) {
            await assertSentryReceived(/* nothing */);
          } else {
            const receivedSentryReports = await getReceivedSentryCspReports();
            receivedSentryReports.forEach(r => delete r.report['csp-report']['original-policy']);
            assert.deepEqual(receivedSentryReports, [
              {
                'report': {
                  'csp-report': {
                    'document-uri': new URL(centralUrl).origin + '/',
                    'referrer': '',
                    'violated-directive': 'frame-ancestors',
                    'effective-directive': 'frame-ancestors',
                    'disposition': 'enforce',
                    'blocked-uri': new URL(centralUrl).origin + '/',
                    'status-code': 200,
                    'script-sample': '',
                  },
                },
              },
            ]);
          }
        });

        const allowFrameSrc = allowedFrameDestinations.includes(hostName);
        test(`frame-src ${allowFrameSrc ? 'should' : 'should NOT'} allow "${hostName}" (${hostUrl})`, async ({ page }) => {
          // given
          await page.goto(centralUrl);

          // when
          await page.evaluate(({ hostUrl }) => {
            const frame = document.createElement('iframe');
            frame.src = hostUrl;
            document.body.appendChild(frame);
          }, { hostUrl });
          // and
          await new Promise(resolve => setTimeout(resolve, 100));

          // then
          const receivedSentryReports = (await getReceivedSentryCspReports())
              // ignore frame-ancestors rules - they kick in after frame-src rules have been checked
              .filter(r => r.report['csp-report']['violated-directive'] !== 'frame-ancestors');
          if(allowFrameSrc) {
            assert.deepEqual(receivedSentryReports, [ /*nothing*/ ]);
          } else {
            receivedSentryReports.forEach(r => delete r.report['csp-report']['original-policy']);
            assert.deepEqual(receivedSentryReports, [
              {
                'report': {
                  'csp-report': {
                    'document-uri': centralUrl,
                    'referrer': '',
                    'violated-directive': 'frame-src',
                    'effective-directive': 'frame-src',
                    'disposition': 'enforce',
                    'blocked-uri': host.origin,
                    'status-code': 200,
                    'script-sample': '',
                  },
                },
              },
            ]);
          }
        });
      }
    });
  });
});

function stripLeadingSlash(path) {
  return path.startsWith('/') ? path.substring(1) : path;
}

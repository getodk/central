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
          'original-policy': `default-src 'report-sample' 'none'; connect-src 'self' https://translate.google.com https://translate.googleapis.com; font-src 'self'; form-action 'self'; frame-ancestors 'none'; frame-src 'self' https://getodk.github.io/central/; img-src data: https:; manifest-src 'self'; media-src 'none'; object-src 'none'; script-src 'report-sample' 'self'; style-src 'report-sample' 'self'; style-src-attr 'unsafe-inline'; worker-src 'report-sample' blob:; report-uri /csp-report`,
          'disposition': 'report',
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

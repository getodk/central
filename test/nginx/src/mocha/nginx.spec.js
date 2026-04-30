const tls = require('node:tls');
const { Readable } = require('stream');

const {
  assert,
  assertSentryReceived,
  requestSentryMock,
  resetSentryMock,
} = require('../lib');

const none = `'none'`;
const reportSample = `'report-sample'`;
const self = `'self'`;
const unsafeInline = `'unsafe-inline'`;
const wasmUnsafeEval = `'wasm-unsafe-eval'`;

// Central has notifications defined in https://github.com/getodk/central/tree/master/docs, and served from GitHub Pages.  These include:
//
// * https://getodk.github.io/central/news.html
// * https://getodk.github.io/central/outdated-version.html
const centralNotifications = 'https://getodk.github.io/central/';

const asArray = val => {
  if (val == null) return [];
  if (Array.isArray(val)) return val;
  return [val];
};
const allowGoogleTranslate = ({ 'connect-src':connectSrc, 'img-src':imgSrc, ...others }) => {
  connectSrc = asArray(connectSrc);
  if(!connectSrc.includes('https:')) connectSrc.push(
    'https://translate.google.com',
    'https://translate.googleapis.com',
  );

  imgSrc = asArray(imgSrc);
  if(!imgSrc.includes('https:')) imgSrc.push(
    'https://translate.google.com',
  );

  return { ...others, 'connect-src':connectSrc, 'img-src':imgSrc };
};

const contentSecurityPolicies = {
  'backend-strict': {
    block: {
      'default-src':     'NOTE:FROM-BACKEND:block',
      'form-action':     'NOTE:FROM-BACKEND:block',
      'frame-ancestors': 'NOTE:FROM-BACKEND:block',
    },
    reportOnly: {
      'default-src': [
        reportSample,
        none,
      ],
      'form-action': none,
      'frame-ancestors': none,
      'img-src': 'http://odk-nginx.example.test/favicon.ico', // http: scheme permits secure upgrade to https://
      'report-uri':  '/csp-report',
    },
  },
  'backend-unmodified': {
    block: {
      'default-src':     'NOTE:FROM-BACKEND:block',
      'form-action':     'NOTE:FROM-BACKEND:block',
      'frame-ancestors': 'NOTE:FROM-BACKEND:block',
    },
    reportOnly: {
      'default-src':     'NOTE:FROM-BACKEND:reportOnly',
      'form-action':     'NOTE:FROM-BACKEND:reportOnly',
      'frame-ancestors': 'NOTE:FROM-BACKEND:reportOnly',
    },
  },
  'blank-html': {
    block: allowGoogleTranslate({
      'default-src': [
        reportSample,
        none,
      ],
      'form-action': self, // allow decrypted zip downloads from central-frontend
      'frame-ancestors': self,
      'img-src': 'http://odk-nginx.example.test/favicon.ico', // http: scheme permits secure upgrade to https://
      'report-uri':  '/csp-report',
    }),
  },
  'central-frontend': {
    reportOnly: allowGoogleTranslate({
      'default-src': [
        reportSample,
        none,
      ],
      'connect-src': [
        self,
      ],
      'font-src':       self,
      'form-action': self,
      'frame-ancestors': none,
      'frame-src':      [
        self,
        centralNotifications,
      ],
      'img-src': [
        'data:',
        'https:',
      ],
      'manifest-src':   self,
      'media-src':      none,
      'object-src':     none,
      'script-src': [
        reportSample,
        self,
      ],
      'style-src': [
        reportSample,
        self,
      ],
      'style-src-attr': unsafeInline,
      'worker-src': [
        reportSample,
        'blob:',
      ],
      'report-uri':     '/csp-report',
    }),
  },
  enketo: {
    block: {
      'default-src':     'NOTE:FROM-BACKEND:block',
      'form-action':     'NOTE:FROM-BACKEND:block',
      'frame-ancestors': 'NOTE:FROM-BACKEND:block',
    },
    reportOnly: allowGoogleTranslate({
      'default-src': [
        reportSample,
        none,
      ],
      'connect-src': [
        self,
        'blob:',
        'https://maps.googleapis.com/',
        'https://maps.google.com/',
        'https://maps.gstatic.com/mapfiles/',
        'https://fonts.gstatic.com/',
        'https://fonts.googleapis.com/',
      ],
      'font-src': [
        self,
        'https://fonts.gstatic.com/',
      ],
      'form-action': self,
      'frame-ancestors': self,
      'frame-src': none,
      'img-src': [
        'data:',
        'blob:',
        'jr:',
        self,
        'https://maps.google.com/maps/',
        'https://maps.gstatic.com/mapfiles/',
        'https://maps.googleapis.com/maps/',
        'https://tile.openstreetmap.org/',
      ],
      'manifest-src': none,
      'media-src': [
        'blob:',
        'jr:',
        self,
      ],
      'object-src': none,
      'script-src': [
        reportSample,
        unsafeInline,
        self,
        'https://maps.googleapis.com/maps/api/js/',
        'https://maps.google.com/maps/',
        'https://maps.google.com/maps-api-v3/api/js/',
      ],
      'style-src': [
        unsafeInline,
        self,
        'https://fonts.googleapis.com/css',
      ],
      'style-src-attr': unsafeInline,
      'report-uri': '/csp-report',
    }),
  },
  'web-forms': {
    reportOnly: allowGoogleTranslate({
      'default-src': [
        reportSample,
        none,
      ],
      'connect-src': [
        self,
        'https:',
      ],
      'font-src': [
        self,
        'data:',
      ],
      'form-action': self,
      'frame-ancestors': self,
      'frame-src': [
        self, // web-forms pages also host /enketo-passthrough/ URLs via iframes
        centralNotifications,
      ],
      'img-src': [
        'blob:',
        'data:',
        'https:',
      ],
      'manifest-src': self,
      'media-src': [
        'blob:',
      ],
      'object-src': none,
      'script-src': [
        reportSample,
        self,
        wasmUnsafeEval,
      ],
      'style-src': [
        self,
        unsafeInline,
      ],
      'worker-src': [
        reportSample,
        'blob:',
        'data:',
      ],
      'report-uri': '/csp-report',
    }),
  },
};

describe('Content-Security-Policy definitions', () => {
  const requiredDirectives = [
    'default-src',
    'form-action',
    'frame-ancestors',
  ];

  const supportsReportSample = [
    'default-src',
    'require-trusted-types-for',
    'script-src',
    'script-src-attr',
    'script-src-elem',
    'style-src',
    'style-src-attr',
    'style-src-elem',
    'worker-src',
  ];

  const headerNames = {
    block:      'Content-Security-Policy',
    reportOnly: 'Content-Security-Policy-Report-Only',
  };

  for(const [name, policies] of Object.entries(contentSecurityPolicies)) {
    describe(`policy: ${name}`, () => {
      for(const headerType of ['block', 'reportOnly']) {
        const policy = policies[headerType];
        if(!policy) continue;

        describe(`header: ${headerNames[headerType]}`, () => {
          it(`should have required directives: ${requiredDirectives}`, () => {
            assert.containsAllKeys(policy, requiredDirectives);
          });

          Object.entries(policy)
              .map    (([ key, directive ]) => [ key, asArray(directive) ])
              .filter (([ key, directive ]) => !(directive.length === 1 && directive[0] === `NOTE:FROM-BACKEND:${headerType}`)) // eslint-disable-line no-unused-vars
              .forEach(([ key, directive ]) => {
                describe(`directive: ${key}`, () => {
                  if(supportsReportSample.includes(key)) {
                    if(key.startsWith('style-src') && directive.includes(`'unsafe-inline'`)) {
                      // For style-* directives, report-sample will only provide a sample of inline violations.
                      it(`should not include 'report-sample' in directive '${key}' when 'unsafe-inline' is allowed`, () => {
                        // expect
                        assert.notInclude(directive, "'report-sample'");
                      });
                    } else {
                      it(`should include 'report-sample' in directive '${key}'`, () => {
                        // expect
                        assert.include(directive, "'report-sample'");
                      });
                    }
                  } else {
                    it(`should not include 'report-sample' in directive '${key}'`, () => {
                      // expect
                      assert.notInclude(directive, "'report-sample'");
                    });
                  }
                });
              });
        });
      }
    });
  }
});

describe('nginx config', () => {
  beforeEach(() => Promise.all([
    resetEnketoMock(),
    resetBackendMock(),
  ]));

  describe('SSL_TYPE=selfsign', () => {
    const { fetchHttp, fetchHttp6, fetchHttps, fetchHttps6 } = fetchFunctionsForPorts(9000, 9001);

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

          // spread subject to avoid https://github.com/mochajs/mocha/issues/5505
          assert.deepEqual({ ...certificate.subject }, {
            CN: 'invalid.local', // required for www.ssllabs.com/ssltest
          });

          socket.end();
        } catch(err) {
          socket.destroy(err);
        }
      });
      socket.on('end', resolve);
      socket.on('error', reject);
    }));

    standardTestSuite({
      fetchHttp,
      fetchHttp6,
      apiFetch:  fetchHttps,
      apiFetch6: fetchHttps6,
      forwardProtocol: 'https',
    });
  });

  describe('SSL_TYPE=upstream', () => {
    const { fetchHttp, fetchHttp6, fetchHttps, fetchHttps6 } = fetchFunctionsForPorts(10000, 10001);

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

    standardTestSuite({
      fetchHttp,
      fetchHttp6,
      apiFetch:  fetchHttp,
      apiFetch6: fetchHttp6,
      forwardProtocol: 'http', // it might be more efficient if this is always HTTPS
    });
  });
});

function standardTestSuite({ fetchHttp, fetchHttp6, apiFetch, apiFetch6, forwardProtocol }) {
  describe('response compression (Content-Encoding)', () => {
    [
      'gzip',
    ].forEach(format => {
      it(`should support ${format} for big files`, async () => {
        // given
        const headers = { 'Accept-Encoding':format };

        // when
        const res = await apiFetch('/10k-file.txt', { headers });

        // then
        assert.equal(res.status, 200);
        assert.equal(res.headers.get('Content-Encoding'), format);
      });
    });

    [
      'br',
      'deflate',
      'zstd',
    ].forEach(format => {
      it(`should not support ${format} for big files`, async () => {
        // given
        const headers = { 'Accept-Encoding':format };

        // when
        const res = await apiFetch('/10k-file.txt', { headers });

        // then
        assert.equal(res.status, 200);
        assert.isNull(res.headers.get('Content-Encoding'));
      });
    });
  });

  it('should serve generated client-config.json', async () => {
    // when
    const res = await apiFetch('/client-config.json');

    // then
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { oidcEnabled: false });
    assertSecurityHeaders(res, { csp:'central-frontend' });
  });

  it('should serve generated client-config.json (IPv6)', async () => {
    // when
    const res = await apiFetch6('/client-config.json');

    // then
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { oidcEnabled: false });
    assertSecurityHeaders(res, { csp:'central-frontend' });
  });

  it('should serve robots.txt', async () => {
    // when
    const res = await apiFetch('/robots.txt');

    // then
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('Content-Type'), 'text/plain');
    assert.equal(await res.text(), 'User-agent: *\nDisallow: /\n');
  });

  [
    [ '/index.html',                 'text/html',                 /<div id="app"><\/div>/ ],
    [ '/version.txt',                'text/plain',                /^versions:/ ],
    [ '/android-chrome-192x192.png', 'image/png',                 /^\n$/ ],
    [ '/android-chrome-512x512.png', 'image/png',                 /^\n$/ ],
    [ '/apple-touch-icon.png',       'image/png',                 /^\n$/ ],
    [ '/favicon.ico',                'image/x-icon',              /^\n$/ ],
    [ '/favicon-16x16.png',          'image/png',                 /^\n$/ ],
    [ '/favicon-32x32.png',          'image/png',                 /^\n$/ ],
    [ '/site.webmanifest',           'application/manifest+json', /^\n$/ ],
  ].forEach(([ path, expectedContentType, expectedContent ]) => {
    it(`${path} file should serve expected content`, async () => {
      // when
      const res = await apiFetch(path);

      // then
      assert.equal(res.status, 200);
      assert.match(await res.text(), expectedContent);
      assert.equal(res.headers.get('Content-Type'), expectedContentType);
      assertSecurityHeaders(res, { csp:'central-frontend' });
    });
  });

  [
    { request: '/-/some/enketo/path',                  expected: '/-/some/enketo/path' },
    { request: '/-',                                   expected: '/-' },
    { request: '/enketo-passthrough/some/enketo/path', expected: '/-/some/enketo/path' },
    { request: '/enketo-passthrough',                  expected: '/-' },
    { request: '/enketo-passthrough/enketoid',         expected: '/-/enketoid' },
  ].forEach(t => {
    it(`should forward to enketo; ${t.request}`, async () => {
      // when
      const res = await apiFetch(t.request);

      // then
      assert.equal(res.status, 200);
      assert.equal(await res.text(), 'OK');
      assertSecurityHeaders(res, { csp:'enketo' });

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
      const res = await apiFetch(t.request);

      // then
      assert.equal(res.status, 200);
      assert.equal(await res.text(), '<div id="app"></div>\n');
      assertSecurityHeaders(res, { csp:'central-frontend' });

      // and
      await assertEnketoReceivedNoRequests();
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

    { description: 'preview form',
      request: `/-/preview/${enketoId}`,
      expected: `f/${enketoId}/preview` },

    { description: 'new or draft submission',
      request: `/-/${enketoId}`,
      expected: `f/${enketoId}/new` },

    { description: 'new submission - enketoId starts with thanks',
      request: `/-/thanksokay`,
      expected: `f/thanksokay/new` },

    { description: 'new submission - enketoId ends with thanks',
        request: `/-/okaythanks`,
        expected: `f/okaythanks/new` },

    { description: 'new submission - enketoId contains thanks',
      request: `/-/okaythanksokay`,
      expected: `f/okaythanksokay/new` },

    { description: '/single appended to the URL that expects authenticated user (not a public link)',
      request: `/-/single/${enketoId}`,
      expected: `f/${enketoId}/new?single=true` },

    { description: '/single removed from the public link to make it multiple submission Form',
      request: `/-/${enketoId}?st=${sessionToken}`,
      expected: `f/${enketoId}?st=${sessionToken}&single=false` },
  ];
  enketoRedirectTestData.forEach(t => {
    it('should redirect old enketo links to central-frontend; ' + t.description, async () => {
      // when
      const res = await apiFetch(t.request);

      // then
      assert.equal(res.status, 301);
      assert.equal(res.headers.get('location'), `${forwardProtocol}://odk-nginx.example.test/${t.expected}`);
      // and
      await assertEnketoReceivedNoRequests();
    });
  });

  [
    '/-/thanks',
    '/-/connection',
    '/-/login',
    '/-/logout',
    '/-/api',
    '/-/preview',
    '/-/edit/enketoid',
  ].forEach(request => {
    it(`should not redirect ${request} to central-frontend`, async () => {
      // when
      const res = await apiFetch(request);

      // then
      assert.equal(res.status, 200);
      assert.equal(await res.text(), 'OK');
      assertSecurityHeaders(res, { csp:'enketo' });

      // // and
      await assertEnketoReceived(
        { method:'GET', path: request },
      );
    });
  });

  describe('blank.html', () => {
    [
      '/blank.html',
      '/-/single/check-submitted',
    ].forEach(path => {
      it(`should serve blank page on ${path}`, async () => {
        // when
        const res = await apiFetch(path);

        // then
        assert.equal(res.status, 200);
        assert.isEmpty((await res.text()).trim());
        assert.equal(res.headers.get('Content-Type'), 'text/html');
        assertSecurityHeaders(res, { csp:'blank-html' });
        await assertEnketoReceivedNoRequests();
      });
    });
  });

  it('/v1/... should forward to backend', async () => {
    // when
    const res = await apiFetch('/v1/some/central-backend/path');

    // then
    assert.equal(res.status, 200);
    assert.equal(await res.text(), 'OK');
    assertSecurityHeaders(res, { csp:'backend-strict' });
    // and
    await assertBackendReceived(
      { method:'GET', path:'/v1/some/central-backend/path' },
    );
  });

  it('/oidc/callback should serve Content-Security-Policy from backend', async () => {
    // when
    const res = await apiFetch('/v1/oidc/callback');

    // then
    assert.equal(res.status, 200);
    assert.equal(await res.text(), 'OK');
    assertSecurityHeaders(res, { csp:'backend-unmodified' });
  });

  it('should set x-forwarded-proto header to "https"', async () => {
    // when
    const res = await apiFetch('/v1/reflect-headers');
    // then
    assert.equal(res.status, 200);
    assertSecurityHeaders(res, { csp:'backend-strict' });

    // when
    const body = await res.json();
    // then
    assert.equal(body['x-forwarded-proto'], 'https');
  });

  it('should override supplied x-forwarded-proto header', async () => {
    // when
    const res = await apiFetch('/v1/reflect-headers', {
      headers: {
        'x-forwarded-proto': 'http',
      },
    });
    // then
    assert.equal(res.status, 200);
    // and
    assertSecurityHeaders(res, { csp:'backend-strict' });

    // when
    const body = await res.json();
    // then
    assert.equal(body['x-forwarded-proto'], 'https');
  });

  describe('web-forms Content-Security-Policy special handling', () => {
    // See https://github.com/getodk/central/pull/1467 for relevant paths
    [
      '/projects/1/forms/some_xml_form_id/submissions/new',
      '/projects/1/forms/some_xml_form_id/submissions/new/',
      '/projects/1/forms/some_xml_form_id/submissions/new?fake=true&query=false&param=2',
      '/projects/1/forms/some_xml_form_id/submissions/new/?fake=true&query=false&param=2',
      '/projects/1/forms/some_xml_form_id/submissions/new/offline',
      '/projects/1/forms/some_xml_form_id/submissions/new/offline/',
      '/projects/1/forms/some_xml_form_id/submissions/00000000-0000-0000-0000-000000000000/edit',
      '/projects/1/forms/some_xml_form_id/submissions/00000000-0000-0000-0000-000000000000/edit/',
      '/projects/1/forms/some_xml_form_id/preview',
      '/projects/1/forms/some_xml_form_id/preview/',
      '/projects/1/forms/some_xml_form_id/draft/submissions/new',
      '/projects/1/forms/some_xml_form_id/draft/submissions/new/',
      '/projects/1/forms/some_xml_form_id/draft/submissions/new/offline',
      '/projects/1/forms/some_xml_form_id/draft/submissions/new/offline/',
      '/projects/1/forms/some_xml_form_id/draft/preview',
      '/projects/1/forms/some_xml_form_id/draft/preview/',
      '/f/anything',
      '/f/anything/',
      '/f/SCUZtGUjC7fgL2O1AXqqG8YN8Jdkthi?st=vcm7tFeqEFR1Itrmjq50KEFSrK$osbXrtu',
      '/f/SCUZtGUjC7fgL2O1AXqqG8YN8Jdkthi/?st=vcm7tFeqEFR1Itrmjq50KEFSrK$osbXrtu',

      // invalid submission ID - currently not checking for valid UUIDs
      '/projects/1/forms/some_xml_form_id/submissions/any-old-nonsense/edit',
      '/projects/1/forms/some_xml_form_id/submissions/any-old-nonsense/edit/',

      // longer project id, shorter form ID
      '/projects/99999/forms/_/submissions/new',
      '/projects/99999/forms/_/submissions/new/',
    ].forEach(path => {
      it(`should add specific Content Security Policy restrictions for webforms path: ${path}`, async () => {
        // when
        const res = await apiFetch(path);

        // then
        assert.equal(res.status, 200);
        assert.equal(await res.text(), '<div id="app"></div>\n');
        assertSecurityHeaders(res, { csp:'web-forms' });
      });
    });

    [
      '/projects/1/forms/MarkdownExamples', // no /preview
      '/projects/1/forms/preview/perview', // misspelt preview
      '/projects/3/forms/preview', // form named "preview", but not the actual preview path

      // invalid project ids
      '/projects/1-not-just-a-number-1/forms/some_xml_form_id/submissions/new',
      '/projects/1-not-just-a-number-1/forms/some_xml_form_id/submissions/new/',
      '/projects/1-not-just-a-number-1/forms/some_xml_form_id/submissions/00000000-0000-0000-0000-000000000000/edit',
      '/projects/1-not-just-a-number-1/forms/some_xml_form_id/submissions/00000000-0000-0000-0000-000000000000/edit/',
      '/projects/1-not-just-a-number-1/forms/some_xml_form_id/preview',
      '/projects/1-not-just-a-number-1/forms/some_xml_form_id/preview/',
      '/projects/1-not-just-a-number-1/forms/some_xml_form_id/draft/submissions/new',
      '/projects/1-not-just-a-number-1/forms/some_xml_form_id/draft/submissions/new/',
      '/projects/1-not-just-a-number-1/forms/some_xml_form_id/draft/preview',
      '/projects/1-not-just-a-number-1/forms/some_xml_form_id/draft/preview/',

      // missing project id
      '/projects//forms/some_xml_form_id/submissions/new',
      '/projects//forms/some_xml_form_id/submissions/new/',

      // missing form id
      '/projects/1/forms//preview',
      '/projects/1/forms//preview/',

      // missing submission ID
      '/projects/1/forms/some_xml_form_id/submissions//edit',
      '/projects/1/forms/some_xml_form_id/submissions//edit/',

      // all /f/* should be valid
      '/f',
      '/f/',
    ].forEach(path => {
      it(`should serve standard frontend Content Security Policy for fake webforms path: ${path}`, async () => {
        // when
        const res = await apiFetch(path);

        // then
        assert.equal(res.status, 200);
        assert.equal(await res.text(), '<div id="app"></div>\n');
        assertSecurityHeaders(res, { csp:'central-frontend' });
      });
    });
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

  describe('general caching', () => {
    [
      // general
      [ '/client-config.json',       'revalidate' ],
      [ '/robots.txt',               'revalidate' ],
      [ '/version.txt',              'revalidate' ],

      // central-frontend - unversioned
      [ '/',                         'revalidate' ],
      [ '/index.html',               'revalidate' ],
      [ '/blank.html',               'revalidate' ],
      [ '/favicon.ico',              'revalidate' ],

      // central-frontend - versioned
      [ '/assets/actor-link-CHKNLRJ6.js',                  'immutable' ],
      [ '/assets/branch-data-NQSuaxke.js',                 'immutable' ],
      [ '/assets/breadcrumbs-P9Q8Sr8V.js',                 'immutable' ],
      [ '/assets/chunky-array-CWqL2QBf.js',                'immutable' ],
      [ '/assets/style-BAOwY-Kl.css',                      'immutable' ],
      [ '/assets/who-va@2x-KiG_UkDd.jpg',                  'immutable' ],
      [ '/assets/socio-economic@2x-DT8M7CaZ.jpg',          'immutable' ],
      [ '/fonts/icomoon.ttf',                              'revalidate' ],
      [ '/fonts/icomoon.ttf?',                             'revalidate' ],
      [ '/fonts/icomoon.ttf?ohpk4j',                       'immutable' ],
    ].forEach(([ path, expectedCacheStrategy ]) => {
      [ 'GET', 'HEAD' ].forEach(method => {
        it(`${method} ${path} should be served with cache strategy: ${expectedCacheStrategy}`, async () => {
          // when
          const res = await apiFetch(path, { method });

          // then
          assert.equal(res.status, 200);
          // and
          assertCacheStrategyApplied(res, expectedCacheStrategy);
        });
      });

      [ 'POST', 'PUT', 'DELETE' ].forEach(method => {
        it(`${method} ${path} should not be allowed`, async () => {
          // when
          const res = await apiFetch(path, { method });

          // then
          assert.equal(res.status, 405);
        });
      });
    });
  });

  describe('backend caching', () => {
    [
      [ '/v1/foo',                   'passthrough' ],
      [ '/v1/foo/bar/baz',           'passthrough' ],
    ].forEach(([ path, expectedCacheStrategy ]) => {
      [ 'GET', 'HEAD' ].forEach(method => {
        it(`${method} ${path} should be served with cache strategy: ${expectedCacheStrategy}`, async () => {
          // when
          const res = await apiFetch(path, { method });

          // then
          assert.equal(res.status, 200);

          // and
          assertCacheStrategyApplied(res, expectedCacheStrategy);
        });
      });
    });

    it('should return cache headers from the backend', async () => {
      // when
      const res = await apiFetch('/v1/projects');

      // then
      assert.equal(res.status, 200);

      // and
      assert.equal(res.headers.get('Cache-Control'), 'private, max-age=3600');
      assert.equal(res.headers.get('Vary'), 'Cookie');
    });
  });

  describe('enketo caching', () => {
    [
      [ '/-/preview/some-id',                              'single-use' ],
      [ '/-/fonts/OpenSans-Bold-webfont.woff',             'revalidate' ],
      [ '/-/fonts/OpenSans-Regular-webfont.woff',          'revalidate' ],
      [ '/-/fonts/fontawesome-webfont.woff?v=4.6.2',       'immutable'  ],
      [ '/-/css/theme-kobo.css',                           'revalidate' ],
      [ '/-/js/build/enketo-webform.js',                   'revalidate' ],
      [ '/-/js/build/chunks/chunk-BKEADX6Q.js',            'immutable'  ],
      [ '/-/js/build/chunks/chunk-Q3Q473PS.js',            'immutable'  ],
      [ '/-/js/build/chunks/chunk-3RPRB7E5.js',            'immutable'  ],
      [ '/-/css/theme-kobo.print.css',                     'revalidate' ],
      [ '/-/images/icon_180x180.png',                      'revalidate' ],
      [ '/-/images/favicon.ico',                           'revalidate' ],
      [ '/-/locales/build/en/translation-combined.json',   'revalidate' ],
      [ '/-/transform/xform/some-id',                      'single-use' ],
      [ '/-/submission/max-size/some-id',                  'single-use' ],
      [ '/-/x/0n1W082ZWvx1O7XDsmHNqfwSrIjeeIH',            'revalidate' ], // offline Form
      [ '/-/x/0n1W082ZWvx1O7XDsmHNqfwSrIjeeIH?st=ieLWu5eDOZlx5LgYmigfSVo2tDVAyca3gaZs%24t3qJcPBLJmrnmzkzw5rH9pl%21OaJ',
                                                           'revalidate' ], // offline public Form
      [ '/-/x/fonts/OpenSans-Bold-webfont.woff',           'revalidate' ],
      [ '/-/x/fonts/OpenSans-Regular-webfont.woff',        'revalidate' ],
      [ '/-/x/fonts/fontawesome-webfont.woff?v=4.6.2',     'immutable'  ],
      [ '/-/x/css/theme-kobo.css',                         'revalidate' ],
      [ '/-/x/js/build/enketo-webform.js',                 'revalidate' ],
      [ '/-/x/js/build/chunks/chunk-BKEADX6Q.js',          'immutable'  ],
      [ '/-/x/js/build/chunks/chunk-Q3Q473PS.js',          'immutable'  ],
      [ '/-/x/js/build/chunks/chunk-3RPRB7E5.js',          'immutable'  ],
      [ '/-/x/css/theme-kobo.print.css',                   'revalidate' ],
      [ '/-/x/images/icon_180x180.png',                    'revalidate' ],
      [ '/-/x/images/favicon.ico',                         'revalidate' ],
      [ '/-/x/locales/build/en/translation-combined.json', 'revalidate' ],
      [ '/-/x/offline-app-worker.js',                      'revalidate' ],
    ].forEach(([ path, expectedCacheStrategy ]) => {
      [ 'GET', 'HEAD' ].forEach(method => {
        it(`${method} ${path} should be served with cache strategy: ${expectedCacheStrategy}`, async () => {
          // when
          const res = await apiFetch(path, { method });

          // then
          assert.equal(res.status, 200);
          // and
          await assertEnketoReceived({ method, path });
          // and
          assertCacheStrategyApplied(res, expectedCacheStrategy);
          // and
          assertSecurityHeaders(res, { csp:'enketo' });
        });
      });

      [ 'POST', 'PUT', 'DELETE' ].forEach(method => {
        it(`${method} ${path} should be served with cache strategy: single-use`, async () => {
          // when
          const res = await apiFetch(path, { method });

          // then
          assert.equal(res.status, 200);
          // and
          await assertEnketoReceived({ method, path });
          // and
          assertCacheStrategyApplied(res, 'single-use');
          // and
          assertSecurityHeaders(res, { csp:'enketo' });
        });
      });
    });
  });

  describe('CSP reports', () => {
    beforeEach(() => Promise.all([
      resetSentryMock(),
    ]));

    it('POST /csp-report should forward requests to Sentry', async () => {
      // when
      const res = await apiFetch('/csp-report', {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ example:1 }),
      });

      // then
      assert.equal(res.status, 200);
      assert.equal(await res.text(), 'OK');
      // and
      await assertSentryReceived({ report:{ example:1 } });
    });

    describe('Sentry behaviour with unexpected SNI values', () => {
      // These tests are a control to demonstrate that the local fake Sentry is
      // behaving similarly to sentry.io, which rejects requests which do not
      // include a Server Name Indiciation (SNI) extension during TLS/HTTPS.
      // We also test for an unexpected value in the SNI extension.
      // See: https://en.wikipedia.org/wiki/Server_Name_Indication

      it('should accept requests with correct SNI host', async () => {
        // when
        await requestSentryMock({ servername:'o-fake-dsn.ingest.sentry.io' });

        // then
        // No error was thrown :¬)
      });

      it('should reject requests without SNI host', async () => {
        // given
        let caught;

        // when
        try {
          await requestSentryMock({ servername:'' });
        } catch(err) {
          caught = err;
        }

        // then
        assert.isOk(caught);
        assert.equal(caught.code, 'ECONNRESET');
        // and
        await assertSentryReceived({ error:`Server cert had unexpected CN: 'default'` });
      });

      [ 'bad.example.test' ].forEach(servername => {
        it(`should reject requests with SNI host: "${servername}"`, async () => {
          // given
          let caught;

          // when
          try {
            await requestSentryMock({ servername });
          } catch(err) {
            caught = err;
          }

          // then
          assert.isOk(caught);
          assert.equal(caught.code, 'ECONNRESET');
          // and
          await assertSentryReceived({ error:`SNICallback: rejecting unexpected servername: ${servername}` });
        });
      });
    });
  });
}

function fetchFunctionsForPorts(httpPort, httpsPort) {
  return { fetchHttp, fetchHttp6, fetchHttps, fetchHttps6 };

  function fetchHttp(path, options) {
    if(!path.startsWith('/')) throw new Error('Invalid path.');
    return request(`http://127.0.0.1:${httpPort}${path}`, options);
  }

  function fetchHttp6(path, options) {
    if(!path.startsWith('/')) throw new Error('Invalid path.');
    return request(`http://[::1]:${httpPort}${path}`, options);
  }

  function fetchHttps(path, options) {
    if(!path.startsWith('/')) throw new Error('Invalid path.');
    return request(`https://127.0.0.1:${httpsPort}${path}`, options);
  }

  function fetchHttps6(path, options) {
    if(!path.startsWith('/')) throw new Error('Invalid path.');
    return request(`https://[::1]:${httpsPort}${path}`, options);
  }
}

function assertEnketoReceivedNoRequests() {
  return assertEnketoReceived();
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

        const body = new Readable({ read:() => {} });
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

function assertCacheStrategyApplied(res, expectedCacheStrategy) {
  switch (expectedCacheStrategy) {
    case 'immutable':
      assert.equal(res.headers.get('Cache-Control'), 'max-age=31536000');
      assert.equal(res.headers.get('Vary'), 'Accept-Encoding');
      assert.equal(res.headers.get('Pragma'), undefined);
      break;
    case 'revalidate':
      assert.equal(res.headers.get('Cache-Control'), 'no-cache');
      assert.equal(res.headers.get('Vary'), 'Accept-Encoding');
      assert.equal(res.headers.get('Pragma'), 'no-cache');
      assert.ok(
        res.headers.get('Last-Modified') || res.headers.get('ETag'),
        'Revalidation requires at least one of Last-Modified & ETag headers',
      );
      break;
    case 'single-use':
      assert.equal(res.headers.get('Cache-Control'), 'no-store');
      assert.equal(res.headers.get('Vary'), '*');
      assert.equal(res.headers.get('Pragma'), 'no-cache');
      break;
    case 'passthrough':
      assert.isFalse(res.headers.has('Cache-Control'));
      assert.isFalse(res.headers.has('Vary'));
      assert.isFalse(res.headers.has('Pragma'));
      break;
    default: throw new Error(`Unrecognised cache strategy: ${expectedCacheStrategy}`);
  }
}

function assertSecurityHeaders(res, { csp }) {
  assert.equal(res.headers.get('Referrer-Policy'), 'same-origin');
  assert.equal(res.headers.get('Strict-Transport-Security'), 'max-age=63072000');
  assert.equal(res.headers.get('X-Frame-Options'), 'SAMEORIGIN');
  assert.equal(res.headers.get('X-Content-Type-Options'), 'nosniff');


  const expectedCsp = contentSecurityPolicies[csp];
  if(!expectedCsp) assert.fail(`Tried to match unknown CSP '${csp}'`);
  assertCsp(res.headers.get('Content-Security-Policy'),             expectedCsp.block);
  assertCsp(res.headers.get('Content-Security-Policy-Report-Only'), expectedCsp.reportOnly);
}

function assertCsp(actual, expected) {
  if(!expected) return assert.isNull(actual);

  assert.deepEqualInAnyOrder(
    actual?.split('; '),
    Object.entries(expected)
        .map(([ k, v ]) => `${k} ${asArray(v).join(' ')}`),
  );
}

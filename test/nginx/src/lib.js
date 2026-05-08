const https = require('node:https');

const deepEqualInAnyOrder = require('deep-equal-in-any-order');
const chai = require('chai');
chai.use(deepEqualInAnyOrder);
const { assert } = chai;

module.exports = {
  assert,
  assertSentryReceived,
  requestSentryMock,
  resetSentryMock,
};

async function assertSentryReceived(...expectedRequests) {
  const { status, body } = await requestSentryMock({ path:'/event-log' });
  assert.equal(status, 200);

  const actual = JSON.parse(body);

  try {
    assert.deepEqual(actual, expectedRequests);
  } catch(err) {
    console.log(JSON.stringify({ expected:expectedRequests, actual }, null, 2));
    throw err;
  }
}

async function resetSentryMock() {
  const res = await requestSentryMock({ path:'/reset' });
  assert.equal(res.status, 200);
}

// This function makes DIRECT requests to sentry-mock.  IRL these requests
// would be performed by nginx when a client POSTs to /csp-report.  This
// function is for used in test setup/assertions, except when confirming the
// behaviour of the mock Sentry implementation.
function requestSentryMock(opts) {
  // servername: SNI extension value - https://nodejs.org/api/https.html#new-agentoptions
  const {
    path = '/api/check-cert',
    servername = 'o-fake-dsn.ingest.sentry.io',
  } = opts;

  return new Promise((resolve, reject) => {
    const req = https.request(
      { path, servername },
      res => {
        let body = '';
        res.on('data', data => body += data);
        res.on('end', () => resolve({ status:res.statusCode, body }));
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    req.end();
  });
}

const { execSync } = require('node:child_process');

const express = require('express');

const port = process.env.PORT || 443;
const httpsHost = process.env.HTTPS_HOST;
const log = (...args) => console.log('[mock-sentry]', ...args);

const requests = [];

const app = express();
app.use(express.json());
app.get('/request-log', (req, res) => res.json(requests));
app.get('/reset',       (req, res) => {
  requests.length = 0;
  res.json('OK');
});
app.use('/api', (req, res, next) => {
  log(new Date(), req.method, req.originalUrl);

  if(!req.socket.encrypted) throw new Error('req.socket.encrypted was falsy');

  const certificate = req.socket.getCertificate();
  if(!certificate) {
    log(`
      !!! No certificate found at all.
      !!! This is completely unexpected.  Server will be terminated immediately.
    `);
    process.exit(1);
  }

  if(certificate.subject.CN !== httpsHost) {
    // try to simulate an SNI / connection error
    console.log('Bad HTTPS cert used; destroying connection...');
    return req.socket.destroy();
  }

  next();
});
app.get('/api/check-cert', (req, res) => res.send('OK'));
app.post('/api/example-sentry-project/security/', (req, res) => {
  if(req.query.sentry_key !== 'example-sentry-key') throw new Error('bad sentry key!');

  requests.push(req.body);

  res.send('OK');
});

const server = (() => {
  if(!httpsHost) throw new Error('Env var HTTPS_HOST is required for MODE=https');

  const { readFileSync } = require('node:fs');
  const { createServer } = require('node:https');
  const { createSecureContext } = require('node:tls');

  const encoding = 'utf8';

  const creds = commonName => {
    const keyPath  = `${commonName}-key.pem`;
    const certPath = `${commonName}-cert.pem`;

    execSync(
      [
        'openssl',
        'req -x509',
        '-nodes',
        '-days 365',
        '-newkey rsa:2048',
        `-keyout ${keyPath}`,
        `-out    ${certPath}`,
        `-subj /CN=${commonName}`,
      ].join(' '),
      { encoding },
    );

    return {
      key:  readFileSync(keyPath,  { encoding }),
      cert: readFileSync(certPath, { encoding }),
    };
  };

  const goodCreds = creds(httpsHost);

  const opts = {
    ...creds('localhost'),
    SNICallback: (servername, cb) => {
      if(servername !== httpsHost) return cb(new Error(`Unexpected SNI host: ${servername}`));
      cb(null, createSecureContext(goodCreds));
    },
  };

  return createServer(opts, app);
})();

server.listen(port, () => {
  log(`Listening with HTTPS on port: ${port}`);
});

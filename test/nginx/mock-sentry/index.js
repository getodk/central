const { execSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { createServer } = require('node:https');
const { createSecureContext } = require('node:tls');


const express = require('express');

const port = process.env.PORT || 443;
const httpsHost = process.env.HTTPS_HOST;
const log = (...args) => console.log('[mock-sentry]', ...args);

const events = [];
const logErrorEvent = error => {
  log('ERROR', error);
  events.push({ error });
};

const app = express();
app.use(express.json());
app.get('/event-log', (req, res) => res.json(events));
app.get('/reset',       (req, res) => {
  events.length = 0;
  res.json('OK');
});
app.use('/api', (req, res, next) => {
  log(new Date(), req.method, req.originalUrl);

  if(!req.socket.encrypted) fatalError('req.socket.encrypted was falsy');

  const certificate = req.socket.getCertificate();
  if(!certificate) fatalError('No certificate found at all.');

  const { CN } = certificate.subject;
  if(CN !== httpsHost) {
    logErrorEvent(`Server cert had unexpected CN: '${CN}'`);
    // try to simulate an SNI / connection error
    return req.socket.destroy();
  }

  next();
});
app.get('/api/check-cert', (req, res) => res.send('OK'));
app.post('/api/example-sentry-project/security/', (req, res) => {
  const { sentry_key } = req.query;
  if(sentry_key !== 'example-sentry-key') {
    logErrorEvent(`Bad sentry API key received: '${sentry_key}'`);
    return res.sendStatus(403);
  }

  events.push({ report:req.body });

  res.send('OK');
});

const server = (() => {
  if(!httpsHost) throw new Error('Env var HTTPS_HOST is required for MODE=https');

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
    ...creds('default'),
    // SNICallback is called IFF the client sends an SNI extension in the TLS handshake.
    // See: https://nodejs.org/api/tls.html#tlscreateserveroptions-secureconnectionlistener
    SNICallback: (servername, cb) => {
      if(servername !== httpsHost) {
        const error = `SNICallback: rejecting unexpected servername: ${servername}`;
        logErrorEvent(error);
        return cb(new Error(error));
      }
      cb(null, createSecureContext(goodCreds));
    },
  };

  return createServer(opts, app);
})();

server.listen(port, () => {
  log(`Listening with HTTPS on port: ${port}`);
});

function fatalError(description) {
  log(`
    !!! ${description}
    !!! This is completely unexpected.  Server will be terminated immediately.
  `);
  process.exit(1);
}

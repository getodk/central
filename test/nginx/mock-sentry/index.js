const { execSync } = require('node:child_process');

const express = require('express');

const port = process.env.PORT || 443;
const httpsHost = process.env.HTTPS_HOST;
const log = (...args) => console.log('[mock-sentry]', ...args);

const requests = [];

const app = express();

app.use((req, res, next) => {
  console.log(new Date(), req.method, req.originalUrl);

  if(!req.socket.encrypted) return next(new Error('req.socket.encrypted was falsy'));

  const certificate = req.socket.getCertificate();
  if(certificate) {
    if(certificate.subject.CN !== httpsHost) {
      // try to simulate an SNI / connection error
      console.log('Bad HTTPS cert used; destroying connection...');
      return req.socket.destroy();
    }
  }
  next();
});

app.get('/request-log', (req, res) => res.json(requests));
[
  'delete',
  'get',
  'patch',
  'post',
  'put',
  // TODO add more methods as required
].forEach(method => app[method]('/{*splat}', (req, res) => {
  requests.push({ method:req.method, path:req.originalUrl });
  res.send('OK');
}));

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

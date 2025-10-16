const express = require('express');

const port = process.env.PORT || 80;
const mode = process.env.MODE || 'http';
const httpsHost = process.env.HTTPS_HOST;
const log = (...args) => console.log('[mock-http-server]', ...args);

const requests = [];

const app = express();

app.use((req, res, next) => {
  console.log(new Date(), req.method, req.originalUrl);
  if(req.socket.encrypted) {
    const certificate = req.socket.getCertificate();
    if(certificate) {
      if(certificate.subject.CN !== httpsHost) {
        // try to simulate an SNI / connection error
        console.log('Bad HTTPS cert used; destroying connection...');
        return req.socket.destroy();
      }
    }
  }
  next();
});

// Enketo express returns response with Vary and Cache-Control headers
app.use('/-/', (req, res, next) => {
  res.set('Vary', 'Accept-Encoding');
  res.set('Cache-Control', 'public, max-age=0');
  next();
});

app.get('/health',      (req, res) => res.send('OK'));
app.get('/request-log', (req, res) => res.json(requests));
app.get('/reset',       (req, res) => {
  requests.length = 0;
  res.json('OK');
});

app.get('/v1/reflect-headers', (req, res) => res.json(req.headers));

// Central-Backend can set Cache headers and those should have highest precedence
app.get('/v1/projects', (_, res) => {
  res.set('Vary', 'Cookie');
  res.set('Cache-Control', 'private, max-age=3600');
  res.send('OK');
});

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
  if(mode === 'http') {
    return app;
  } else if(mode === 'https') {
    if(!httpsHost) throw new Error('Env var HTTPS_HOST is required for MODE=https');

    const { readFileSync } = require('node:fs');
    const { createServer } = require('node:https');
    const { createSecureContext } = require('node:tls');

    const pem = name => readFileSync(`${name}.pem`, 'utf8');
    const creds = name => ({ key:pem(`${name}-key`), cert:pem(`${name}-cert`) });

    const goodCreds = creds('good');

    const opts = {
      ...creds('bad'),
      SNICallback: (servername, cb) => {
        if(servername !== httpsHost) return cb(new Error(`Unexpected SNI host: ${servername}`));
        cb(null, createSecureContext(goodCreds));
      },
    };

    return createServer(opts, app);
  } else {
    console.error(`Unrecognised mode: '${mode}'; should be one of http, https.  Cannot start server.`);
    process.exit(1);
  }
})();

server.listen(port, () => {
  log(`Listening with ${mode} on port: ${port}`, server === app);
});

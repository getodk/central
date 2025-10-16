const express = require('express');

const port = process.env.PORT || 80;
const mode = process.env.MODE || 'http';
const log = (...args) => console.log('[mock-http-server]', ...args);

const requests = [];

const app = express();

app.use((req, res, next) => {
  console.log(new Date(), req.method, req.originalUrl);
  if(req.socket.encrypted) {
    // Get the local certificate (the server's certificate)
    const certificate = req.socket.getCertificate();

    if(certificate) {
      console.log('--- Secure Context Details ---');
      console.log('Subject:', certificate.subject.CN); // Common Name
      console.log('Issuer:', certificate.issuer.CN);
      console.log('Valid From:', certificate.valid_from);
      console.log('Valid To:', certificate.valid_to);
      console.log('Serial Number:', certificate.serialNumber);
      // ... and more details
      console.log('------------------------------');

      if(certificate.subject.CN !== 'o-fake-dsn.ingest.sentry.io') {
        // try to simulate an SNI / connection error
        console.log('Destroying connection...');
        return req.socket.destroy();
      }
    } else {
      console.log('Secure connection, but no local certificate found (unexpected for server-side TLS)');
    }
  } else {
    // This part runs if you are running an HTTP server or if a proxy 
    // is terminating SSL before Express (see note below).
    console.log('Insecure HTTP request.');
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
    const { readFileSync } = require('node:fs');
    const { createServer } = require('node:https');
    const { createSecureContext } = require('node:tls');

    const pem = name => readFileSync(`${name}.pem`, 'utf8');
    const creds = name => ({ key:pem(`${name}-key`), cert:pem(`${name}-cert`) });

    const goodCreds = creds('good');

    const opts = {
      ...creds('bad'),
      SNICallback: (servername, cb) => {
        console.log('SNICallback:', servername);
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

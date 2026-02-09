const express = require('express');

const port = process.env.PORT || 80;
const log = (...args) => console.log('[mock-http-server]', ...args);

const requests = [];

const app = express();

app.use((req, res, next) => {
  console.log(new Date(), req.method, req.originalUrl);

  // always set CSP header to detect (or allow) leaks from backend through to the client
  res.set('Content-Security-Policy-Report-Only', 'default-src NOTE:FROM-BACKEND');

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

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});

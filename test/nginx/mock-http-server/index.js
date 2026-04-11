const express = require('express');

const port = process.env.PORT || 80;
const log = (...args) => console.log('[mock-http-server]', ...args);

const requests = [];

const app = express();

app.use((req, res, next) => {
  console.log(new Date(), req.method, req.originalUrl);
  next();
});

app.get('/v1/chunked', (req, res) => {
  // See https://github.com/getodk/central/issues/1736
  // We don't have to set the transfer encoding to chunked explicitly; by default,
  // node will produce a chunked response when we treat the response as a stream.
  res.flushHeaders();
  res.cork();
  res.write('Pack it up, ');
  res.uncork();
  res.write('pack it in, ');
  if (req.query.crash) throw new Error("let's pretend-play a bad thing happened and now we couldn't call .end() and thus we have an unterminated chunked stream on our hands.");
  res.end('let me begin\n');
});

app.use((req, res, next) => {
  // always set CSP header to detect (or allow) leaks from backend through to the client
  res.set('Content-Security-Policy',             'default-src NOTE:FROM-BACKEND:block');
  res.set('Content-Security-Policy-Report-Only', 'default-src NOTE:FROM-BACKEND:reportOnly');

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

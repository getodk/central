const { Readable } = require('node:stream');

const express = require('express');

const port = process.env.PORT || 80;
const log = (...args) => console.log('[mock-http-server]', ...args);

const requests = [];
let openProcessorCount = 0;

const app = express();
app.set('case sensitive routing', true);
app.set('query parser', 'simple');

app.use((req, res, next) => {
  console.log(new Date(), req.method, req.originalUrl);
  next();
});

// Enketo express returns response with Vary and Cache-Control headers
app.use('/-/', (req, res, next) => {
  res.set('Vary', 'Accept-Encoding');
  res.set('Cache-Control', 'public, max-age=0');

  // Set both CSP headers from enketo.  Eventually nginx should be confident to override both.
  res.set('Content-Security-Policy',             `NOTE:FROM-BACKEND:block`);
  res.set('Content-Security-Policy-Report-Only', `NOTE:FROM-BACKEND:reportOnly`);
  next();
});

app.get('/health',      (req, res) => res.send('OK'));
app.get('/request-log', (req, res) => res.json(requests));
app.get('/reset',       (req, res) => {
  requests.length = 0;
  openProcessorCount = 0;
  res.json('OK');
});

app.get('/v1/25MB.csv', (req, res) => {
  // TODO confirm from IRL what headers should be set, e.g.
  // content-type
  // content-length
  // transfer-encoding

  ++openProcessorCount;

  async function* generateCsv(targetByteLength) {
    let rowCount = 0;
    let written = 0;

    const batchSize = Math.pow(2, 16);

    const header = Buffer.from('row_number,timestamp,random-number\n', 'utf8');
    written += header.byteLength;
    yield header;

    while(written < targetByteLength) {
      await new Promise(resolve => setTimeout(resolve, 1));
      const batch = Buffer.allocUnsafe(batchSize);
      let bufpos = 0;
      while(bufpos < batchSize) {
        const line = `${++rowCount},${new Date().toISOString()},${Math.random()}\n`;
        bufpos += batch.write(line, bufpos, 'utf8');
      }
      written += batchSize;
      console.log('written:', written);
      yield batch;
    }
  }

  // TODO up this to 100MiB
  const randomStream = Readable.from(generateCsv(25_000_000));
  randomStream.pipe(res);
  req.on('close', () => {
    console.log('req.closed; destroying randomStream');
    randomStream.destroy();
    --openProcessorCount;
  });
});
app.get('/open-processor-count', (req, res) => {
  console.log(`
    /open-processor-count called; count: ${openProcessorCount}
  `);
  res.send(openProcessorCount);
});

app.get('/v1/reflect-headers', (req, res) => res.json(req.headers));

// Central-Backend can set Cache headers and those should have highest precedence
app.get('/v1/projects', (_, res) => {
  res.set('Vary', 'Cookie');
  res.set('Cache-Control', 'private, max-age=3600');
  res.send('OK');
});

app.get('/v1/oidc/callback', (req, res) => {
  // This endpoint is 100% responsible for its own headers.  Set both, and test they both get through.
  res.set('Content-Security-Policy',             `NOTE:FROM-BACKEND:block`);
  res.set('Content-Security-Policy-Report-Only', `NOTE:FROM-BACKEND:reportOnly`);

  res.send('OK');
});

app.get('/v1/broken-stream', (req, res) => {
  res.status(200);
  res.write('beginning stream...', () => {
    // Write has now flushed from NodeJS.  Give it a chance to flush
    // from lower-level network buffer.
    setTimeout(() => {
       res.socket.destroy();
    }, 50);
  });
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

app.listen(port, '0.0.0.0', () => {
  log(`Listening on port: ${port}`);
});

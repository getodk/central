const express = require('express');

const port = process.env.PORT || 80;
const log = (...args) => console.log('[mock-http-server]', ...args);

const requests = [];

const app = express();

app.get('/health',      withStdLogging((req, res) => res.send('OK')));
app.get('/request-log', withStdLogging((req, res) => res.json(requests)));
app.get('/reset',       withStdLogging((req, res) => {
  requests.length = 0;
  res.json('OK');
}));

app.get('/v1/reflect-headers', withStdLogging((req, res) => res.json(req.headers)));

app.get('/{*splat}', ok('GET'));
app.post('/{*splat}', ok('POST'));
// TODO add more methods as required

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});

function withStdLogging(fn) {
  return (req, res) => {
    console.log(new Date(), req.method, req.path);
    return fn(req, res);
  };
}

function ok(method) {
  return withStdLogging((req, res) => {
    requests.push({ method, path:req.path });
    res.send('OK');
  });
}

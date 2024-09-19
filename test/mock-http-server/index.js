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

app.get('/blob-server/*', withStdLogging((req, res) => {
  res.send(`blob:${req.path.replace('/blob-server/', '')}`);
}));

app.get('/*blob/*', withStdLogging((req, res) => {
  // NOTE this may require tweaking when reality of using real nginx server is understood.
  res.redirect(307, 'http://mock_s3:33333/blob-server/' + req.path.replace(/.*blob\//, ''));
}));

app.get('/*', ok('GET'));
app.post('/*', ok('POST'));
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

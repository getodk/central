const { isIPv6 } = require('node:net');
const { Readable } = require('node:stream');

module.exports = request;

// Similar to fetch() but:
//
// 1. do not follow redirects
// 2. allow overriding of fetch's "forbidden" headers: https://developer.mozilla.org/en-US/docs/Glossary/Forbidden_header_name
function request(urlString, { body, ...options }={}) {
  if(!options.headers) options.headers = {};
  if(!options.headers.host) options.headers.host = 'odk-nginx.example.test';

  const url = new URL(urlString);
  if(url.username || url.password) throw new Error('Basic auth creds not yet supported.');

  options.host = safeIpv6(url.hostname);
  options.port = url.port;
  options.path = urlString.replace(/^http(s?):\/\/[^/]*/, '') || '/';

  return new Promise((resolve, reject) => {
    try {
      const req = getProtocolImplFrom(url).request(options, res => {
        res.on('error', reject);

        const body = new Readable({ read:() => {} });
        res.on('error', err => body.destroy(err));
        res.on('data', data => body.push(data));
        res.on('end', () => body.push(null));

        const text = () => new Promise((resolve, reject) => {
          const chunks = [];
          body.on('error', reject);
          body.on('data', data => chunks.push(data));
          body.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        });

        const status = res.statusCode;

        resolve({
          status,
          ok: status >= 200 && status < 300,
          statusText: res.statusText,
          body,
          text,
          json: async () => JSON.parse(await text()),
          headers: new Headers(res.headers),
        });
      });
      req.on('error', reject);
      if(body !== undefined) req.write(body);
      req.end();
    } catch(err) {
      reject(err);
    }
  });
}

function getProtocolImplFrom({ protocol }) {
  switch(protocol) {
    case 'http:':  return require('node:http');
    case 'https:': return require('node:https');
    default: throw new Error(`Unsupported protocol: ${protocol}`);
  }
}

function safeIpv6(hostname) {
  const maybeV6 = hostname.replace(/^\[(.*)\]$/, (_, $1) => $1);
  return isIPv6(maybeV6) ? maybeV6 : hostname;
}

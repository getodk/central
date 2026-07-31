const { isIPv6 } = require('node:net');

module.exports = request;

// Similar to fetch() but:
//
// 1. do not follow redirects
// 2. allow overriding of fetch's "forbidden" headers: https://developer.mozilla.org/en-US/docs/Glossary/Forbidden_header_name
function request(url, { body, ...options }={}) {
  if(!options.headers) options.headers = {};
  if(!options.headers.host) options.headers.host = 'odk-nginx.example.test';

  return new Promise((resolve, reject) => {
    try {
      const req = getProtocolImplFrom(url).request({ ...options, ...preserve(url) }, res => {
        res.on('error', reject);

        resolve(new Response(res, {
          status: res.statusCode,
          statusText: res.statusMessage,
          headers: new Headers(res.headers),
        }));
      });
      req.on('error', reject);
      if(body !== undefined) req.write(body);
      req.end();
    } catch(err) {
      reject(err);
    }
  });
}

function getProtocolImplFrom(url) {
  const { protocol } = new URL(url);
  switch(protocol) {
    case 'http:':  return require('node:http');
    case 'https:': return require('node:https');
    default: throw new Error(`Unsupported protocol: ${protocol}`);
  }
}

/**
 * Prevent URL path normalisation.
 * @see https://nodejs.org/api/http.html#httprequesturl-options-callback
 * @see https://nodejs.org/api/url.html#new-urlinput-base
 */
function preserve(urlString) {
  const url = new URL(urlString);
  if(url.username || url.password) throw new Error('Basic auth creds not yet supported.');

  const host = safeIpv6(url.hostname);
  const port = url.port;
  const path = urlString.replace(/^http(s?):\/\/[^/]*/, '') || '/';

  return { host, port, path };
}

function safeIpv6(hostname) {
  const maybeV6 = hostname.replace(/^\[(.*)\]$/, (_, $1) => $1);
  return isIPv6(maybeV6) ? maybeV6 : hostname;
}

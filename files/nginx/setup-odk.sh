#!/bin/bash -eu
set -o pipefail
shopt -s inherit_errexit

echo "writing client config..."
if [[ $OIDC_ENABLED != 'true' ]] && [[ $OIDC_ENABLED != 'false' ]]; then
  echo 'OIDC_ENABLED must be either true or false'
  exit 1
fi

/scripts/envsub.awk \
  < /usr/share/odk/nginx/client-config.json.template \
  > /usr/share/nginx/html/client-config.json

# Generate self-signed keys for the incorrect (catch-all) HTTPS listener.  This
# cert should never be seen by legitimate users, so it's not a big deal that
# it's self-signed and won't expire for 1,000 years.
mkdir -p /etc/nginx/ssl
openssl req -x509 -nodes -newkey rsa:2048 \
    -subj "/CN=invalid.local" \
    -keyout /etc/nginx/ssl/nginx.default.key \
    -out    /etc/nginx/ssl/nginx.default.crt \
    -days 365000

DH_PATH=/etc/dh/nginx.pem
if [ "$SSL_TYPE" != "upstream" ] && [ ! -s "$DH_PATH" ]; then
  openssl dhparam -out "$DH_PATH" 2048
fi

SELFSIGN_PATH="/etc/selfsign/live/$DOMAIN"
if [ "$SSL_TYPE" = "selfsign" ] && [ ! -s "$SELFSIGN_PATH/privkey.pem" ]; then
  mkdir -p "$SELFSIGN_PATH"
  openssl req -x509 -newkey rsa:4086 \
    -subj "/C=XX/ST=XXXX/L=XXXX/O=XXXX/CN=localhost" \
    -keyout "$SELFSIGN_PATH/privkey.pem" \
    -out "$SELFSIGN_PATH/fullchain.pem" \
    -days 3650 -nodes -sha256
fi

# start from fresh templates in case ssl type has changed
echo "writing fresh nginx templates..."
# redirector.conf gets deleted if using upstream SSL so copy it back
/scripts/envsub.awk \
  < /usr/share/odk/nginx/redirector.conf \
  > /etc/nginx/conf.d/redirector.conf

CERT_DOMAIN=$( [ "$SSL_TYPE" = "customssl" ] && echo "local" || echo "$DOMAIN") \
/scripts/envsub.awk \
  < /usr/share/odk/nginx/odk.conf.template \
  > /etc/nginx/conf.d/odk.conf

if [ "$SSL_TYPE" = "letsencrypt" ]; then
  echo "starting nginx for letsencrypt..."
  /bin/bash /scripts/start_nginx_certbot.sh
else
  if [ "$SSL_TYPE" = "upstream" ]; then
    # no need for letsencrypt challenge reply or 80 to 443 redirection
    rm -f /etc/nginx/conf.d/redirector.conf
    # strip out all ssl_* directives
    perl -i -ne 's/listen 443.*/listen 80;/; print if ! /ssl_/' /etc/nginx/conf.d/odk.conf
    # force https because we expect SSL upstream
    perl -i -pe 's/X-Forwarded-Proto \$scheme/X-Forwarded-Proto https/;' /etc/nginx/conf.d/odk.conf
    echo "starting nginx for upstream ssl..."
  else
    # remove letsencrypt challenge reply, but keep 80 to 443 redirection
    perl -i -ne 'print if $. < 7 || $. > 14' /etc/nginx/conf.d/redirector.conf
    echo "starting nginx for custom ssl and self-signed certs..."
  fi
  exec nginx -g "daemon off;"
fi

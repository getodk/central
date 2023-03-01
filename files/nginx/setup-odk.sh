#!/bin/bash

DH_PATH=/etc/odk/nginx/ssl_dhparam.pem
if [ "$SSL_TYPE" != "upstream" ] && [ ! -s "$DH_PATH" ]; then
  echo "diffie hellman key does not exist; creating (this could take a while)..."
  openssl dhparam -out "$DH_PATH" 2048
fi

SELFSIGN_PATH=/etc/odk/nginx/selfsign
if [ "$SSL_TYPE" = "selfsign" ] && [ ! -s "$SELFSIGN_PATH/privkey.pem" ]; then
  echo "self-signed cert does not exist; creating (this could take a while)..."
  openssl req -x509 -newkey rsa:4086 \
    -subj "/C=XX/ST=XXXX/L=XXXX/O=XXXX/CN=localhost" \
    -keyout "$SELFSIGN_PATH/privkey.pem" \
    -out "$SELFSIGN_PATH/fullchain.pem" \
    -days 3650 -nodes -sha256
fi

# start from fresh templates in case ssl type has changed
echo "writing fresh nginx templates..."
cp /etc/odk/nginx/conf/redirector.conf /etc/nginx/conf.d/redirector.conf
CNAME=$({ [ "$SSL_TYPE" = "customssl" ] || [ "$SSL_TYPE" = "selfsign" ]; } && echo "local" || echo "$DOMAIN") \
envsubst '$CNAME' \
    < /etc/odk/nginx/conf/odk.conf.template \
    > /etc/nginx/conf.d/odk.conf

if [ "$SSL_TYPE" = "letsencrypt" ]; then
  echo "starting nginx with certbot..."
  /bin/bash /scripts/start_nginx_certbot.sh
elif [ "$SSL_TYPE" = "customssl" ] || [ "$SSL_TYPE" = "selfsign" ]; then
  echo "starting nginx without certbot..."
  # strip out HTTP-01 ACME challenge location
  perl -i -ne 'print if $. < 7 || $. > 14' /etc/nginx/conf.d/redirector.conf
  # replace letsencrypt cert locations with customssl or selfsign locations
  perl -i -pe "s|/etc/letsencrypt/live/local|/etc/odk/nginx/$SSL_TYPE|;" /etc/nginx/conf.d/odk.conf
  nginx -g "daemon off;"
elif [ "$SSL_TYPE" = "upstream" ]; then
  echo "starting nginx without local SSL to allow for upstream SSL..."
  # strip out all ssl_* directives
  perl -i -ne 's/listen 443.*/listen 80;/; print if ! /ssl_/' /etc/nginx/conf.d/odk.conf
  # force https because we expect SSL upstream
  perl -i -pe 's/X-Forwarded-Proto \$scheme/X-Forwarded-Proto https/;' /etc/nginx/conf.d/odk.conf
  nginx -g "daemon off;"
fi

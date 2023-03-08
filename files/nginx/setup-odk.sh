#!/bin/bash

NGINX_PATH=/etc/odk/nginx

DH_PATH="$NGINX_PATH/ssl_dhparam.pem"
if [ "$SSL_TYPE" != "upstream" ] && [ ! -s "$DH_PATH" ]; then
  openssl dhparam -out "$DH_PATH" 2048
fi

SELFSIGN_PATH="$NGINX_PATH/selfsign"
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
cp /usr/share/odk/nginx/conf/redirector.conf /etc/nginx/conf.d/redirector.conf
CNAME=$({ [ "$SSL_TYPE" = "customssl" ] || [ "$SSL_TYPE" = "selfsign" ]; } && echo "local" || echo "$DOMAIN") \
envsubst '$CNAME' \
  < /usr/share/odk/nginx/conf/odk.conf.template \
  > /etc/nginx/conf.d/odk.conf

if [ "$SSL_TYPE" = "letsencrypt" ]; then
  echo "starting nginx with certbot..."
  /bin/bash /scripts/start_nginx_certbot.sh
elif [ "$SSL_TYPE" = "customssl" ] || [ "$SSL_TYPE" = "selfsign" ]; then
  CERT_PATH=$( [ "$SSL_TYPE" = "customssl" ] && echo "/usr/share/odk/nginx/customssl" || echo "$SELFSIGN_PATH") 
  # replace letsencrypt cert locations with customssl/selfsign location
  perl -i -pe "s|/etc/letsencrypt/live/local|$CERT_PATH|;" /etc/nginx/conf.d/odk.conf
  # strip out HTTP-01 ACME challenge location
  perl -i -ne 'print if $. < 7 || $. > 14' /etc/nginx/conf.d/redirector.conf
  echo "starting nginx without certbot..."
  nginx -g "daemon off;"
elif [ "$SSL_TYPE" = "upstream" ]; then
  # strip out all ssl_* directives
  perl -i -ne 's/listen 443.*/listen 80;/; print if ! /ssl_/' /etc/nginx/conf.d/odk.conf
  # force https because we expect SSL upstream
  perl -i -pe 's/X-Forwarded-Proto \$scheme/X-Forwarded-Proto https/;' /etc/nginx/conf.d/odk.conf
  echo "starting nginx without local SSL to allow for upstream SSL..."
  nginx -g "daemon off;"
fi

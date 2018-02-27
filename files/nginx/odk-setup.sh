DHPATH=/etc/dh/nginx.pem
if [ ! -e "$DHPATH" ]
then
  echo "diffie hellman private key does not exist; creating.."
  openssl dhparam -out "$DHPATH" 2048
fi

SELFSIGN_BASEPATH=/etc/selfsign/live/local
if [ "$SSL_TYPE" = "selfsign" ] && [ ! -e "$SELFSIGN_BASEPATH/privkey.pem" ]
then
  echo "self-signed cert requested but does not exist; creating.. (this could take a while)"
  openssl req -x509 -newkey rsa:4086 \
    -subj "/C=XX/ST=XXXX/L=XXXX/O=XXXX/CN=localhost" \
    -keyout "$SELFSIGN_BASEPATH/privkey.pem" \
    -out "$SELFSIGN_BASEPATH/cert.pem" \
    -days 3650 -nodes -sha256
fi

if [ ! -e "/etc/nginx/conf.d/odk.conf" ]
then
  echo "nginx configuration does not exist; creating.."
  /bin/bash -c "envsubst '\$SSL_TYPE \$DOMAIN' < /usr/share/nginx/odk.conf.template > /etc/nginx/conf.d/odk.conf"
fi

/bin/bash /scripts/entrypoint.sh


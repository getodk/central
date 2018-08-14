DHPATH=/etc/dh/nginx.pem
if [ ! -e "$DHPATH" ]
then
  echo "diffie hellman private key does not exist; creating.."
  openssl dhparam -out "$DHPATH" 2048
fi

SELFSIGN_BASEPATH=/etc/selfsign/live/$DOMAIN
if [ "$SSL_TYPE" = "selfsign" ] && [ ! -e "$SELFSIGN_BASEPATH/privkey.pem" ]
then
  echo "self-signed cert requested but does not exist; creating.. (this could take a while)"
  mkdir -p $SELFSIGN_BASEPATH
  openssl req -x509 -newkey rsa:4086 \
    -subj "/C=XX/ST=XXXX/L=XXXX/O=XXXX/CN=localhost" \
    -keyout "$SELFSIGN_BASEPATH/privkey.pem" \
    -out "$SELFSIGN_BASEPATH/fullchain.pem" \
    -days 3650 -nodes -sha256
fi

echo "writing a new nginx configuration file.."
/bin/bash -c "envsubst '\$SSL_TYPE \$DOMAIN' < /usr/share/nginx/odk.conf.template > /etc/nginx/conf.d/odk.conf"

/bin/bash /scripts/entrypoint.sh


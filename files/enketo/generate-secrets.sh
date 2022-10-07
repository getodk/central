#!/bin/sh

if [ ! -f /etc/secrets/enketo-secret ]; then
  LC_ALL=C tr -dc '[:alnum:]' < /dev/urandom | head -c64 > /etc/secrets/enketo-secret
fi

if [ ! -f /etc/secrets/enketo-less-secret ]; then
  LC_ALL=C tr -dc '[:alnum:]' < /dev/urandom | head -c32 > /etc/secrets/enketo-less-secret
fi

if [ ! -f /etc/secrets/enketo-api-key ]; then
  LC_ALL=C tr -dc '[:alnum:]' < /dev/urandom | head -c128 > /etc/secrets/enketo-api-key
fi


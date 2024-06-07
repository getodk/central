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

if [ "$ENV" = "DEV" ]; then
    printf 's0m3v3rys3cr3tk3y' > /etc/secrets/enketo-secret
    printf 'this $3cr3t key is crackable' > /etc/secrets/enketo-less-secret
    printf 'enketorules' > /etc/secrets/enketo-api-key
fi
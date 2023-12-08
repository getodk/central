#!/bin/sh

CONFIG_PATH=${ENKETO_SRC_DIR}/config/config.json
echo "generating enketo configuration..."

BASE_URL=$( [ "${HTTPS_PORT}" = 443 ] && echo https://"${DOMAIN}" || echo https://"${DOMAIN}":"${HTTPS_PORT}" ) \
SECRET=$(cat /etc/secrets/enketo-secret) \
LESS_SECRET=$(cat /etc/secrets/enketo-less-secret) \
API_KEY=$(cat /etc/secrets/enketo-api-key) \
envsubst '$DOMAIN $BASE_URL $SECRET $LESS_SECRET $API_KEY $SUPPORT_EMAIL' \
    < "$CONFIG_PATH.template" \
    > "$CONFIG_PATH"

echo "starting enketo..."
exec yarn workspace enketo-express start

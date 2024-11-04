#!/bin/sh

CONFIG_PATH=${ENKETO_SRC_DIR}/config/config.json
echo "generating enketo configuration..."

if [ "$ENV" = "DEV" ]; then
    sed -i -e 's/enketo_redis_main/localhost/g' \
       -e 's/enketo_redis_cache/localhost/g' \
       -e 's/6380/6379/g' \
       -e 's/${SECRET}/s0m3v3rys3cr3tk3y/g' \
       -e 's/${LESS_SECRET}/this $3cr3t key is crackable/g' \
       -e 's/${API_KEY}/enketorules/g' "$CONFIG_PATH.template"
fi

BASE_URL=$( [ "${HTTPS_PORT}" = 443 ] && echo https://"${DOMAIN}" || echo https://"${DOMAIN}":"${HTTPS_PORT}" ) \
SECRET=$(cat /etc/secrets/enketo-secret) \
LESS_SECRET=$(cat /etc/secrets/enketo-less-secret) \
API_KEY=$(cat /etc/secrets/enketo-api-key) \
envsubst '$DOMAIN $BASE_URL $SECRET $LESS_SECRET $API_KEY $SUPPORT_EMAIL' \
    < "$CONFIG_PATH.template" \
    > "$CONFIG_PATH"

echo "starting enketo..."
exec yarn workspace enketo-express start

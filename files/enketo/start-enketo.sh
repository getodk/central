CONFIG_PATH=${ENKETO_SRC_DIR}/config/config.json
echo "generating enketo configuration.."
/bin/bash -c "SECRET=$(cat /etc/secrets/enketo-secret) LESS_SECRET=$(cat /etc/secrets/enketo-less-secret) API_KEY=$(cat /etc/secrets/enketo-api-key) envsubst '\$DOMAIN:\$SECRET:\$LESS_SECRET:\$API_KEY' < ${CONFIG_PATH}.template > $CONFIG_PATH"

echo "starting pm2/enketo.."
pm2 start --no-daemon app.js -n enketo


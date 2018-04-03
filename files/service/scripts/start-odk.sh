CONFIG_PATH=/usr/odk/config/local.json
if [ ! -e "$CONFIG_PATH" ]
then
  echo "generating local service configuration.."
  /bin/bash -c "envsubst '\$DOMAIN' < /usr/share/odk/config.json.template > $CONFIG_PATH"
fi

echo "running migrations.."
node -e 'const { withDatabase, migrate } = require("./lib/model/database"); withDatabase(require("config").get("default.database"))(migrate);'

echo "starting cron.."
cron -f &

echo "starting server."
node lib/bin/run-server.js


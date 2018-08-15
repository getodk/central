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
mkdir -p /var/log/odk
node node_modules/naught/lib/main.js start --remove-old-ipc true --worker-count 4 --daemon-mode false --log /var/log/odk/naught.log --stdout /var/log/odk/stdout.log --stderr /var/log/odk/stderr.log lib/bin/run-server.js


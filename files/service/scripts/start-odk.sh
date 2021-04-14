CONFIG_PATH=/usr/odk/config/local.json
echo "generating local service configuration.."
/bin/bash -c "ENKETO_API_KEY=$(cat /etc/secrets/enketo-api-key) envsubst '\$DOMAIN:\$SYSADMIN_EMAIL:\$ENKETO_API_KEY' < /usr/share/odk/config.json.template > $CONFIG_PATH"

echo "running migrations.."
node -e 'const { withDatabase, migrate } = require("./lib/model/migrate"); withDatabase(require("config").get("default.database"))(migrate);'

echo "starting cron.."
cron -f &

MEMTOT=$(vmstat -s | grep 'total memory' | awk '{ print $1 }')
if [ "$MEMTOT" -gt "1100000" ]
then
  WORKER_COUNT=4
else
  WORKER_COUNT=1
fi
echo "using $WORKER_COUNT worker(s) based on available memory ($MEMTOT).."

echo "starting server."
mkdir -p /var/log/odk
node node_modules/naught/lib/main.js start --remove-old-ipc true --worker-count $WORKER_COUNT --daemon-mode false --log /var/log/odk/naught.log --stdout /proc/1/fd/1 --stderr /proc/1/fd/2 lib/bin/run-server.js


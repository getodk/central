node -e 'const { withDatabase, migrate } = require("./lib/model/database"); withDatabase(migrate);'
node lib/server.js

module.exports = {
  apps:  [{
    name: 'service',
    script: './lib/bin/run-server.js',

    // the default is 1600ms; we aren't that impatient:
    kill_timeout: 30000,

    // per Unitech/pm2#2045 this resolves a conflict w node-config:
    instance_var: 'INSTANCE_ID'
  }]
};


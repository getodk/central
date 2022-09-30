module.exports = {
  apps:  [{
    name: 'service',
    script: './lib/bin/run-server.js',

    // the default is 1600ms; we aren't that impatient:
    kill_timeout: 30000,

    // log to stdout/stderr:
    out_file: '/proc/1/fd/1',
    error_file: '/proc/1/fd/2',

    // per Unitech/pm2#2045 this resolves a conflict w node-config:
    instance_var: 'INSTANCE_ID',

    // --instances option from cli is not working in pm2 v5.2. Ref: Unitech/pm2/issues/5450
    instances: process.env.WORKER_COUNT
  }]
};


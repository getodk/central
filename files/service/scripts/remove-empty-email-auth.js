#!/usr/bin/env node

// Some mail servers (e.g. internal relays) do not accept SMTP authentication
// at all. If EMAIL_USER and EMAIL_PASSWORD are both left empty, remove the
// `auth` object from the generated config so that Nodemailer does not attempt
// to log in.
//
// See https://github.com/getodk/central/issues/2295

const fs = require('node:fs');

const configPath = process.argv[2];
if (!configPath) {
  console.error('Usage: remove-empty-email-auth.js <path/to/local.json>');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const transportOpts = config?.default?.email?.transportOpts;
const auth = transportOpts?.auth;

if (auth && !auth.user && !auth.pass) {
  delete transportOpts.auth;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
  console.log('EMAIL_USER and EMAIL_PASSWORD are empty; mail will be sent without SMTP authentication.');
}

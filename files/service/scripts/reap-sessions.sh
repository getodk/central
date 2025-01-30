#!/bin/sh -eu

cd /usr/odk
/usr/local/bin/node lib/bin/reap-sessions.js >/proc/1/fd/1 2>/proc/1/fd/2


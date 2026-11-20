#!/usr/bin/env perl

# Build NUL-separated env file for use by cron jobs, filtering out
# unnecessary env vars.

use warnings;
use strict;

delete $ENV{$_}
  for grep { !/^(PG|SENTRY_)/ }
  keys %ENV;

exec('env', '--null')
  or die;

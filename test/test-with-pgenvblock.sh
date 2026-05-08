#!/bin/bash -eu
set -o pipefail
shopt -s inherit_errexit

printf >&2 "Checking whether with-pgenvblock.pl works… "
# for the skeptical reader, on the below:
# note that the environment setting (with `export`) runs in a subshell, and as such doesn't touch our own environment,
# and as such thus also not the environment with-pgenvblock.pl's is launched with; and thus the PGBLA environment variable
# that the `env` invocation sees comes from `with-pgenvblock.pl`'s reading of the env block file and nowhere else.
files/service/with-pgenvblock.pl <(export PGBLA=hurray; cat /proc/self/environ) env | grep --quiet '^PGBLA=hurray$' || (printf >&2 "No, it doesn't\n"; false) && printf >&2 "Yes\n"

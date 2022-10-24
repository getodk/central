# see: https://github.com/tianon/docker-postgres-upgrade/blob/master/9.6-to-14/Dockerfile
FROM tianon/postgres-upgrade:9.6-to-14

# This file is required to encourage human validation of the process.
# It's expected it will be provided by the sysadmin performing the upgrade.
# Docker build will fail if this file is missing.
# TODO this file may stick around for a while; maybe we should call this simply `use-postgres14`?
COPY allow-postgres14-upgrade .

COPY files/postgres/upgrade-postgres.sh /usr/local/bin/

# we can't rename/remap this directory, as it's an anonymous volume
ENV PGDATAOLD=/var/lib/postgresql/data

# N.B. postgres is not started automatically in this image as we are overriding CMD.
ENTRYPOINT []
CMD upgrade-postgres.sh

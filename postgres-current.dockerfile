FROM pgautoupgrade/pgautoupgrade:18.7-trixie

COPY files/postgres14/start-postgres.sh /usr/local/bin/

# Avoid anonymous volume from ancestor images.
# See: https://github.com/pgautoupgrade/docker-pgautoupgrade/blob/6416af2181deefa678dadfb354d5078c70a15a65/Dockerfile.trixie#L161
# See: https://github.com/docker-library/postgres/blob/431640c75318610961eabb6417cd3ea8140c643f/17/trixie/Dockerfile#L195
# See: https://github.com/docker-library/postgres/blob/431640c75318610961eabb6417cd3ea8140c643f/18/trixie/Dockerfile#L200
ENV PGDATA=/var/lib/odk/postgresql/data

ENTRYPOINT []
CMD ["/usr/local/bin/start-postgres.sh"]

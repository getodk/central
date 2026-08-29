FROM pgautoupgrade/pgautoupgrade:18.4-trixie

COPY files/postgres14/start-postgres.sh /usr/local/bin/

# FIXME does this need to be declared?
ENV PGDATA=/var/lib/postgresql/data

ENTRYPOINT []
CMD ["start-postgres.sh"]

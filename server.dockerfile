ARG IMAGE

FROM "${IMAGE}" AS pgdg
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        gpg \
    && rm -rf /var/lib/apt/lists/* \
    && update-ca-certificates
RUN echo "deb http://apt.postgresql.org/pub/repos/apt/ $(grep -oP 'VERSION_CODENAME=\K\w+' /etc/os-release)-pgdg main" \
      | tee /etc/apt/sources.list.d/pgdg.list \
    && curl https://www.postgresql.org/media/keys/ACCC4CF8.asc \
      | gpg --dearmor > /etc/apt/trusted.gpg.d/apt.postgresql.org.gpg

FROM "${IMAGE}"

LABEL org.opencontainers.image.source="https://github.com/getodk/central"

WORKDIR /usr/odk

COPY --from=pgdg /etc/apt/sources.list.d/pgdg.list \
    /etc/apt/sources.list.d/pgdg.list
COPY --from=pgdg /etc/apt/trusted.gpg.d/apt.postgresql.org.gpg \
    /etc/apt/trusted.gpg.d/apt.postgresql.org.gpg
COPY server/package*.json ./
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        gpg \
        cron \
        procps \
        postgresql-client \
        netcat-traditional \
    && rm -rf /var/lib/apt/lists/* \
    && npm clean-install --omit=dev --no-audit \
        --fund=false --update-notifier=false

COPY server/ ./
COPY files/shared/envsub.awk /scripts/
COPY files/service/scripts/ ./

COPY files/service/config.json.template /usr/share/odk/
COPY files/service/crontab /etc/cron.d/odk
COPY files/service/odk-cmd /usr/bin/
COPY files/service/with-pgenvblock.pl /usr/bin/
COPY files/service/stub.txt ./sentry-versions/central
COPY files/service/stub.txt ./sentry-versions/client
COPY files/service/stub.txt ./sentry-versions/server
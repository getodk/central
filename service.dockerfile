ARG node_version=20.12.2



FROM node:${node_version}-slim as pgdg
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



FROM node:${node_version}-slim as intermediate
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        git \
    && rm -rf /var/lib/apt/lists/*
COPY . .
RUN mkdir /tmp/sentry-versions
RUN git describe --tags --dirty > /tmp/sentry-versions/central
WORKDIR /server
RUN git describe --tags --dirty > /tmp/sentry-versions/server
WORKDIR /client
RUN git describe --tags --dirty > /tmp/sentry-versions/client



FROM node:${node_version}-slim

ARG node_version
LABEL org.opencontainers.image.source="https://github.com/getodk/central"

WORKDIR /usr/odk

COPY server/package*.json ./
COPY --from=pgdg /etc/apt/sources.list.d/pgdg.list \
    /etc/apt/sources.list.d/pgdg.list
COPY --from=pgdg /etc/apt/trusted.gpg.d/apt.postgresql.org.gpg \
    /etc/apt/trusted.gpg.d/apt.postgresql.org.gpg
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        gpg \
        cron \
        wait-for-it \
        gettext \
        procps \
        postgresql-client-14 \
        netcat-traditional \
    && rm -rf /var/lib/apt/lists/* \
    && npm clean-install --omit=dev --legacy-peer-deps --no-audit \
        --fund=false --update-notifier=false

COPY server/ ./
COPY files/service/scripts/ ./

COPY files/service/config.json.template /usr/share/odk/
COPY files/service/crontab /etc/cron.d/odk
COPY files/service/odk-cmd /usr/bin/

COPY --from=intermediate /tmp/sentry-versions/ ./sentry-versions

EXPOSE 8383

ARG node_version=18.17
FROM node:${node_version} as intermediate

COPY . .
RUN mkdir /tmp/sentry-versions
RUN git describe --tags --dirty > /tmp/sentry-versions/central
WORKDIR server
RUN git describe --tags --dirty > /tmp/sentry-versions/server
WORKDIR ../client
RUN git describe --tags --dirty > /tmp/sentry-versions/client

FROM node:${node_version}

WORKDIR /usr/odk

RUN apt-get update && apt-get install wait-for-it && rm -rf /var/lib/apt/lists/*

RUN echo "deb http://apt.postgresql.org/pub/repos/apt/ $(grep -oP 'VERSION_CODENAME=\K\w+' /etc/os-release)-pgdg main" | tee /etc/apt/sources.list.d/pgdg.list && \
  curl https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor > /etc/apt/trusted.gpg.d/apt.postgresql.org.gpg && \
  apt-get update && \
  apt-get install -y cron gettext postgresql-client-14

COPY files/service/crontab /etc/cron.d/odk

COPY server/package*.json ./

RUN npm clean-install --omit=dev --legacy-peer-deps --no-audit --fund=false --update-notifier=false

COPY server/ ./
COPY files/service/scripts/ ./

COPY files/service/config.json.template /usr/share/odk/
COPY files/service/odk-cmd /usr/bin/

COPY --from=intermediate /tmp/sentry-versions/ ./sentry-versions

EXPOSE 8383


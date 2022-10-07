FROM node:16.17.0 as intermediate

COPY . .
RUN mkdir /tmp/sentry-versions
RUN git describe --tags --dirty > /tmp/sentry-versions/central
WORKDIR server
RUN git describe --tags --dirty > /tmp/sentry-versions/server
WORKDIR ../client
RUN git describe --tags --dirty > /tmp/sentry-versions/client

FROM node:16.17.0

WORKDIR /usr/odk

RUN echo "deb http://apt.postgresql.org/pub/repos/apt/ stretch-pgdg main" | tee /etc/apt/sources.list.d/pgdg.list; \
  wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | apt-key add -; \
  apt-get update; \
  apt-get install -y cron gettext postgresql-client-9.6

COPY files/service/crontab /etc/cron.d/odk

COPY server/package*.json ./
RUN npm clean-install --production --legacy-peer-deps
RUN npm install pm2 -g

COPY server/ ./
COPY files/service/scripts/ ./
COPY files/service/pm2.config.js ./

COPY files/service/config.json.template /usr/share/odk/
COPY files/service/odk-cmd /usr/bin/

COPY --from=intermediate /tmp/sentry-versions/ ./

EXPOSE 8383


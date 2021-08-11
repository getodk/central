FROM node:14.17.4

WORKDIR /usr/odk

RUN echo "deb http://apt.postgresql.org/pub/repos/apt/ stretch-pgdg main" | tee /etc/apt/sources.list.d/pgdg.list; \
  wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | apt-key add -; \
  apt-get update; \
  apt-get install -y cron gettext postgresql-client-9.6

COPY files/service/crontab /etc/cron.d/odk

COPY server/package*.json ./
RUN npm install --production
RUN npm install pm2 -g

COPY server/ ./
COPY files/service/scripts/ ./
COPY files/service/pm2.config.js ./

COPY files/service/config.json.template /usr/share/odk/
COPY files/service/odk-cmd /usr/bin/

EXPOSE 8383


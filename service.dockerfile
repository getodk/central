FROM node:carbon

WORKDIR /usr/odk

RUN echo "deb http://apt.postgresql.org/pub/repos/apt/ jessie-pgdg main" > /etc/apt/sources.list.d/pgdg.list; \
  wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | \
  apt-key add -; \
  apt-get update; apt-get install -y gettext postgresql-client-9.6

COPY server/package*.json ./
RUN npm install

COPY server/ ./
COPY files/service/scripts/ ./

COPY files/service/config.json.template /usr/share/odk/
COPY files/service/odk-cmd /usr/bin/

EXPOSE 8383


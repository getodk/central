FROM node:carbon

WORKDIR /usr/odk

RUN apt-get update; apt-get install -y gettext

COPY server/package*.json ./
RUN npm install

COPY server/ ./
COPY files/service/scripts/ ./

COPY files/service/config.json.template /usr/share/odk/
COPY files/service/odk-cmd /usr/bin/

EXPOSE 8383


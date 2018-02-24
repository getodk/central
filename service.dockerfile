FROM node:carbon

WORKDIR /usr/odk

COPY server/package*.json ./
RUN npm install

COPY server/ ./
COPY files/service/scripts/ ./
COPY files/service/config.json ./config/local.json
COPY files/service/odk-cmd /usr/bin

EXPOSE 8383


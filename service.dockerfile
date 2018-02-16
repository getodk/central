FROM node:carbon

WORKDIR /usr/odk

COPY server/package*.json ./
RUN npm install

COPY server/ ./
COPY files/service/scripts/ ./
COPY files/service/config.json ./config/local.json

EXPOSE 8383

VOLUME [ "/usr/odk" ]


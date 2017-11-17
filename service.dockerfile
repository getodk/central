FROM node:carbon

WORKDIR /usr/odk

COPY server/package*.json ./
RUN npm install

COPY server/ ./
COPY scripts/ ./
COPY config/service.json ./config/local.json

EXPOSE 8383

VOLUME [ "/usr/odk" ]


FROM node:20.12.2-slim

WORKDIR /workspace

COPY ./mock-http-server .
RUN npm install
ENTRYPOINT ["npm", "run", "start"]

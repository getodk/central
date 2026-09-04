FROM node:24.20.0-slim

WORKDIR /workspace

COPY ./mock-http-server .
RUN npm clean-install
ENTRYPOINT ["npm", "run", "start"]

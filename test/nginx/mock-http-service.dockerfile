FROM node:22.21.0-slim

WORKDIR /workspace

COPY ./mock-http-server .
RUN npm clean-install
ENTRYPOINT ["npm", "run", "start"]

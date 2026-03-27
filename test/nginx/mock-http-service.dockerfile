FROM node:24.14.1-slim

WORKDIR /workspace

COPY ./mock-http-server .
RUN npm clean-install
ENTRYPOINT ["npm", "run", "start"]

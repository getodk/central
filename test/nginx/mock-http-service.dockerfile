FROM node:26.13.1-slim

WORKDIR /workspace

COPY ./mock-http-server .
RUN npm clean-install --no-audit
ENTRYPOINT ["npm", "run", "start"]

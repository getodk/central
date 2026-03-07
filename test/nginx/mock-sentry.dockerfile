FROM node:24.13.0-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

COPY ./mock-sentry .
RUN npm clean-install
ENTRYPOINT ["npm", "run", "start"]

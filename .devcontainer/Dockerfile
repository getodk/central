ARG node_version=22.14.0



FROM node:${node_version}-slim AS pgdg
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        gpg \
    && rm -rf /var/lib/apt/lists/* \
    && update-ca-certificates
RUN echo "deb http://apt.postgresql.org/pub/repos/apt/ $(grep -oP 'VERSION_CODENAME=\K\w+' /etc/os-release)-pgdg main" \
      | tee /etc/apt/sources.list.d/pgdg.list \
    && curl https://www.postgresql.org/media/keys/ACCC4CF8.asc \
      | gpg --dearmor > /etc/apt/trusted.gpg.d/apt.postgresql.org.gpg



# Use regular image instead of slim
FROM node:${node_version}

ARG node_version
LABEL org.opencontainers.image.source="https://github.com/getodk/central"

COPY --from=pgdg /etc/apt/sources.list.d/pgdg.list \
    /etc/apt/sources.list.d/pgdg.list
COPY --from=pgdg /etc/apt/trusted.gpg.d/apt.postgresql.org.gpg \
    /etc/apt/trusted.gpg.d/apt.postgresql.org.gpg
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        gpg \
        cron \
        wait-for-it \
        procps \
        postgresql-client-14 \
        netcat-traditional \
        git \
        make \
        nginx \
    && rm -rf /var/lib/apt/lists/*

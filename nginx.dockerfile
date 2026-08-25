FROM node:24.16.0-slim AS intermediate

ARG FRONTEND_BUILD_MODE
ARG FRONTEND_VERSION

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        git \
    && rm -rf /var/lib/apt/lists/*

COPY ./ ./

RUN files/prebuild/write-version.sh
RUN files/prebuild/build-frontend.sh



# When upgrading:
#
# 1. Use full-length tag, including nginx version.  See:
#    * https://github.com/JonasAlfredsson/docker-nginx-certbot/blob/master/docs/dockerhub_tags.md
#    * https://hub.docker.com/r/jonasal/nginx-certbot/tags
# 2. Look for upstream changes to redirector.conf
# 3. Confirm setup-odk.sh strips out HTTP-01 ACME challenge location.
FROM jonasal/nginx-certbot:6.2.0-nginx1.31.2

EXPOSE 80
EXPOSE 443

# Persist Diffie-Hellman parameters and/or selfsign key
VOLUME [ "/etc/dh", "/etc/selfsign" ]

RUN apt-get update && apt-get install -y netcat-openbsd

RUN mkdir -p /usr/share/odk/nginx/

COPY files/nginx/setup-odk.sh \
     files/shared/envsub.awk \
     /scripts/

COPY files/nginx/redirector.conf /usr/share/odk/nginx/
COPY files/nginx/common-headers.conf /usr/share/odk/nginx/
COPY files/nginx/robots.txt /usr/share/nginx/html
COPY --from=intermediate dist/ /usr/share/nginx/html
COPY --from=intermediate /tmp/version.txt /usr/share/nginx/html

ENTRYPOINT [ "/scripts/setup-odk.sh" ]

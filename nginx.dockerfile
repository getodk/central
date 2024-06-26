FROM node:20.12.2-slim as intermediate

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        git \
        gettext-base \
    && rm -rf /var/lib/apt/lists/*

COPY ./ ./
RUN files/prebuild/write-version.sh
RUN files/prebuild/build-frontend.sh



# when upgrading, look for upstream changes to redirector.conf
# also, confirm setup-odk.sh strips out HTTP-01 ACME challenge location
FROM jonasal/nginx-certbot:5.0.1

EXPOSE 80
EXPOSE 443

# Persist Diffie-Hellman parameters and/or selfsign key
VOLUME [ "/etc/dh", "/etc/selfsign" ]

RUN apt-get update && apt-get install -y netcat-openbsd

RUN mkdir -p /usr/share/odk/nginx/

COPY files/nginx/setup-odk.sh /scripts/
RUN chmod +x /scripts/setup-odk.sh

COPY --from=intermediate client/dist/ /usr/share/nginx/html
COPY --from=intermediate /tmp/version.txt /usr/share/nginx/html

ENTRYPOINT [ "/scripts/setup-odk.sh" ]

FROM node:16.19.1 as intermediate

COPY ./ ./
RUN files/prebuild/write-version.sh
RUN files/prebuild/build-frontend.sh

# when upgrading, look for upstream changes to redirector.conf
# also, confirm setup-odk.sh strips out HTTP-01 ACME challenge location
FROM jonasal/nginx-certbot:4.2.0

EXPOSE 80
EXPOSE 443

ENTRYPOINT [ "/bin/bash", "/scripts/setup-odk.sh" ]

RUN apt-get update && apt-get install -y netcat-openbsd

# use bash for expansion
RUN bash -c 'mkdir -p /etc/odk/nginx/{selfsign,customssl,conf}'

# remove old configs to prevent upgrade conflicts
RUN rm -rf /etc/odk/nginx/conf/*
RUN rm -rf /etc/nginx/conf.d/*

COPY files/nginx/setup-odk.sh /scripts/
COPY files/local/customssl/*.pem /etc/odk/nginx/customssl/
COPY files/nginx/*.conf* /etc/odk/nginx/conf/

COPY --from=intermediate client/dist/ /usr/share/nginx/html
COPY --from=intermediate /tmp/version.txt /usr/share/nginx/html
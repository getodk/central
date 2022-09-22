FROM node:16.17.0 as intermediate

COPY ./ ./
RUN files/prebuild/write-version.sh
RUN files/prebuild/build-frontend.sh

# make sure you have updated *.conf files when upgrading this
FROM jonasal/nginx-certbot:2.4.1

EXPOSE 80
EXPOSE 443

VOLUME [ "/etc/dh", "/etc/selfsign", "/etc/nginx/conf.d" ]
ENTRYPOINT [ "/bin/bash", "/scripts/odk-setup.sh" ]

RUN apt-get update; apt-get install -y openssl netcat nginx-extras lua-zlib

RUN mkdir -p /etc/selfsign/live/local/
COPY files/nginx/odk-setup.sh /scripts/

COPY files/local/customssl/*.pem /etc/customssl/live/local/

COPY files/nginx/default /etc/nginx/sites-enabled/
COPY files/nginx/inflate_body.lua /usr/share/nginx/
COPY files/nginx/odk.conf.template /usr/share/nginx/
COPY files/nginx/common-headers.nginx.conf /usr/share/nginx/
COPY files/nginx/certbot.conf /usr/share/nginx/
COPY files/nginx/redirector.conf /usr/share/nginx/
COPY --from=intermediate client/dist/ /usr/share/nginx/html/
COPY --from=intermediate /tmp/version.txt /usr/share/nginx/html/

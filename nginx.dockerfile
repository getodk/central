FROM node:carbon as intermediate

COPY ./ ./
RUN files/prebuild/write-version.sh
RUN files/prebuild/build-frontend.sh


FROM staticfloat/nginx-certbot:latest

EXPOSE 80
EXPOSE 443

VOLUME [ "/etc/dh", "/etc/selfsign", "/etc/nginx/conf.d" ]
ENTRYPOINT [ "/bin/bash", "/scripts/odk-setup.sh" ]

RUN apt-get update; apt-get install -y openssl netcat nginx-extras lua-zlib

RUN mkdir -p /etc/selfsign/live/local
COPY files/nginx/odk-setup.sh /scripts

COPY files/local/customssl/*.pem /etc/customssl/live/local/

COPY files/nginx/odk.conf.template /usr/share/nginx
COPY files/nginx/inflate_body.lua /usr/share/nginx
COPY files/nginx/default /etc/nginx/sites-enabled/
COPY --from=intermediate client/ /usr/share/nginx/html
COPY --from=intermediate /tmp/version.txt /usr/share/nginx/html/


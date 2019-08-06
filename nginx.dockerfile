FROM node:carbon as intermediate

COPY ./ ./
RUN files/prebuild/write-version.sh
RUN files/prebuild/build-frontend.sh


FROM staticfloat/nginx-certbot@sha256:a3fff8a1d75ae2b28d8e77d71468bc51bf98588c4762c6c7d7c55e0e548e6976

EXPOSE 80
EXPOSE 443

VOLUME [ "/etc/dh", "/etc/selfsign", "/etc/nginx/conf.d" ]
ENTRYPOINT [ "/bin/bash", "/scripts/odk-setup.sh" ]

RUN apt-get update; apt-get install -y openssl netcat nginx-extras lua-zlib

RUN mkdir -p /etc/selfsign/live/local
COPY files/nginx/odk-setup.sh /scripts

COPY files/local/customssl/*.pem /etc/customssl/live/local/

COPY files/nginx/default /etc/nginx/sites-enabled/
COPY files/nginx/inflate_body.lua /usr/share/nginx
COPY files/nginx/odk.conf.template /usr/share/nginx
COPY files/nginx/run_certbot.sh /scripts/
COPY --from=intermediate client/ /usr/share/nginx/html
COPY --from=intermediate /tmp/version.txt /usr/share/nginx/html/


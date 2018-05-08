FROM alpine/git as intermediate

COPY ./ ./
RUN files/prebuild/write-version.sh


FROM staticfloat/nginx-certbot

EXPOSE 80
EXPOSE 443

VOLUME [ "/etc/dh", "/etc/selfsign", "/etc/nginx/conf.d" ]
ENTRYPOINT [ "/bin/bash", "/scripts/odk-setup.sh" ]

RUN apt-get update; apt-get install -y openssl netcat

RUN mkdir -p /etc/selfsign/live/local
COPY files/nginx/odk-setup.sh /scripts

COPY client/ /usr/share/nginx/html
COPY files/nginx/odk.conf.template /usr/share/nginx

COPY --from=intermediate /tmp/version.txt /usr/share/nginx/html/


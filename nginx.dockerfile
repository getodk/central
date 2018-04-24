FROM staticfloat/nginx-certbot

COPY client/ /usr/share/nginx/html
COPY files/nginx/odk.conf.template /usr/share/nginx
COPY version* /usr/share/nginx/html/

RUN apt-get update; apt-get install -y openssl

RUN mkdir -p /etc/selfsign/live/local
COPY files/nginx/odk-setup.sh /scripts

EXPOSE 80
EXPOSE 443

VOLUME [ "/etc/dh", "/etc/selfsign" ]

ENTRYPOINT [ "/bin/bash", "/scripts/odk-setup.sh" ]


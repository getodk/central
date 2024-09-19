#
# KEEP THIS FILE AS CLOSE AS POSSIBLE TO ../nginx.dockerfile
#
# It is ESPECIALLY IMPORTANT to keep IDENTICAL BASE IMAGES.
#
FROM jonasal/nginx-certbot:5.0.1

EXPOSE 80
EXPOSE 443

# Persist Diffie-Hellman parameters and/or selfsign key
VOLUME [ "/etc/dh", "/etc/selfsign" ]

RUN apt-get update && apt-get install -y netcat-openbsd

RUN mkdir -p /usr/share/odk/nginx/

COPY files/nginx/setup-odk.sh /scripts/
RUN chmod +x /scripts/setup-odk.sh

COPY files/nginx/redirector.conf /usr/share/odk/nginx/
COPY files/nginx/common-headers.conf /usr/share/odk/nginx/

COPY ./test/files/nginx-test/http_root/ /usr/share/nginx/html
COPY ./test/files/nginx-test/acme-challenge /var/www/letsencrypt/
RUN ls /var/www/letsencrypt/

ENTRYPOINT [ "/scripts/setup-odk.sh" ]

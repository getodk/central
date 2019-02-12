FROM node:carbon as intermediate

COPY ./ ./
RUN files/prebuild/write-version.sh
RUN files/prebuild/build-frontend.sh


FROM nginx:latest

ENTRYPOINT [ "/bin/bash", "/scripts/odk-setup.sh" ]

RUN apt-get update; apt-get install -y openssl netcat

RUN mkdir /scripts
COPY files/nginx/odk-setup.sh /scripts
RUN rm /etc/nginx/conf.d/default.conf

COPY files/nginx/odk.conf.template /etc/nginx/conf.d/odk.conf
COPY --from=intermediate client/ /usr/share/nginx/html
COPY --from=intermediate /tmp/version.txt /usr/share/nginx/html/


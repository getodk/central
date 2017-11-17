FROM marvambass/nginx-ssl-secure

COPY client/ /usr/share/nginx/html
COPY config/nginx /etc/nginx/external

EXPOSE 443


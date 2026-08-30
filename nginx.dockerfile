FROM node:24.16.0-slim AS intermediate

ARG FRONTEND_BUILD_MODE
ARG FRONTEND_VERSION

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        git \
    && rm -rf /var/lib/apt/lists/*

COPY ./ ./

RUN files/prebuild/write-version.sh
RUN files/prebuild/build-frontend.sh



# When upgrading:
#
# 1. Use full-length tag, including nginx version.  See:
#    * https://github.com/JonasAlfredsson/docker-nginx-certbot/blob/master/docs/dockerhub_tags.md
#    * https://hub.docker.com/r/jonasal/nginx-certbot/tags
# 2. Look for upstream changes to redirector.conf
# 3. Confirm setup-odk.sh strips out HTTP-01 ACME challenge location.
FROM jonasal/nginx-certbot:6.2.0-nginx1.31.2

EXPOSE 80
EXPOSE 443

# Persist Diffie-Hellman parameters and/or selfsign key
VOLUME [ "/etc/dh", "/etc/selfsign" ]

RUN apt-get update && apt-get install -y netcat-openbsd

RUN mkdir -p /usr/share/odk/nginx/

COPY files/nginx/setup-odk.sh \
     files/shared/envsub.awk \
     /scripts/

COPY files/nginx/redirector.conf /usr/share/odk/nginx/
COPY files/nginx/common-headers.conf /usr/share/odk/nginx/
COPY files/nginx/robots.txt /usr/share/nginx/html
COPY --from=intermediate dist/ /usr/share/nginx/html
COPY --from=intermediate /tmp/version.txt /usr/share/nginx/html

# Add a Studio entry to Central's navbar by referencing a script from its
# index.html. This is done here, at build time, rather than with nginx's
# sub_filter: sub_filter strips ETag and Last-Modified from every response it
# touches, which would cost Central's main page its revalidation caching.
# The mock frontend used by the nginx tests has no <head>, so it is skipped.
RUN if grep -q 'central-nav.js' /usr/share/nginx/html/index.html; then \
      echo "[nginx] Studio navbar link already present"; \
    elif grep -q '</head>' /usr/share/nginx/html/index.html; then \
      sed -i 's#</head>#  <script src="/studio/static/central-nav.js" defer></script>\n  </head>#' \
        /usr/share/nginx/html/index.html; \
      echo "[nginx] Studio navbar link injected into index.html"; \
    else \
      echo "[nginx] no </head> in index.html; Studio navbar link not injected"; \
    fi

ENTRYPOINT [ "/scripts/setup-odk.sh" ]

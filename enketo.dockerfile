FROM ghcr.io/enketo/enketo:7.5.1

ENV ENKETO_SRC_DIR=/srv/src/enketo/packages/enketo-express
WORKDIR ${ENKETO_SRC_DIR}

# we copy the config template twice. eventually we do want to actually template
# it for the sake of the running server, and we can't do this until the container
# is actually running (volumes aren't available on image build). but there are
# also some static values that the client needs to see, and it doesn't in turn
# care about anything the server needs. because the client config is baked at
# build time, we therefore hand it the untemplated config.

COPY files/shared/envsub.awk /scripts/
COPY files/enketo/config.json.template ${ENKETO_SRC_DIR}/config/config.json.template
COPY files/enketo/config.json.template ${ENKETO_SRC_DIR}/config/config.json
COPY files/enketo/start-enketo.sh ${ENKETO_SRC_DIR}/start-enketo.sh

EXPOSE 8005

CMD ["./start-enketo.sh"]

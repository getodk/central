ARG IMAGE
FROM "${IMAGE}"

ENV ENKETO_SRC_DIR=/srv/src/enketo/packages/enketo-express
WORKDIR ${ENKETO_SRC_DIR}

COPY files/shared/envsub.awk /scripts/
COPY files/enketo/config.json.template ${ENKETO_SRC_DIR}/config/config.json.template
COPY files/enketo/config.json.template ${ENKETO_SRC_DIR}/config/config.json
COPY files/enketo/start-enketo.sh ${ENKETO_SRC_DIR}/start-enketo.sh

CMD ["./start-enketo.sh"]

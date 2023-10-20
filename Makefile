.PHONY: for-central-dev
for-central-dev:
	docker compose --profile central -f docker-compose.yml -f docker-compose.dev.yml up -d

.PHONY: for-enketo-dev
for-enketo-dev:
	docker compose --profile enketo -f docker-compose.yml -f docker-compose.dev.yml up -d

.PHONY: stop
stop:
	docker compose stop

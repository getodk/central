.PHONY: for-central-dev
for-central-dev:
	docker compose --profile secrets -f docker-compose.yml -f docker-compose.dev.yml up
	docker compose --profile central -f docker-compose.yml -f docker-compose.dev.yml up -d

.PHONY: for-enketo-dev
for-enketo-dev:
	docker compose --profile secrets -f docker-compose.yml -f docker-compose.dev.yml up
	docker compose --profile enketo -f docker-compose.yml -f docker-compose.dev.yml up -d

.PHONE: upgrade-successful
upgrade-successful:
	docker compose exec postgres14 touch /var/lib/odk/postgresql/14/.postgres14-upgrade-successful

.PHONY: stop
stop:
	docker compose stop

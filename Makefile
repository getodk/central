.PHONY: dev
dev:
	docker compose --profile central -f docker-compose.yml -f docker-compose.dev.yml up -d
	docker compose exec postgres14 touch /var/lib/odk/postgresql/14/.postgres14-upgrade-successful

.PHONY: stop
stop:
	docker compose stop

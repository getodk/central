.PHONY: dev
dev:
	docker compose --profile central -f docker-compose.yml -f docker-compose.dev.yml up -d

.PHONY: stop
stop:
	docker compose stop

docker-compose-dev := docker compose --profile central -f docker-compose.yml -f docker-compose.dev.yml

.PHONY: dev
dev:
	$(docker-compose-dev) up --detach --build

.PHONY: stop
stop:
	$(docker-compose-dev) stop

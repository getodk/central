docker-compose-dev := docker compose --profile central -f docker-compose.yml -f docker-compose.dev.yml

.PHONY: dev
dev:
	$(docker-compose-dev) up -d

.PHONY: stop
stop:
	$(docker-compose-dev) stop

.PHONY: release
release:
	@printf "Enter version number: "; \
	read VERSION; \
	sed -E -e "s/{{SNAPSHOT}}/$$VERSION/" docker-compose.yml; \
	git tag "$$VERSION"; \
	git push --tags

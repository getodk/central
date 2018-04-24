all:
	{ echo "versions:"; git rev-parse HEAD; git submodule; } > version.txt
	docker-compose build

